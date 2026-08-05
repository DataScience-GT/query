import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleDB } from "../client";
import { members } from "../schemas/members";
import { stripePayments, userAccountLinks } from "../schemas/stripe";

/**
 * Membership rules, in one place.
 *
 * These live in @query/db rather than @query/api because @query/api depends on
 * @query/auth, so auth cannot import back from it — and linking has to happen
 * at sign-in, inside auth. Keeping the logic here is what lets the sign-in
 * hook, the tRPC router and the Stripe webhook all run the same code instead
 * of the three near-copies that drifted apart before.
 */

/**
 * Called after a membership is granted so caches can be evicted.
 *
 * Inverted rather than imported: the cache lives in @query/api, and @query/api
 * already depends on @query/auth, so neither can import it here. Without this,
 * a membership granted during sign-in sat behind a "not a member" entry with a
 * 5-minute TTL — the member signs in, pays, and is still told to pay.
 */
let onMembershipChanged: ((userId: string) => void) | undefined;

export const setMembershipChangeHandler = (
  handler: (userId: string) => void,
) => {
  onMembershipChanged = handler;
};

const notifyMembershipChanged = (userId: string) => {
  try {
    onMembershipChanged?.(userId);
  } catch {
    // Cache eviction must never fail the write that succeeded.
  }
};

/**
 * The hackathon a membership belongs to when nobody names one: the edition
 * actually running, and only once nothing is running the newest by start date.
 * Next year's edition is drafted long before it runs, so ordering by start date
 * alone hands every membership to a future draft the day staff create it.
 */
export async function resolveCurrentHackathonId(
  db: DrizzleDB,
): Promise<string | undefined> {
  const now = new Date();

  const inProgress = await db.query.hackathons.findFirst({
    where: (h, { and: andFn, ne, lte, gte }) =>
      andFn(ne(h.status, "draft"), lte(h.startDate, now), gte(h.endDate, now)),
    columns: { id: true },
  });

  const resolved =
    inProgress ??
    (await db.query.hackathons.findFirst({
      orderBy: (h, { desc }) => [desc(h.startDate)],
      columns: { id: true },
    }));

  return resolved?.id;
}

/**
 * Whether a stored payment's metadata says the bootcamp add-on was bought.
 * Metadata is a JSON string written by whichever path recorded the payment,
 * and older rows predate the field entirely, so anything unparseable is "no".
 */
export const paidForBootcamp = (metadata: string | null | undefined) => {
  if (!metadata) return false;
  try {
    return (JSON.parse(metadata) as { bootcamp?: string }).bootcamp === "true";
  } catch {
    return false;
  }
};

/**
 * Exported so no caller hand-rolls it. A copied version in the Stripe webhook
 * lost a backslash and split on the letter "s" rather than whitespace, storing
 * "Chris Smith" as firstName "Chri", lastName " Smith".
 */
export const splitName = (name: string | null | undefined) => {
  const parts = (name || "Member").trim().split(/\s+/);
  return {
    firstName: parts[0] || "Member",
    lastName: parts.slice(1).join(" ") || "Member",
  };
};

