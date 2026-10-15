import { randomInt } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  hackathonEvents,
  hackathonEventAttendees,
  hackathonParticipants,
  hackathonPointAdjustments,
  hackathonStorePurchases,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isUniqueViolation } from "../middleware/db-errors";

// Hackathon points. No balance is stored anywhere: every number here is a sum
// over the rows that explain it (the comment on packages/db/src/schemas/points.ts
// has the rule), so the arithmetic lives in one place and every reader goes
// through it.

/** A transaction handle from `db.transaction`. */
export type PointsTx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

/** Either the pool or a transaction. */
export type PointsDb = DrizzleDB | PointsTx;

export type AttendanceMethod = "scan" | "code" | "manual";

/** The three sums a balance is made of. */
export type PointsTotals = {
  /** Event points, as copied onto each attendance row. */
  awarded: number;
  /** Staff adjustments, either sign. */
  adjusted: number;
  /** Purchases that have not been voided. */
  spent: number;
};

export type PointsBalance = {
  earned: number;
  spent: number;
  available: number;
};

const NO_TOTALS: PointsTotals = { awarded: 0, adjusted: 0, spent: 0 };

export function pointsBalance({
  awarded,
  adjusted,
  spent,
}: PointsTotals): PointsBalance {
  const earned = awarded + adjusted;
  // A deduction after a purchase can leave spending above what was earned.
  // The purchase stands; there is simply nothing left to spend.
  return { earned, spent, available: Math.max(0, earned - spent) };
}

/** Totals from ledger rows as read. A null award predates points and is 0. */
export function ledgerTotals(ledger: {
  attendance: readonly { pointsAwarded: number | null }[];
  adjustments: readonly { delta: number }[];
  purchases: readonly { total: number; voidedAt: Date | null }[];
}): PointsTotals {
  let awarded = 0;
  for (const row of ledger.attendance) awarded += row.pointsAwarded ?? 0;
  let adjusted = 0;
  for (const row of ledger.adjustments) adjusted += row.delta;
  let spent = 0;
  for (const row of ledger.purchases) if (!row.voidedAt) spent += row.total;
  return { awarded, adjusted, spent };
}

// ---------------------------------------------------------------------------
// Store

type Stocked = { stock: number | null; soldOut: boolean };

/** Null stock means nobody is counting, and then the soldOut switch decides. */
export function canSupply(item: Stocked, quantity: number): boolean {
  return item.stock === null ? !item.soldOut : item.stock >= quantity;
}

/** Gone, whether counted down to zero or switched off by hand. */
export function isSoldOut(item: Stocked): boolean {
  return !canSupply(item, 1);
}

/** The "N more points" a hacker needs before they can afford something. */
export function pointsShort(price: number, available: number): number {
  return Math.max(0, price - available);
}

// ---------------------------------------------------------------------------
// Names and the leaderboard

export type NameSource = {
  firstName: string | null;
  lastName: string | null;
  /** The account's display name, for registrations without name fields. */
  accountName: string | null;
};

/**
 * First and last name from the registration, or split from the account name
 * when the registration left them blank.
 */
export function personName(source: NameSource): {
  first: string;
  last: string;
} {
  const first = source.firstName?.trim() ?? "";
  if (first) return { first, last: source.lastName?.trim() ?? "" };

  const words = (source.accountName ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: words[0] ?? "", last: words.slice(1).join(" ") };
}

/** "Ada L." — what other hackers see on the leaderboard. */
export function leaderboardName(name: { first: string; last: string }): string {
  const initial = Array.from(name.last)[0]?.toUpperCase();
  if (!name.first) return initial ? `${initial}.` : "Hacker";
  return initial ? `${name.first} ${initial}.` : name.first;
}

/** Full name for staff screens and purchase snapshots. */
export function fullName(
  name: { first: string; last: string },
  fallback: string,
): string {
  return `${name.first} ${name.last}`.trim() || fallback;
}

