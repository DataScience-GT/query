import { and, eq, isNull } from "drizzle-orm";
import { VENUE_TZ } from "@query/core";
import type { DrizzleDB } from "../client";
import { members, membershipHistory } from "../schemas/members";
import { PRE_CURRENT_STATUSES } from "../schemas/hackathons";
import { stripePayments, userAccountLinks } from "../schemas/stripe";
import { entitlementForPayment } from "./pricing";

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
    where: {
      status: { notIn: [...PRE_CURRENT_STATUSES] },
      startDate: { lte: now },
      endDate: { gte: now },
    },
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
      where: { status: { notIn: [...PRE_CURRENT_STATUSES] } },
      orderBy: (h, { desc }) => [desc(h.startDate)],
      columns: { id: true },
    }));

  return resolved?.id;
}

// Year and month in Atlanta. The server runs in UTC, where 8pm Eastern on
// May 31 is already June and would file an evening purchase under fall.
const easternYearMonth = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_TZ,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const part = (type: "year" | "month") =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month") - 1 };
};

// Which bootcamp a purchase made today buys into. A membership is a year and
// a bootcamp is a semester, so they cannot share an expiry. Summer sells fall.
export const currentTerm = (now = new Date()) => {
  const { year, month } = easternYearMonth(now);
  return month <= 4 ? `${year}-spring` : `${year}-fall`;
};

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
// Ends at 23:59:59.999 in Atlanta, not on the server's UTC clock, which cut a
// semester off about four hours early. May 31 always falls in daylight time
// and Dec 31 in standard time, so each boundary has one fixed offset.
export const semesterEndDate = (from = new Date()) => {
  const springEndOf = (year: number) =>
    new Date(`${year}-05-31T23:59:59.999-04:00`);
  const fallEndOf = (year: number) =>
    new Date(`${year}-12-31T23:59:59.999-05:00`);

  const { year } = easternYearMonth(from);
  const springEnd = springEndOf(year);
  const fallEnd = fallEndOf(year);

  // The last six hours of a semester count as the next one. Renewals start
  // from the stored end date, and memberships written before this was Eastern
  // end on the UTC boundary, four or five hours short of these: without the
  // margin, renewing one bought those few hours instead of a semester. It also
  // keeps a purchase on the last evening from buying a few hours.
  const margin = 6 * 60 * 60 * 1000;
  if (from.getTime() < springEnd.getTime() - margin) return springEnd;
  if (from.getTime() < fallEnd.getTime() - margin) return fallEnd;
  return springEndOf(year + 1);
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

type GrantOptions = {
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
};

export async function createOrUpdateMembership(
  db: DrizzleDB,
  opts: GrantOptions,
) {
  // Always inside a transaction (a savepoint when the caller already has one),
  // so the member-row lock taken below is held until the grant is committed
  // rather than released as soon as the read returns.
  await db.transaction((tx) =>
    grantMembership(tx as unknown as DrizzleDB, opts),
  );
}

async function grantMembership(db: DrizzleDB, opts: GrantOptions) {
  // Keyed on the person, not the edition. This used to resolve a "current
  // hackathon" and look for (userId, hackathonId), so on the day the next
  // edition opened an existing member matched nothing, took the insert branch,
  // and had their remaining months replaced by a term starting today — and a
  // payment could not be honoured at all when no edition was open.
  //
  // Locked, so two payments for the same person cannot both read the same end
  // date and both extend from it, which lost one paid term. The second grant
  // waits here and extends from the first one's result.
  const readLocked = async () =>
    (
      await db
        .select()
        .from(members)
        .where(eq(members.userId, opts.userId))
        .for("update")
    )[0];

  let existing = await readLocked();

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
  const termFor = (current: { membershipEndDate: Date | null } | undefined) => {
    const start =
      current?.membershipEndDate && current.membershipEndDate > now
        ? current.membershipEndDate
        : now;

  // The semester plan expires with the semester rather than a fixed number of
  // months out, which is what the bootcamp and the roster already treat as a
  // semester.
    const end =
      opts.plan === "semester"
        ? semesterEndDate(start)
        : (() => {
            const e = new Date(start);
            e.setFullYear(e.getFullYear() + 1);
            return e;
          })();
    return { termStart: start, termEnd: end };
  };

  const extend = async (current: NonNullable<typeof existing>) => {
    const { termStart, termEnd } = termFor(current);
    await db
      .update(members)
      .set({
        isActive: true,
        membershipEndDate: termEnd,
        renewalCount: current.renewalCount + 1,
        memberType: "continuous",
        phoneNumber: opts.phoneNumber || current.phoneNumber,
        bootcampMember: current.bootcampMember || !!opts.bootcampMember,
        // Only a purchase moves the term; a plain renewal leaves last semester's,
        // which is what expires the access.
        bootcampTerm: opts.bootcampMember
          ? currentTerm(now)
          : current.bootcampTerm,
        updatedAt: now,
      })
      .where(eq(members.id, current.id));

    // The renewal overwrites membershipEndDate in place, so without this row the
    // previous term leaves no trace. Since a membership is no longer scoped to an
    // edition, this table is the only record of which years somebody was a member.
    await db.insert(membershipHistory).values({
      memberId: current.id,
      action: "renewed",
      startDate: termStart,
      endDate: termEnd,
    });
  };

  if (existing) {
    await extend(existing);
    return;
  }

  const { termEnd } = termFor(undefined);

  // A concurrent first grant for the same person can commit between the locked
  // read and this insert. unique_member_per_user would fail the second one and
  // lose its payment, so take the conflict as "someone joined first", re-read
  // their row under the lock and extend it instead.
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
    .onConflictDoNothing({ target: members.userId })
    .returning({ id: members.id });

  if (!created) {
    existing = await readLocked();
    if (existing) await extend(existing);
    return;
  }

  await db.insert(membershipHistory).values({
    memberId: created.id,
    action: "joined",
    startDate: now,
    endDate: termEnd,
  });
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
    where: { userId: opts.userId },
    columns: { id: true },
  });
  if (alreadyLinked) return { linked: false, reason: "already-linked" };

  // Only a payment whose amount buys something is claimable. A $1 payment link
  // or an odd Dashboard charge is skipped rather than linked, so it can neither
  // be granted as a year nor use up the account's one link ahead of a real
  // payment.
  const candidates = await db.query.stripePayments.findMany({
    where: {
      customerEmail: email,
      linkedUserId: { isNull: true },
      paymentStatus: "paid",
    },
  });
  const payment = candidates.find((row) => entitlementForPayment(row));
  const entitlement = payment && entitlementForPayment(payment);
  if (!payment || !entitlement) return { linked: false, reason: "no-payment" };

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
    bootcampMember: entitlement.bootcamp,
    addOnOnly: entitlement.addOnOnly,
    plan: entitlement.plan,
  });

  notifyMembershipChanged(opts.userId);

  return { linked: true, paymentId: payment.id };
}