export async function createOrUpdateMembership(
  db: DrizzleDB,
  opts: {
    userId: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string | null;
    hackathonId?: string;
    /**
     * Whether this payment included the bootcamp add-on. Only ever upgrades:
     * renewing without it should not silently strip access someone already
     * paid for, so the flag is sticky once set.
     */
    bootcampMember?: boolean;
  },
) {
  const hackathonId =
    opts.hackathonId ?? (await resolveCurrentHackathonId(db));

  if (!hackathonId) {
    throw new Error("No hackathon found for membership assignment");
  }

  const existing = await db.query.members.findFirst({
    where: and(
      eq(members.userId, opts.userId),
      eq(members.hackathonId, hackathonId),
    ),
  });

  const now = new Date();

  /**
   * A membership is one paid year. Renewing early has to *extend* the term, so
   * the new year starts where the old one ends — measuring from today instead
   * would silently throw away whatever time was left, and someone who renews a
   * month early would have paid to lose a month.
   *
   * A lapsed membership restarts from today; there is no credit for the gap.
   */
  const termStart =
    existing?.membershipEndDate && existing.membershipEndDate > now
      ? existing.membershipEndDate
      : now;
  const termEnd = new Date(termStart);
  termEnd.setFullYear(termEnd.getFullYear() + 1);

  if (existing) {
    await db
      .update(members)
      .set({
        isActive: true,
        membershipEndDate: termEnd,
        renewalCount: existing.renewalCount + 1,
        memberType: "continuous",
        phoneNumber: opts.phoneNumber || existing.phoneNumber,
        bootcampMember: existing.bootcampMember || !!opts.bootcampMember,
        updatedAt: now,
      })
      .where(eq(members.id, existing.id));
    return;
  }

  await db.insert(members).values({
    userId: opts.userId,
    hackathonId,
    firstName: opts.firstName,
    lastName: opts.lastName,
    memberType: "new",
    isActive: true,
    membershipStartDate: now,
    membershipEndDate: termEnd,
    renewalCount: 0,
    phoneNumber: opts.phoneNumber ?? null,
    bootcampMember: !!opts.bootcampMember,
  });
}

export type LinkOutcome =
  | { linked: false; reason: "no-email" | "already-linked" | "no-payment" }
  | { linked: true; paymentId: string };

/**
 * Claims a paid-but-unlinked Stripe payment for a user whose email the identity
 * provider already verified, and grants the membership it paid for.
 *
 * Email is sufficient proof *here* and nowhere else: this runs against the
 * address on the signed-in account, which Google/GitHub verified or which a
 * mailbox round-trip proved. The manual linkAccount form takes a typed address
 * instead, which proves nothing, and so demands a name match as well.
 *
 * Safe to call on every sign-in: it no-ops when the user is already linked or
 * no unlinked payment matches.
 */
export async function linkPaidPaymentByVerifiedEmail(
  db: DrizzleDB,
  opts: { userId: string; email: string | null | undefined; name?: string | null },
): Promise<LinkOutcome> {
  if (!opts.email) return { linked: false, reason: "no-email" };

  // customerEmail is stored lowercased by every writer, so the comparison has
  // to be too — an account with a capitalised address matched nothing before.
  const email = opts.email.trim().toLowerCase();

  const alreadyLinked = await db.query.userAccountLinks.findFirst({
    where: eq(userAccountLinks.userId, opts.userId),
    columns: { id: true },
  });
  if (alreadyLinked) return { linked: false, reason: "already-linked" };

  const payment = await db.query.stripePayments.findFirst({
    where: and(
      eq(stripePayments.customerEmail, email),
      isNull(stripePayments.linkedUserId),
      eq(stripePayments.paymentStatus, "paid"),
    ),
  });
  if (!payment) return { linked: false, reason: "no-payment" };

  const { firstName, lastName } = splitName(opts.name ?? payment.customerName);

  /**
   * Claim the payment first, and only then write the link row.
   *
   * The reverse order strands the user permanently: the link row is what makes
   * this function report "already-linked", so if it exists while the claim
   * failed, every later sign-in short-circuits and the membership is never
   * granted — with no way for the person to retry.
   *
   * `linkedUserId is null` carries the read above into the write, so two
   * sign-ins racing for the same payment cannot both claim it; the loser
   * matches no row and simply reports nothing to link.
   */
  const claimed = await db
    .update(stripePayments)
    .set({
      linkedUserId: opts.userId,
      linkedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripePayments.id, payment.id),
        isNull(stripePayments.linkedUserId),
      ),
    );

  if (claimed.rowCount === 0) return { linked: false, reason: "no-payment" };

  await db.insert(userAccountLinks).values({
    userId: opts.userId,
    stripePaymentId: payment.id,
    providedFirstName: firstName,
    providedLastName: lastName,
    providedEmail: email,
  });

  await createOrUpdateMembership(db, {
    userId: opts.userId,
    firstName,
    lastName,
    // What they paid for is recorded on the payment, so the add-on survives
    // being claimed later by the sign-in hook or the backfill.
    bootcampMember: paidForBootcamp(payment.metadata),
  });

  notifyMembershipChanged(opts.userId);

  return { linked: true, paymentId: payment.id };
}