/**
 * Highest earned first, then by last name, then by id so the order never
 * shuffles between polls. Equal points share a rank and the next rank skips
 * (1, 1, 3).
 */
export function rankLeaderboard<
  T extends { id: string; lastName: string; earned: number },
>(rows: readonly T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.earned - a.earned ||
      a.lastName.localeCompare(b.lastName, "en", { sensitivity: "base" }) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || sorted[index - 1]!.earned !== row.earned) {
      rank = index + 1;
    }
    return { ...row, rank };
  });
}

// ---------------------------------------------------------------------------
// Event codes

// No 0/O, 1/I/L: a code is read off a projector across a room and typed on a
// phone, and those are the pairs people get wrong.
export const CHECK_IN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CHECK_IN_CODE_LENGTH = 6;

/** A fresh code. `pick` returns an integer in [0, max); crypto by default. */
export function generateCheckInCode(
  pick: (max: number) => number = randomInt,
): string {
  let code = "";
  for (let i = 0; i < CHECK_IN_CODE_LENGTH; i += 1) {
    code += CHECK_IN_CODE_ALPHABET[pick(CHECK_IN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * What a hacker typed, as a code to look up, or null when it cannot be one.
 * Case, spaces and dashes are forgiven; letters outside the alphabet are not.
 */
export function normalizeCheckInCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CHECK_IN_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!CHECK_IN_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
}

const CODE_ATTEMPTS = 5;

/**
 * Gives an event a new code, replacing any it had. Unique per hackathon by the
 * partial index on (hackathon_id, check_in_code): a collision is a unique
 * violation, and the answer is to draw again. On the pool, not a transaction,
 * because a violation would abort the transaction the retry runs in.
 */
export async function assignCheckInCode(
  db: DrizzleDB,
  event: { id: string; checkInCode: string | null },
  generate: () => string = generateCheckInCode,
): Promise<string> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = generate();
    // Rotating has to change what is on the screen.
    if (code === event.checkInCode) continue;
    try {
      await db
        .update(hackathonEvents)
        .set({ checkInCode: code, updatedAt: new Date() })
        .where(eq(hackathonEvents.id, event.id));
      return code;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "Could not find an unused code for this event. Try again.",
  });
}

// Doors open a little early: people queue before a workshop starts, and the
// code is on the screen as they walk in.
export const SELF_CHECK_IN_LEAD_MS = 15 * 60 * 1000;

export type SelfCheckInWindow = "early" | "open" | "ended";

/** Self check-in runs from 15 minutes before the start to the end, inclusive. */
export function selfCheckInWindow(
  event: { startTime: Date; endTime: Date },
  now: Date,
): SelfCheckInWindow {
  if (now.getTime() < event.startTime.getTime() - SELF_CHECK_IN_LEAD_MS) {
    return "early";
  }
  if (now.getTime() > event.endTime.getTime()) return "ended";
  return "open";
}

// ---------------------------------------------------------------------------
// Attendance

// Two events at once, or two check-ins in quick succession, mean somebody is
// collecting points for events they are not at. Meals are the exception: people
// eat alongside whatever else is on, and a meal scan only counts food.
export const CHECK_IN_GAP_MS = 30 * 60 * 1000;

type AttendedEvent = {
  id: string;
  type: string;
  startTime: Date;
  endTime: Date;
};

/** One of the participant's existing check-ins, with the event it was for. */
export type EarlierAttendance = {
  event: AttendedEvent & { name: string };
  checkedInAt: Date;
};

export type AttendanceConflict = {
  /** overlap: the events run at the same time. too_soon: under the gap. */
  kind: "overlap" | "too_soon";
  other: { name: string };
  /** Whole minutes since the earlier check-in. Only on too_soon. */
  minutesAgo?: number;
};

/**
 * Why `event` cannot be checked into now, given the participant's earlier
 * check-ins, or null when it can. Overlap is reported before too_soon because
 * it is the firmer answer: waiting does not fix it. Pure, so the rule is
 * testable without a database.
 */
export function attendanceConflict(
  event: AttendedEvent,
  earlier: readonly EarlierAttendance[],
  now: Date,
): AttendanceConflict | null {
  if (event.type === "meal") return null;

  // Already in this event: the duplicate case, which the unique index answers
  // with "already checked in". Checking the others too would answer a repeat
  // code with "try again in 20 minutes" after a later check-in elsewhere.
  if (earlier.some((row) => row.event.id === event.id)) return null;

  const others = earlier.filter((row) => row.event.type !== "meal");

  // Strict, so an event that ends at 2:00 does not clash with one that starts
  // at 2:00.
  const overlapping = others.find(
    (row) =>
      row.event.startTime < event.endTime &&
      event.startTime < row.event.endTime,
  );
  if (overlapping) {
    return { kind: "overlap", other: { name: overlapping.event.name } };
  }

  let latest: EarlierAttendance | null = null;
  for (const row of others) {
    if (now.getTime() - row.checkedInAt.getTime() >= CHECK_IN_GAP_MS) continue;
    if (!latest || row.checkedInAt > latest.checkedInAt) latest = row;
  }
  if (!latest) return null;

  return {
    kind: "too_soon",
    other: { name: latest.event.name },
    // A clock a little behind the database can put the check-in in the future.
    minutesAgo: Math.max(
      0,
      Math.floor((now.getTime() - latest.checkedInAt.getTime()) / 60_000),
    ),
  };
}

/**
 * The one writer of attendance rows: pass scans, event codes and manual
 * check-in all come through here, so every row carries the event's points at
 * that moment and how it was made. Callers check that the event and the
 * participant belong to the same hackathon and that the participant may
 * attend. The unique index on (event, participant) is the duplicate guard;
 * two stations racing both pass any earlier read, and the loser gets the same
 * sentence a single duplicate would.
 *
 * It also holds the bad-actor rules (see attendanceConflict): nobody is in two
 * events that run at the same time, or in two within CHECK_IN_GAP_MS of each
 * other. Those are read-then-write, so the participant's row is locked first:
 * two check-ins for one person at the same moment (two tabs, two stations)
 * queue up, and the second one sees the first. A refusal is FORBIDDEN, not
 * CONFLICT: the self check-in page reads CONFLICT as "already checked in".
 */
export async function recordEventAttendance(
  db: PointsDb,
  input: {
    event: {
      id: string;
      name: string;
      points: number;
      type: string;
      startTime: Date;
      endTime: Date;
    };
    participant: { id: string; name: string };
    method: AttendanceMethod;
    actorId: string | null;
  },
): Promise<{ pointsAwarded: number }> {
  const { event, participant, method, actorId } = input;
  // One clock for the rule and the row it writes. Left to the database's
  // now(), checked_in_at (no time zone) follows the session's TimeZone and
  // would not compare with this one.
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // No key update: enough to queue this person's check-ins behind each
      // other without holding up other writes that reference the row.
      await tx
        .select({ id: hackathonParticipants.id })
        .from(hackathonParticipants)
        .where(eq(hackathonParticipants.id, participant.id))
        .for("no key update");

      const earlier = await tx
        .select({
          event: {
            id: hackathonEvents.id,
            name: hackathonEvents.name,
            type: hackathonEvents.type,
            startTime: hackathonEvents.startTime,
            endTime: hackathonEvents.endTime,
          },
          checkedInAt: hackathonEventAttendees.checkedInAt,
        })
        .from(hackathonEventAttendees)
        .innerJoin(
          hackathonEvents,
          eq(hackathonEvents.id, hackathonEventAttendees.eventId),
        )
        .where(eq(hackathonEventAttendees.participantId, participant.id));

      const conflict = attendanceConflict(event, earlier, now);
      if (conflict) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: attendanceConflictMessage(input, conflict),
        });
      }

      await tx.insert(hackathonEventAttendees).values({
        eventId: event.id,
        participantId: participant.id,
        pointsAwarded: event.points,
        method,
        checkedInById: actorId,
        checkedInAt: now,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: alreadyCheckedInMessage(input),
      });
    }
    throw error;
  }

  return { pointsAwarded: event.points };
}

