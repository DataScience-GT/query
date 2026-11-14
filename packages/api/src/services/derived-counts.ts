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

import { and, count, inArray } from "drizzle-orm";
import {
  eventCheckIns,
  hackathonParticipants,
} from "@query/db";
import type { DrizzleDB } from "@query/db";

type Reader = Pick<DrizzleDB, "select">;

const unique = (ids: (string | null | undefined)[]) => [
  ...new Set(ids.filter((id): id is string => !!id)),
];

export const checkInCounts = async (
  db: Reader,
  eventIds: (string | null | undefined)[],
) => {
  const ids = unique(eventIds);
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await db
    .select({ id: eventCheckIns.eventId, n: count() })
    .from(eventCheckIns)
    .where(inArray(eventCheckIns.eventId, ids))
    .groupBy(eventCheckIns.eventId);
  for (const row of rows) counts.set(row.id, Number(row.n));
  return counts;
};

export const teamMemberCounts = async (
  db: Reader,
  teamIds: (string | null | undefined)[],
) => {
  const ids = unique(teamIds);
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await db
    .select({ id: hackathonParticipants.teamId, n: count() })
    .from(hackathonParticipants)
    .where(inArray(hackathonParticipants.teamId, ids))
    .groupBy(hackathonParticipants.teamId);
  for (const row of rows) if (row.id) counts.set(row.id, Number(row.n));
  return counts;
};

// A seat belongs to somebody accepted: SEATED_STATUSES in
// routers/hackathon/admin/seats.ts, which this must agree with.
export const seatedCounts = async (
  db: Reader,
  hackathonIds: (string | null | undefined)[],
) => {
  const ids = unique(hackathonIds);
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
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
