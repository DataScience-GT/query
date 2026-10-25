// Seat counting and the cache keys a participant status change moves.

import { TRPCError } from "@trpc/server";
import { CacheKeys } from "../../../middleware/cache";
import { hackathons, hackathonParticipants } from "@query/db";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

// A seat belongs to somebody accepted. maxParticipants caps acceptances, not
// applications: applying is free, so an organiser can take more applications
// than seats and fill them in waves.
export const SEATED_STATUSES = ["approved", "checked_in"] as const;

// Re-derives currentParticipants from the rows that actually hold a seat. The
// hackathon row is locked first: `SET x = (subquery)` plans the subquery once
// per statement, so a register() committing mid-wait would be overwritten and
// the seat total would drift low enough to admit people past maxParticipants.
export const syncCurrentParticipants = (
  db: DrizzleDB,
  hackathonId: string,
) =>
  db.transaction(async (tx) => {
    await tx
      .select({ id: hackathons.id })
      .from(hackathons)
      .where(eq(hackathons.id, hackathonId))
      .for("update");

    await tx
      .update(hackathons)
      .set({
        currentParticipants: sql`(select count(*)::int from ${hackathonParticipants} where ${hackathonParticipants.hackathonId} = ${hackathonId} and ${hackathonParticipants.registrationStatus} in ('approved', 'checked_in'))`,
      })
      .where(eq(hackathons.id, hackathonId));
  });

/**
 * Refuses an acceptance that would pass maxParticipants. Call inside the
 * transaction that writes the new statuses: it locks the hackathon row, so two
 * organisers accepting at once are counted one after the other. People already
 * seated are not counted twice.
 */
export async function assertSeats(
  tx: DrizzleDB,
  hackathonId: string,
  participantIds: string[],
) {
  const [hackathon] = await tx
    .select({ max: hackathons.maxParticipants })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId))
    .for("update");
  if (!hackathon?.max || participantIds.length === 0) return;

  const [seated] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(hackathonParticipants)
    .where(
      and(
        eq(hackathonParticipants.hackathonId, hackathonId),
        inArray(hackathonParticipants.registrationStatus, [...SEATED_STATUSES]),
      ),
    );
  const [adding] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(hackathonParticipants)
    .where(
      and(
        eq(hackathonParticipants.hackathonId, hackathonId),
        inArray(hackathonParticipants.id, participantIds),
        notInArray(hackathonParticipants.registrationStatus, [
          ...SEATED_STATUSES,
        ]),
      ),
    );

  const left = Math.max(hackathon.max - (seated?.n ?? 0), 0);
  if ((adding?.n ?? 0) > left) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Only ${left} seat${left === 1 ? "" : "s"} left of ${hackathon.max}; this would accept ${adding?.n ?? 0}. Raise the capacity or accept fewer.`,
    });
  }
}

// Evicts exactly the keys a participant status change moves. The old
// `deletePattern("hackathon*")` matched both namespaces, so one badge scan
// wiped every attendee's cached registrations and the venue-wide events list.
// Each affected user's own registration list goes too, or an acceptance lands
// in their inbox while their dashboard still says pending. The hackathon row
// goes as well: every caller has just synced currentParticipants, and getById
// serves the public "spots taken" line from that cached row.
export const evictParticipantCaches = (
  cache: { delete: (key: string) => boolean },
  hackathonId: string,
  userIds: string[],
) => {
  cache.delete(CacheKeys.hackathon(hackathonId));
  cache.delete(`hackathon:${hackathonId}:participants`);
  cache.delete(`hackathon:${hackathonId}:analytics`);
  for (const userId of new Set(userIds)) {
    cache.delete(`hackathon:registrations:${userId}`);
  }
};
