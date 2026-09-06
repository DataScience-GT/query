import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleDB } from "../client";
import { members, membershipHistory } from "../schemas/members";
import { PRE_CURRENT_STATUSES } from "../schemas/hackathons";
import { stripePayments, userAccountLinks } from "../schemas/stripe";

// Membership rules, in one place. Here rather than @query/api because
// @query/api depends on @query/auth, and linking has to happen at sign-in —
// so this is what lets the sign-in hook, the router and the Stripe webhook
// run the same code instead of three copies that drifted apart.

// Called after a membership is granted so caches can be evicted. Inverted
// rather than imported: the cache lives in @query/api, which already depends
// on @query/auth. Without it a membership granted at sign-in sat behind a
// "not a member" entry for 5 minutes — pay, and still be told to pay.
class MembershipChangeNotifier {
  private handler: ((userId: string) => void) | undefined;

  subscribe(handler: (userId: string) => void) {
    this.handler = handler;
  }

  emit(userId: string) {
    try {
      this.handler?.(userId);
    } catch {
      // Cache eviction must never fail the write that succeeded.
    }
  }
}

const membershipChanges = new MembershipChangeNotifier();

export const setMembershipChangeHandler = (
  handler: (userId: string) => void,
) => membershipChanges.subscribe(handler);

const notifyMembershipChanged = (userId: string) =>
  membershipChanges.emit(userId);

// The hackathon a membership belongs to when nobody names one: the edition
// actually running, and only if nothing is running the newest by start date.
// Ordering by start date alone hands every membership to next year's draft
// the day staff create it.
export async function resolveCurrentHackathonId(
  db: DrizzleDB,
): Promise<string | undefined> {
  const now = new Date();

  const inProgress = await db.query.hackathons.findFirst({
    where: (h, { and: andFn, notInArray, lte, gte }) =>
      andFn(
        notInArray(h.status, [...PRE_CURRENT_STATUSES]),
        lte(h.startDate, now),
        gte(h.endDate, now),
      ),
    columns: { id: true },
  });

  const resolved =
    inProgress ??
    (await db.query.hackathons.findFirst({
      // The status filter matters most in this branch: the in-progress query can
      // never match a future edition, so an unopened one could only arrive here.
      // Without it, the day staff draft next year's edition every membership read,
      // portal gate and club check-in retargets an edition nobody registered for
      // and every paying member reads as lapsed. An edition joins when it opens.
      where: (h, { notInArray }) =>
        notInArray(h.status, [...PRE_CURRENT_STATUSES]),
      orderBy: (h, { desc }) => [desc(h.startDate)],
      columns: { id: true },
    }));

  return resolved?.id;
}

// Which bootcamp a purchase made today buys into. A membership is a year and
// a bootcamp is a semester, so they cannot share an expiry. Summer sells fall.
export const currentTerm = (now = new Date()) =>
  now.getMonth() <= 4
    ? `${now.getFullYear()}-spring`
    : `${now.getFullYear()}-fall`;

/** Chronological order for `YYYY-spring` / `YYYY-fall` labels. Locale compare puts fall first. */
export const compareTerms = (a: string, b: string) => {
  const [ay = "", as = ""] = a.split("-");
  const [by = "", bs = ""] = b.split("-");
  if (ay !== by) return ay.localeCompare(by);
  const rank = (season: string) =>
    season === "spring" ? 0 : season === "fall" ? 1 : 2;
  return rank(as) - rank(bs);
};

// How long a membership was bought for. A year and a semester are the same
// membership with the same access — only the expiry differs.
export type MembershipPlan = "annual" | "semester";

// Anything that is not "semester" is a year. Payments predate the field and
// Stripe metadata is free-form, so an unreadable value falls back to the plan
// that was the only one on offer when those rows were written.
export const readPlan = (value: string | null | undefined): MembershipPlan =>
  value === "semester" ? "semester" : "annual";

/** The plan a stored payment's JSON metadata bought. */
export const planFromMetadata = (
  metadata: string | null | undefined,
): MembershipPlan => {
  if (!metadata) return "annual";
  try {
    return readPlan((JSON.parse(metadata) as { plan?: string }).plan);
  } catch {
    return "annual";
  }
};

// The end of the semester a date falls in — spring at the end of May, fall at
// the end of December, the same boundary currentTerm draws. Always strictly
// after the date given, so renewing early lands on the next semester's end.
export const semesterEndDate = (from = new Date()) => {
  const endOf = (year: number, month: number, day: number) =>
    new Date(year, month, day, 23, 59, 59, 999);

  const year = from.getFullYear();
  const springEnd = endOf(year, 4, 31); // May 31
  const fallEnd = endOf(year, 11, 31); // Dec 31

  if (from < springEnd) return springEnd;
  if (from < fallEnd) return fallEnd;
  return endOf(year + 1, 4, 31);
};

// Whether a stored payment's metadata says the bootcamp add-on was bought.
// Metadata is a JSON string written by whichever path recorded the payment
// and older rows predate the field, so anything unparseable is "no".
export const paidForBootcamp = (metadata: string | null | undefined) => {
  if (!metadata) return false;
  try {
    return (JSON.parse(metadata) as { bootcamp?: string }).bootcamp === "true";
  } catch {
    return false;
  }
};

// Marks a payment that bought the $10 bootcamp alone. Nine paths grant
// memberships from a stored payment; without this every one reads a paid $10
// row as a bought year, so the marker travels on the payment.
export const BOOTCAMP_ADDON_PAYMENT_TYPE = "bootcamp_addon";

