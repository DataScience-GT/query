import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  hackathonCheckInFlags,
  hackathonEvents,
  hackathonParticipants,
  hackathonProjects,
  judgingEntries,
  judgingEntryMembers,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import type { JudgingDb } from "./judging/config";
import { CheckInRuleBreak, fullName, personName } from "./points";
import type { CheckInRuleBreakDetails } from "./points";

// Check-in rule breaks, as organisers and judges meet them. recordEventAttendance
// refuses an overlapping or too-soon check-in and the refusal rolls its
// transaction back, so the attempt is written here, on the pool, afterwards.
// A flag belongs to a person; judging shows it on the team they are on, found
// when it is read (see entriesForFlags) because people change teams and
// projects are promoted late. Hackers never read any of this, and nothing here
// may reach a cached or public payload.

/** One refused attempt, as organisers read it. Judges get only an entry id. */
export type CheckInFlagView = {
  id: string;
  participantName: string;
  rule: "overlap" | "too_soon";
  /** The event they tried to enter, or "A deleted event" once it is gone. */
  eventName: string;
  /** The event they were already in, worded the same way if deleted. */
  conflictEventName: string;
  method: "scan" | "code" | "manual";
  attempts: number;
  createdAt: Date;
  lastAttemptAt: Date;
  /** An organiser reviewed it and cleared it. */
  dismissed: boolean;
};

/**
 * Stores a refused attempt. The same person trying the same pair of events
 * again adds to `attempts` instead of a second row; a dismissal stays as it
 * is, so a cleared flag does not reopen itself but still shows the retry count.
 */
export async function recordCheckInFlag(
  db: DrizzleDB,
  hackathonId: string,
  breach: CheckInRuleBreakDetails,
): Promise<void> {
  await db
    .insert(hackathonCheckInFlags)
    .values({
      hackathonId,
      participantId: breach.participantId,
      eventId: breach.eventId,
      conflictEventId: breach.conflictEventId,
      rule: breach.rule,
      method: breach.method,
      attemptedById: breach.actorId,
      attempts: 1,
      createdAt: breach.at,
      lastAttemptAt: breach.at,
    })
    .onConflictDoUpdate({
      target: [
        hackathonCheckInFlags.participantId,
        hackathonCheckInFlags.eventId,
        hackathonCheckInFlags.conflictEventId,
      ],
      set: {
        attempts: sql`${hackathonCheckInFlags.attempts} + 1`,
        lastAttemptAt: breach.at,
      },
    });
}

/**
 * Runs an attendance write and, if the check-in rules refuse it, records the
 * attempt on the pool before rethrowing. `db` has to be the pool and not the
 * transaction the refusal rolled back: a row written inside it would go with
 * it. Writing the flag is best effort. The person at the door must see the same
 * refusal whether or not the flag landed, so a failure here is logged and the
 * original error still goes out.
 */