/** The duplicate sentence, shared by the pre-check and the index. */
export function alreadyCheckedInMessage(input: {
  event: { name: string };
  participant: { name: string };
  method: AttendanceMethod;
}): string {
  // A code is entered by the hacker themselves; everything else by staff.
  return input.method === "code"
    ? `You are already checked into ${input.event.name}.`
    : `${input.participant.name} is already checked into ${input.event.name}.`;
}

const minutesLabel = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;

/** The refusal sentence for an attendanceConflict, worded like the one above. */
export function attendanceConflictMessage(
  input: {
    event: { name: string };
    participant: { name: string };
    method: AttendanceMethod;
  },
  conflict: AttendanceConflict,
): string {
  const { event, participant, method } = input;
  const other = conflict.other.name;
  const self = method === "code";

  if (conflict.kind === "overlap") {
    return self
      ? `You're already checked into ${other}, which runs at the same time as ${event.name}. You can check into one event at a time.`
      : `${participant.name} is already checked into ${other}, which runs at the same time as ${event.name}. If that was a mistake, remove them from ${other} first.`;
  }

  const ago = conflict.minutesAgo ?? 0;
  const when =
    ago === 0 ? "less than a minute ago" : `${minutesLabel(ago)} ago`;
  const rule = `Event check-ins have to be at least ${CHECK_IN_GAP_MS / 60_000} minutes apart`;
  if (!self) {
    return `${participant.name} checked into ${other} ${when}. ${rule}. If that was a mistake, remove them from ${other} first.`;
  }
  // minutesAgo is floored, so what is left of the gap rounds up on its own.
  const left = Math.max(1, CHECK_IN_GAP_MS / 60_000 - ago);
  return `You checked into ${other} ${when}. ${rule}, so try again in ${minutesLabel(left)}.`;
}