/** Whether a stored payment bought the bootcamp alone, not a membership. */
export const isBootcampAddOnOnly = (metadata: string | null | undefined) => {
  if (!metadata) return false;
  try {
    return (
      (JSON.parse(metadata) as { type?: string }).type ===
      BOOTCAMP_ADDON_PAYMENT_TYPE
    );
  } catch {
    return false;
  }
};

// Exported so no caller hand-rolls it. A copy in the Stripe webhook lost a
// backslash and split on the letter "s", storing "Chris Smith" as firstName
// "Chri", lastName " Smith".
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
    // Whether this payment included the bootcamp add-on. Sticky once set; the
    // term it stamps is not, since access runs out with the semester.
    bootcampMember?: boolean;
    /** Bought the bootcamp alone, so it must not extend the membership year. */
    addOnOnly?: boolean;
    /** How long this payment bought. Defaults to the year. */
    plan?: MembershipPlan;
  },
) {
  // Keyed on the person, not the edition. This used to resolve a "current
  // hackathon" and look for (userId, hackathonId), so on the day the next
  // edition opened an existing member matched nothing, took the insert branch,
  // and had their remaining months replaced by a term starting today — and a
  // payment could not be honoured at all when no edition was open.
  const existing = await db.query.members.findFirst({
    where: eq(members.userId, opts.userId),
  });

  const now = new Date();

  // $10 buys the semester and nothing else — no extra year, no renewal, no
  // history row. No member row means nothing to stamp; doing nothing leaves the
  // paid row for staff rather than minting a year for $10.
  if (opts.addOnOnly) {
    if (!existing) return;

    await db
      .update(members)
      .set({
        bootcampMember: true,
        bootcampTerm: currentTerm(now),
        updatedAt: now,
      })
      .where(eq(members.id, existing.id));
    return;
  }

  // A membership is one paid year or one paid semester. Renewing early extends
  // the term, so the new one starts where the old ends — measuring from today
  // would throw away whatever time was left. A lapsed membership restarts from
  // today; there is no credit for the gap.
  const termStart =
    existing?.membershipEndDate && existing.membershipEndDate > now
      ? existing.membershipEndDate
      : now;

  // The semester plan expires with the semester rather than a fixed number of
  // months out, which is what the bootcamp and the roster already treat as a
  // semester.
  const termEnd =
    opts.plan === "semester"
      ? semesterEndDate(termStart)
      : (() => {
          const end = new Date(termStart);
          end.setFullYear(end.getFullYear() + 1);
          return end;
        })();

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
        // Only a purchase moves the term; a plain renewal leaves last semester's,
        // which is what expires the access.
        bootcampTerm: opts.bootcampMember
          ? currentTerm(now)
          : existing.bootcampTerm,
        updatedAt: now,
      })
      .where(eq(members.id, existing.id));

    // The renewal overwrites membershipEndDate in place, so without this row the
    // previous term leaves no trace. Since a membership is no longer scoped to an
    // edition, this table is the only record of which years somebody was a member.
    await db.insert(membershipHistory).values({
      memberId: existing.id,
      action: "renewed",
      startDate: termStart,
      endDate: termEnd,
    });
    return;
  }

  const [created] = await db
    .insert(members)
    .values({
      userId: opts.userId,
      firstName: opts.firstName,
      lastName: opts.lastName,
      memberType: "new",
      isActive: true,
      membershipStartDate: now,
      membershipEndDate: termEnd,
      renewalCount: 0,
      phoneNumber: opts.phoneNumber ?? null,
      bootcampMember: !!opts.bootcampMember,
      bootcampTerm: opts.bootcampMember ? currentTerm(now) : null,
    })
    .returning({ id: members.id });

  if (created) {
    await db.insert(membershipHistory).values({
      memberId: created.id,
      action: "joined",
      startDate: now,
      endDate: termEnd,
    });
  }
}

export type LinkOutcome =
  | { linked: false; reason: "no-email" | "already-linked" | "no-payment" }
  | { linked: true; paymentId: string };

// Claims a paid-but-unlinked payment for a user whose email the identity
// provider already verified, and grants the membership it paid for. Email is
// sufficient proof here and nowhere else: this runs against the address on
// the signed-in account. The manual linkAccount form takes a typed address,
// which proves nothing, and so demands a name match too. Safe on every
// sign-in: it no-ops when already linked or nothing matches.
export async function linkPaidPaymentByVerifiedEmail(
  db: DrizzleDB,
  opts: { userId: string; email: string | null | undefined; name?: string | null },
): Promise<LinkOutcome> {
  if (!opts.email) return { linked: false, reason: "no-email" };

  // customerEmail is stored lowercased by every writer, so the comparison has
  // to be too — a capitalised address matched nothing before.
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

  // Claim the payment first, then write the link row. The reverse order strands
  // the user permanently: the link row is what makes this report
  // "already-linked", so if it exists while the claim failed, every later
  // sign-in short-circuits and the membership is never granted.
  // `linkedUserId is null` carries the read into the write, so two sign-ins
  // racing for the same payment cannot both claim it.
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
    // What they paid for is recorded on the payment, so the add-on survives being
    // claimed later by the sign-in hook or the backfill.
    bootcampMember: paidForBootcamp(payment.metadata),
    addOnOnly: isBootcampAddOnOnly(payment.metadata),
    plan: planFromMetadata(payment.metadata),
  });

  notifyMembershipChanged(opts.userId);

  return { linked: true, paymentId: payment.id };
}