export async function flaggingRuleBreaks<T>(
  db: DrizzleDB,
  hackathonId: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TRPCError && error.cause instanceof CheckInRuleBreak) {
      try {
        await recordCheckInFlag(db, hackathonId, error.cause);
      } catch (flagError) {
        // Deliberate server-side logging: the refusal is the answer the person
        // gets, so the console is the only place a lost flag can show up.
        // oxlint-disable-next-line no-console
        console.error(
          "[CheckInFlags] Failed to record a rule break:",
          flagError,
        );
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reading flags against judging entries

/** What finding a flag's entries needs from the flag and its participant. */
export type FlagTarget = {
  id: string;
  participantId: string;
  teamId: string | null;
  userId: string;
};

/** A portal entry and the project it was promoted from. */
export type PortalEntryLink = {
  entryId: string;
  teamId: string | null;
  submittedById: string | null;
};

/** A person on an entry, claimed or not. */
export type MemberEntryLink = { entryId: string; userId: string | null };

const pushTo = (map: Map<string, string[]>, key: string, value: string) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/**
 * The entries each flag belongs to, by flag id. A participant is on an entry
 * when it is a portal project filed by their team, or by them alone when it
 * has no team, or when they are one of its members (which covers Devpost
 * entries and claimed teammates). Reaching the same entry by more than one
 * route counts once. A flag on nobody's entry maps to an empty set. Pure, so
 * the matching is testable without a database.
 */
export function entriesForFlags(
  flags: readonly FlagTarget[],
  portal: readonly PortalEntryLink[],
  members: readonly MemberEntryLink[],
): Map<string, Set<string>> {
  const byTeam = new Map<string, string[]>();
  const bySoloSubmitter = new Map<string, string[]>();
  for (const link of portal) {
    if (link.teamId) pushTo(byTeam, link.teamId, link.entryId);
    else if (link.submittedById) {
      pushTo(bySoloSubmitter, link.submittedById, link.entryId);
    }
  }
  const byUser = new Map<string, string[]>();
  for (const link of members) {
    if (link.userId) pushTo(byUser, link.userId, link.entryId);
  }

  const result = new Map<string, Set<string>>();
  for (const flag of flags) {
    const entries = new Set<string>();
    const sources = [
      flag.teamId ? byTeam.get(flag.teamId) : undefined,
      bySoloSubmitter.get(flag.participantId),
      byUser.get(flag.userId),
    ];
    for (const ids of sources) for (const id of ids ?? []) entries.add(id);
    result.set(flag.id, entries);
  }
  return result;
}

/** Resolves flags to live entries of the edition in two batched reads. */
async function entriesFor(
  db: JudgingDb,
  hackathonId: string,
  flags: readonly FlagTarget[],
): Promise<Map<string, Set<string>>> {
  if (flags.length === 0) return new Map();

  const teamIds = [
    ...new Set(flags.flatMap((flag) => (flag.teamId ? [flag.teamId] : []))),
  ];
  const participantIds = [...new Set(flags.map((flag) => flag.participantId))];
  const userIds = [...new Set(flags.map((flag) => flag.userId))];

  const [portal, members] = await Promise.all([
    db
      .select({
        entryId: judgingEntries.id,
        teamId: hackathonProjects.teamId,
        submittedById: hackathonProjects.submittedById,
      })
      .from(judgingEntries)
      .innerJoin(
        hackathonProjects,
        eq(hackathonProjects.id, judgingEntries.sourceProjectId),
      )
      .where(
        and(
          eq(judgingEntries.hackathonId, hackathonId),
          eq(judgingEntries.source, "portal"),
          isNull(judgingEntries.deletedAt),
          or(
            teamIds.length > 0
              ? inArray(hackathonProjects.teamId, teamIds)
              : undefined,
            and(
              isNull(hackathonProjects.teamId),
              inArray(hackathonProjects.submittedById, participantIds),
            ),
          ),
        ),
      ),
    db
      .select({
        entryId: judgingEntryMembers.entryId,
        userId: judgingEntryMembers.userId,
      })
      .from(judgingEntryMembers)
      .innerJoin(
        judgingEntries,
        eq(judgingEntries.id, judgingEntryMembers.entryId),
      )
      .where(
        and(
          eq(judgingEntryMembers.hackathonId, hackathonId),
          isNull(judgingEntries.deletedAt),
          inArray(judgingEntryMembers.userId, userIds),
        ),
      ),
  ]);

  return entriesForFlags(flags, portal, members);
}

/** The open flags of an edition with just enough to find their entries. */
async function openFlagTargets(
  db: JudgingDb,
  hackathonId: string,
): Promise<FlagTarget[]> {
  return db
    .select({
      id: hackathonCheckInFlags.id,
      participantId: hackathonCheckInFlags.participantId,
      teamId: hackathonParticipants.teamId,
      userId: hackathonParticipants.userId,
    })
    .from(hackathonCheckInFlags)
    .innerJoin(
      hackathonParticipants,
      eq(hackathonParticipants.id, hackathonCheckInFlags.participantId),
    )
    .where(
      and(
        eq(hackathonCheckInFlags.hackathonId, hackathonId),
        isNull(hackathonCheckInFlags.dismissedAt),
      ),
    );
}

/**
 * Every flag on the given entries, grouped by entry, for organisers: names and
 * events included. Open flags come first, then the most recent attempt. Null
 * entry ids means every live entry of the edition (the "Flagged" filter). An
 * entry with no flags is not in the map. Never pass the result to a judge or
 * put it in a cached payload.
 */
export async function checkInFlagsForEntries(
  db: JudgingDb,
  hackathonId: string,
  entryIds: string[] | null,
): Promise<Map<string, CheckInFlagView[]>> {
  const result = new Map<string, CheckInFlagView[]>();
  if (entryIds && entryIds.length === 0) return result;

  const rows = await db
    .select({
      id: hackathonCheckInFlags.id,
      participantId: hackathonCheckInFlags.participantId,
      eventId: hackathonCheckInFlags.eventId,
      conflictEventId: hackathonCheckInFlags.conflictEventId,
      rule: hackathonCheckInFlags.rule,
      method: hackathonCheckInFlags.method,
      attempts: hackathonCheckInFlags.attempts,
      createdAt: hackathonCheckInFlags.createdAt,
      lastAttemptAt: hackathonCheckInFlags.lastAttemptAt,
      dismissedAt: hackathonCheckInFlags.dismissedAt,
      teamId: hackathonParticipants.teamId,
      userId: hackathonParticipants.userId,
      firstName: hackathonParticipants.firstName,
      lastName: hackathonParticipants.lastName,
      accountName: users.name,
      email: users.email,
    })
    .from(hackathonCheckInFlags)
    .innerJoin(
      hackathonParticipants,
      eq(hackathonParticipants.id, hackathonCheckInFlags.participantId),
    )
    .innerJoin(users, eq(users.id, hackathonParticipants.userId))
    .where(eq(hackathonCheckInFlags.hackathonId, hackathonId));
  if (rows.length === 0) return result;

  // A deleted event leaves its id null on the flag; there is nothing to look up.
  const eventIds = [
    ...new Set(
      rows
        .flatMap((row) => [row.eventId, row.conflictEventId])
        .filter((id) => id !== null),
    ),
  ];
  const [events, entriesByFlag] = await Promise.all([
    eventIds.length === 0
      ? ([] as { id: string; name: string }[])
      : db
          .select({ id: hackathonEvents.id, name: hackathonEvents.name })
          .from(hackathonEvents)
          .where(inArray(hackathonEvents.id, eventIds)),
    entriesFor(db, hackathonId, rows),
  ]);
  const eventName = new Map(events.map((event) => [event.id, event.name]));
  const nameOf = (id: string | null) =>
    (id ? eventName.get(id) : undefined) ?? "A deleted event";

  const wanted = entryIds ? new Set(entryIds) : null;
  const views: [CheckInFlagView, string[]][] = [];
  for (const row of rows) {
    const entries = [...(entriesByFlag.get(row.id) ?? [])].filter(
      (id) => !wanted || wanted.has(id),
    );
    if (entries.length === 0) continue;
    views.push([
      {
        id: row.id,
        participantName: fullName(personName(row), row.email),
        rule: row.rule,
        eventName: nameOf(row.eventId),
        conflictEventName: nameOf(row.conflictEventId),
        method: row.method,
        attempts: row.attempts,
        createdAt: row.createdAt,
        lastAttemptAt: row.lastAttemptAt,
        dismissed: row.dismissedAt !== null,
      },
      entries,
    ]);
  }

  // One order for every entry: open before cleared, newest attempt first, and
  // the id last so equal timestamps never shuffle between polls.
  views.sort(
    ([a], [b]) =>
      Number(a.dismissed) - Number(b.dismissed) ||
      b.lastAttemptAt.getTime() - a.lastAttemptAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const [view, entries] of views) {
    for (const entryId of entries) {
      const list = result.get(entryId);
      if (list) list.push(view);
      else result.set(entryId, [view]);
    }
  }
  return result;
}

/**
 * Which of the given entries carry at least one flag nobody has dismissed.
 * Ids only, which is all a judge is told: that the team was flagged, not who
 * or why.
 */
export async function flaggedEntryIds(
  db: JudgingDb,
  hackathonId: string,
  entryIds: string[],
): Promise<Set<string>> {
  if (entryIds.length === 0) return new Set();

  const targets = await openFlagTargets(db, hackathonId);
  const entriesByFlag = await entriesFor(db, hackathonId, targets);

  const wanted = new Set(entryIds);
  const flagged = new Set<string>();
  for (const entries of entriesByFlag.values()) {
    for (const id of entries) if (wanted.has(id)) flagged.add(id);
  }
  return flagged;
}

/**
 * Open flags in the edition that sit on a live entry, for the organiser
 * header. A flag whose hacker is on no entry is left out: there is nowhere in
 * judging to review it, and a count of things nobody can open is noise.
 */
export async function openCheckInFlagCount(
  db: JudgingDb,
  hackathonId: string,
): Promise<number> {
  const targets = await openFlagTargets(db, hackathonId);
  const entriesByFlag = await entriesFor(db, hackathonId, targets);

  let count = 0;
  for (const entries of entriesByFlag.values())
    if (entries.size > 0) count += 1;
  return count;
}
