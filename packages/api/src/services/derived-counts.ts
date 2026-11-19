// Counts for numbers that used to be stored counters. Each helper takes the ids
// a list is about to return and answers with one grouped query, never one query
// per row; an empty id list does not query at all.
//
// A grouped query rather than a correlated subquery in the select: in a
// relational query's `extras` drizzle prints the outer column unqualified, so
// the subquery's own `id` shadows it and every count comes back 0.
//
// The counters (events.currentCheckIns, hackathonTeams.currentMembers,
// hackathons.currentParticipants) drifted whenever an FK cascade removed rows
// without touching them; the rows cannot drift from themselves.

import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import {
  eventCheckIns,
  hackathonParticipants,
} from "@query/db";
import type { DrizzleDB } from "@query/db";

type Reader = Pick<DrizzleDB, "select">;

const unique = (ids: (string | null | undefined)[]) => [
  ...new Set(ids.filter((id): id is string => !!id)),
];

// The ids a count is about: a list already in hand, or a subquery that selects
// them. A subquery lets the count run beside the read that lists its parents,
// one round trip for both where the count after the list was two in a row.
// Rows inserted between the two reads can disagree by one for an instant,
// which these counts always could. An empty list does not query.
type Ids = (string | null | undefined)[] | SQLWrapper;
const resolveIds = (ids: Ids) => (Array.isArray(ids) ? unique(ids) : ids);
const isEmpty = (ids: string[] | SQLWrapper) =>
  Array.isArray(ids) && ids.length === 0;

export const checkInCounts = async (db: Reader, eventIds: Ids) => {
  const ids = resolveIds(eventIds);
  const counts = new Map<string, number>();
  if (isEmpty(ids)) return counts;
  const rows = await db
    .select({ id: eventCheckIns.eventId, n: count() })
    .from(eventCheckIns)
    .where(inArray(eventCheckIns.eventId, ids))
    .groupBy(eventCheckIns.eventId);
  for (const row of rows) counts.set(row.id, Number(row.n));
  return counts;
};

export const teamMemberCounts = async (db: Reader, teamIds: Ids) => {
  const ids = resolveIds(teamIds);
  const counts = new Map<string, number>();
  if (isEmpty(ids)) return counts;
  const rows = await db
    .select({ id: hackathonParticipants.teamId, n: count() })
    .from(hackathonParticipants)
    .where(inArray(hackathonParticipants.teamId, ids))
    .groupBy(hackathonParticipants.teamId);
  for (const row of rows) if (row.id) counts.set(row.id, Number(row.n));
  return counts;
};

// Member counts for every team one user sits on, without needing those team
// ids first.
export const teamMemberCountsForUser = (db: Reader, userId: string) =>
  teamMemberCounts(
    db,
    db
      .select({ id: hackathonParticipants.teamId })
      .from(hackathonParticipants)
      .where(
        and(
          eq(hackathonParticipants.userId, userId),
          isNotNull(hackathonParticipants.teamId),
        ),
      ),
  );

// A seat belongs to somebody accepted: SEATED_STATUSES in
// routers/hackathon/admin/seats.ts, which this must agree with.
export const seatedCounts = async (db: Reader, hackathonIds: Ids) => {
  const ids = resolveIds(hackathonIds);
  const counts = new Map<string, number>();
  if (isEmpty(ids)) return counts;
  const rows = await db
    .select({ id: hackathonParticipants.hackathonId, n: count() })
    .from(hackathonParticipants)
    .where(
      and(
        inArray(hackathonParticipants.hackathonId, ids),
        inArray(hackathonParticipants.registrationStatus, [
          "approved",
          "checked_in",
        ]),
      ),
    )
    .groupBy(hackathonParticipants.hackathonId);
  for (const row of rows) counts.set(row.id, Number(row.n));
  return counts;
};

// Merge helpers: same field names and types the stored columns had, so no
// reader needs to change. A parent with no child rows is 0.
export const withCheckInCounts = async <T extends { id: string }>(
  db: Reader,
  rows: T[],
) => {
  const counts = await checkInCounts(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    currentCheckIns: counts.get(row.id) ?? 0,
  }));
};

export const withTeamMemberCounts = async <T extends { id: string }>(
  db: Reader,
  rows: T[],
) => {
  const counts = await teamMemberCounts(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    currentMembers: counts.get(row.id) ?? 0,
  }));
};

export const withSeatedCounts = async <T extends { id: string }>(
  db: Reader,
  rows: T[],
) => {
  const counts = await seatedCounts(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    currentParticipants: counts.get(row.id) ?? 0,
  }));
};