// ---------------------------------------------------------------------------
// Balances

/** One participant's balance. Inside a purchase, run it in that transaction. */
export async function readBalance(
  db: PointsDb,
  participantId: string,
): Promise<PointsBalance> {
  const [[awarded], [adjusted], [spent]] = await Promise.all([
    db
      .select({
        total: sql<number>`coalesce(sum(${hackathonEventAttendees.pointsAwarded}), 0)::int`,
      })
      .from(hackathonEventAttendees)
      .where(eq(hackathonEventAttendees.participantId, participantId)),
    db
      .select({
        total: sql<number>`coalesce(sum(${hackathonPointAdjustments.delta}), 0)::int`,
      })
      .from(hackathonPointAdjustments)
      .where(eq(hackathonPointAdjustments.participantId, participantId)),
    db
      .select({
        total: sql<number>`coalesce(sum(${hackathonStorePurchases.total}), 0)::int`,
      })
      .from(hackathonStorePurchases)
      .where(
        and(
          eq(hackathonStorePurchases.participantId, participantId),
          isNull(hackathonStorePurchases.voidedAt),
        ),
      ),
  ]);

  return pointsBalance({
    awarded: awarded?.total ?? 0,
    adjusted: adjusted?.total ?? 0,
    spent: spent?.total ?? 0,
  });
}

/**
 * Balances for many participants of one edition in three grouped reads,
 * rather than three per person. Without ids, everyone in the edition.
 */
