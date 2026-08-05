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

const splitName = (name: string | null | undefined) => {
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
  const oneYearFromNow = new Date(now);
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  if (existing) {
    await db
      .update(members)
      .set({
        isActive: true,
        membershipStartDate: now,
        membershipEndDate: oneYearFromNow,
        renewalCount: existing.renewalCount + 1,
        memberType: "continuous",
        phoneNumber: opts.phoneNumber || existing.phoneNumber,
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
    membershipEndDate: oneYearFromNow,
    renewalCount: 0,
    phoneNumber: opts.phoneNumber ?? null,
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

  await db.insert(userAccountLinks).values({
    userId: opts.userId,
    stripePaymentId: payment.id,
    providedFirstName: firstName,
    providedLastName: lastName,
    providedEmail: email,
  });

  // `linkedUserId is null` carries the read above into the write, so two
  // sign-ins racing for the same payment cannot both claim it.
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

  if (claimed.rowCount === 0) {
    throw new Error("Payment was linked by a concurrent request");
  }

  await createOrUpdateMembership(db, {
    userId: opts.userId,
    firstName,
    lastName,
  });

  return { linked: true, paymentId: payment.id };
}
