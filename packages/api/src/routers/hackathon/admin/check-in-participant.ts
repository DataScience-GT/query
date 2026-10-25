// Checking one participant into an event and, on first arrival, the hackathon.

import { TRPCError } from "@trpc/server";
import {
  alreadyCheckedInMessage,
  recordEventAttendance,
} from "../../../services/points";
import { flaggingRuleBreaks } from "../../../services/check-in-flags";
import {
  hackathonParticipants,
  hackathonEvents,
  hackathonEventAttendees,
} from "@query/db";
import { eq, and } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { evictParticipantCaches } from "./seats";

/**
 * Checks one accepted participant into one event and, on their first arrival,
 * into the hackathon. A pass scan and the desk's manual admit are this same
 * write; they differ only in how the staffer knew who was in front of them,
 * which is what the attendance row records as its method.
 */
export async function checkInParticipant(
  ctx: {
    db: DrizzleDB;
    cache: { delete: (key: string) => boolean };
    userId: string;
  },
  input: { hackathonId: string; eventId: string; participantId: string },
  method: "scan" | "manual",
) {
  // 1. Verify participant exists and belongs to this hackathon
  const participant = await ctx.db.query.hackathonParticipants.findFirst({
    where: and(
      eq(hackathonParticipants.id, input.participantId),
      eq(hackathonParticipants.hackathonId, input.hackathonId),
    ),
    with: { user: true },
  });

  if (!participant) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Participant not found or not registered for this hackathon.",
    });
  }

  // 1b. Only accepted participants may check in. Pending and waitlisted are not
  // yet admitted; rejected never are.
  if (
    participant.registrationStatus !== "approved" &&
    participant.registrationStatus !== "checked_in"
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${participant.user.name || participant.user.email} is not accepted for this hackathon (status: ${participant.registrationStatus}).`,
    });
  }

  // 2. Verify event exists and belongs to this hackathon
  const event = await ctx.db.query.hackathonEvents.findFirst({
    where: and(
      eq(hackathonEvents.id, input.eventId),
      eq(hackathonEvents.hackathonId, input.hackathonId),
    ),
  });

  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
  }

  // 2b. A pass is only good for the window the event runs in. Nothing else
  // bounds a scan, so a scanner left on the wrong event would keep admitting
  // people to a meal that finished hours ago.
  if (event.endTime < new Date()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${event.name} has already ended.`,
    });
  }

  // 3. Check for existing check-in to prevent duplicates
  const existingScan = await ctx.db.query.hackathonEventAttendees.findFirst({
    where: and(
      eq(hackathonEventAttendees.eventId, input.eventId),
      eq(hackathonEventAttendees.participantId, input.participantId),
    ),
  });

  const attendance = {
    event,
    participant: {
      id: participant.id,
      name: participant.user.name || participant.user.email,
    },
    method,
    actorId: ctx.userId,
  };

  if (existingScan) {
    throw new TRPCError({
      code: "CONFLICT",
      message: alreadyCheckedInMessage(attendance),
    });
  }

  // 4. Record attendance. The unique index is the real guard, and
  // recordEventAttendance turns a racing scanner's 23505 into the same
  // conflict as the read above. It also refuses an event that overlaps, or
  // comes too soon after, one this person is already in; that refusal ends the
  // scan before the promotion below.
  // Attendance and the roster promotion are one transaction. Split, a promotion
  // failing after the attendance row committed left the scan half-done — and
  // the retry hits the duplicate guard, so that attendee could never submit.
  // Rolling the attendance back makes a rescan the fix.
  let promotedToCheckedIn = false;

  const attendAndPromote = () => ctx.db.transaction(async (tx) => {
    await recordEventAttendance(tx, attendance);

    // The first scan is the check-in. `checked_in` previously had no writer
    // anywhere, which was harmless while it was only a label — but submitting now
    // requires it, so nobody could submit and the error told them to do what they
    // had just done. `registrationStatus = 'approved'` is in the WHERE, not only
    // the read: a rejection landing between read and write would otherwise be
    // overwritten. `checkedInAt` is stamped once, so it points at arrival.
    const [promoted] = await tx
      .update(hackathonParticipants)
      .set({
        registrationStatus: "checked_in",
        ...(participant.checkedInAt ? {} : { checkedInAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(hackathonParticipants.id, input.participantId),
          eq(hackathonParticipants.registrationStatus, "approved"),
        ),
      )
      .returning({ id: hackathonParticipants.id });

    promotedToCheckedIn = !!promoted;
  });

  // A refusal for the check-in rules rolls that transaction back, so the flag
  // for organisers is written here, on the pool, once it has.
  await flaggingRuleBreaks(ctx.db, input.hackathonId, attendAndPromote);

  // A scan changes one event's attendee count and, on the first one, this
  // attendee's roster row. This runs at every door all weekend, so eviction
  // stays narrow — the old blanket pattern wiped every cached registration.
  ctx.cache.delete(`hackathon:${input.hackathonId}:events`);

  if (promotedToCheckedIn) {
    evictParticipantCaches(ctx.cache, input.hackathonId, [participant.userId]);
  }

  return {
    success: true,
    checkedIn: promotedToCheckedIn,
    pointsAwarded: event.points,
    eventName: event.name,
    name: participant.user.name || participant.user.email,
    message: `Successfully checked in ${participant.user.name || participant.user.email}!`,
  };
}
