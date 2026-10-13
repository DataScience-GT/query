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

/**
 * The one writer of attendance rows: pass scans, event codes and manual
 * check-in all come through here, so every row carries the event's points at
 * that moment and how it was made. Callers check that the event and the
 * participant belong to the same hackathon and that the participant may
 * attend. The unique index on (event, participant) is the duplicate guard;
 * two stations racing both pass any earlier read, and the loser gets the same
 * sentence a single duplicate would.
 */
export async function recordEventAttendance(
  db: PointsDb,
  input: {
    event: { id: string; name: string; points: number };
    participant: { id: string; name: string };
    method: AttendanceMethod;
    actorId: string | null;
  },
): Promise<{ pointsAwarded: number }> {
  const { event, participant, method, actorId } = input;

  try {
    await db.insert(hackathonEventAttendees).values({
      eventId: event.id,
      participantId: participant.id,
      pointsAwarded: event.points,
      method,
      checkedInById: actorId,
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