export async function balancesFor(
  db: PointsDb,
  hackathonId: string,
  participantIds?: readonly string[],
): Promise<(participantId: string) => PointsBalance> {
  if (participantIds && participantIds.length === 0) {
    return () => pointsBalance(NO_TOTALS);
  }
  const ids = participantIds ? [...participantIds] : null;

  const [attendance, adjustments, purchases] = await Promise.all([
    db
      .select({
        participantId: hackathonEventAttendees.participantId,
        total: sql<number>`coalesce(sum(${hackathonEventAttendees.pointsAwarded}), 0)::int`,
      })
      .from(hackathonEventAttendees)
      .innerJoin(
        hackathonEvents,
        eq(hackathonEvents.id, hackathonEventAttendees.eventId),
      )
      .where(
        and(
          eq(hackathonEvents.hackathonId, hackathonId),
          ids ? inArray(hackathonEventAttendees.participantId, ids) : undefined,
        ),
      )
      .groupBy(hackathonEventAttendees.participantId),
    db
      .select({
        participantId: hackathonPointAdjustments.participantId,
        total: sql<number>`coalesce(sum(${hackathonPointAdjustments.delta}), 0)::int`,
      })
      .from(hackathonPointAdjustments)
      .where(
        and(
          eq(hackathonPointAdjustments.hackathonId, hackathonId),
          ids
            ? inArray(hackathonPointAdjustments.participantId, ids)
            : undefined,
        ),
      )
      .groupBy(hackathonPointAdjustments.participantId),
    db
      .select({
        participantId: hackathonStorePurchases.participantId,
        total: sql<number>`coalesce(sum(${hackathonStorePurchases.total}), 0)::int`,
      })
      .from(hackathonStorePurchases)
      .where(
        and(
          eq(hackathonStorePurchases.hackathonId, hackathonId),
          isNull(hackathonStorePurchases.voidedAt),
          ids ? inArray(hackathonStorePurchases.participantId, ids) : undefined,
        ),
      )
      .groupBy(hackathonStorePurchases.participantId),
  ]);

  const totals = new Map<string, PointsTotals>();
  const totalsOf = (id: string) => {
    let entry = totals.get(id);
    if (!entry) {
      entry = { ...NO_TOTALS };
      totals.set(id, entry);
    }
    return entry;
  };
  for (const row of attendance) totalsOf(row.participantId).awarded = row.total;
  for (const row of adjustments)
    totalsOf(row.participantId).adjusted = row.total;
  for (const row of purchases) {
    // A purchase outlives a deleted registration with no participant.
    if (row.participantId) totalsOf(row.participantId).spent = row.total;
  }

  return (participantId) =>
    pointsBalance(totals.get(participantId) ?? NO_TOTALS);
}

/**
 * Every checked-in participant of the edition, ranked. Names come back whole;
 * each caller decides how much of them to show.
 */
export async function rankedLeaderboard(db: PointsDb, hackathonId: string) {
  const [rows, balanceOf] = await Promise.all([
    db
      .select({
        id: hackathonParticipants.id,
        userId: hackathonParticipants.userId,
        firstName: hackathonParticipants.firstName,
        lastName: hackathonParticipants.lastName,
        accountName: users.name,
        email: users.email,
      })
      .from(hackathonParticipants)
      .innerJoin(users, eq(users.id, hackathonParticipants.userId))
      .where(
        and(
          eq(hackathonParticipants.hackathonId, hackathonId),
          eq(hackathonParticipants.registrationStatus, "checked_in"),
        ),
      ),
    balancesFor(db, hackathonId),
  ]);

  return rankLeaderboard(
    rows.map((row) => {
      const name = personName(row);
      const balance = balanceOf(row.id);
      return {
        id: row.id,
        userId: row.userId,
        email: row.email,
        name,
        lastName: name.last,
        earned: balance.earned,
        balance,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Ledger

/** Every row behind one participant's balance, newest first. */
export async function readLedger(db: PointsDb, participantId: string) {
  const [attendance, adjustments, purchases] = await Promise.all([
    db
      .select({
        id: hackathonEventAttendees.id,
        eventId: hackathonEventAttendees.eventId,
        eventName: hackathonEvents.name,
        eventStartTime: hackathonEvents.startTime,
        checkedInAt: hackathonEventAttendees.checkedInAt,
        pointsAwarded: hackathonEventAttendees.pointsAwarded,
        method: hackathonEventAttendees.method,
        checkedInById: hackathonEventAttendees.checkedInById,
      })
      .from(hackathonEventAttendees)
      .innerJoin(
        hackathonEvents,
        eq(hackathonEvents.id, hackathonEventAttendees.eventId),
      )
      .where(eq(hackathonEventAttendees.participantId, participantId))
      .orderBy(desc(hackathonEventAttendees.checkedInAt)),
    db
      .select({
        id: hackathonPointAdjustments.id,
        delta: hackathonPointAdjustments.delta,
        reason: hackathonPointAdjustments.reason,
        actorId: hackathonPointAdjustments.actorId,
        createdAt: hackathonPointAdjustments.createdAt,
      })
      .from(hackathonPointAdjustments)
      .where(eq(hackathonPointAdjustments.participantId, participantId))
      .orderBy(desc(hackathonPointAdjustments.createdAt)),
    db
      .select({
        id: hackathonStorePurchases.id,
        itemName: hackathonStorePurchases.itemName,
        unitPrice: hackathonStorePurchases.unitPrice,
        quantity: hackathonStorePurchases.quantity,
        total: hackathonStorePurchases.total,
        actorId: hackathonStorePurchases.actorId,
        createdAt: hackathonStorePurchases.createdAt,
        voidedAt: hackathonStorePurchases.voidedAt,
        voidedById: hackathonStorePurchases.voidedById,
        voidReason: hackathonStorePurchases.voidReason,
        restocked: hackathonStorePurchases.restocked,
      })
      .from(hackathonStorePurchases)
      .where(eq(hackathonStorePurchases.participantId, participantId))
      .orderBy(desc(hackathonStorePurchases.createdAt)),
  ]);

  return {
    attendance,
    adjustments,
    purchases,
    balance: pointsBalance(
      ledgerTotals({ attendance, adjustments, purchases }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Finding people at a station

const SEARCHABLE_STATUSES = ["approved", "checked_in"] as const;

/**
 * Accepted participants whose name or email contains the query. Pending,
 * waitlisted and rejected people cannot attend or spend, so they are not
 * offered.
 */
export async function searchParticipants(
  db: PointsDb,
  input: { hackathonId: string; query: string; limit: number },
) {
  const term = input.query.trim();
  if (!term) return [];

  // Escaped so a literal % or _ searches for itself.
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const rows = await db
    .select({
      id: hackathonParticipants.id,
      firstName: hackathonParticipants.firstName,
      lastName: hackathonParticipants.lastName,
      registrationStatus: hackathonParticipants.registrationStatus,
      accountName: users.name,
      email: users.email,
    })
    .from(hackathonParticipants)
    .innerJoin(users, eq(users.id, hackathonParticipants.userId))
    .where(
      and(
        eq(hackathonParticipants.hackathonId, input.hackathonId),
        inArray(hackathonParticipants.registrationStatus, [
          ...SEARCHABLE_STATUSES,
        ]),
        sql`(
          ${hackathonParticipants.firstName} ilike ${pattern}
          or ${hackathonParticipants.lastName} ilike ${pattern}
          or concat_ws(' ', ${hackathonParticipants.firstName}, ${hackathonParticipants.lastName}) ilike ${pattern}
          or ${users.name} ilike ${pattern}
          or ${users.email} ilike ${pattern}
        )`,
      ),
    )
    .orderBy(
      asc(hackathonParticipants.firstName),
      asc(hackathonParticipants.lastName),
      asc(hackathonParticipants.id),
    )
    .limit(input.limit);

  return rows.map((row) => ({
    id: row.id,
    name: fullName(personName(row), row.email),
    email: row.email,
    registrationStatus: row.registrationStatus,
  }));
}
