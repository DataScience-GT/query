// Event check-in at the door: scans, manual admits and attendance fixes.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { isScanner } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import {
  fullName,
  personName,
  recordEventAttendance,
  searchParticipants,
} from "../../../services/points";
import { flaggingRuleBreaks } from "../../../services/check-in-flags";
import {
  hackathonParticipants,
  hackathonEvents,
  hackathonEventAttendees,
} from "@query/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { checkInParticipant } from "./check-in-participant";

export const checkInProcedures = {
  // Who scanned into one event. The scanner writes these rows and nothing ever
  // read them, so a station left on the wrong event produced dozens of check-ins
  // an organiser could count but not inspect.
  getEventAttendees: isScanner
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      // Scoped through the event's own hackathonId rather than the pair in the
      // input, so an eventId from another edition returns nothing.
      const event = await db.query.hackathonEvents.findFirst({
        where: and(
          eq(hackathonEvents.id, input.eventId),
          eq(hackathonEvents.hackathonId, input.hackathonId),
        ),
        columns: { id: true },
      });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      const [rows, [totals]] = await Promise.all([
        db.query.hackathonEventAttendees.findMany({
          where: eq(hackathonEventAttendees.eventId, input.eventId),
          with: {
            participant: {
              columns: { id: true, firstName: true, lastName: true },
              with: { user: { columns: { name: true, email: true } } },
            },
          },
          orderBy: (attendees, { desc }) => [desc(attendees.checkedInAt)],
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(hackathonEventAttendees)
          .where(eq(hackathonEventAttendees.eventId, input.eventId)),
      ]);

      return { attendees: rows, matching: totals?.count ?? 0 };
    }),

  // Undoes one scan. The scan path is hard to fool — duplicates CONFLICT, ended
  // events are FORBIDDEN — but none of that helps when the mistake is the event
  // itself. Somebody has to be able to take a row back out.
  removeEventAttendance: isScanner
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        participantId: z.string().uuid("Invalid participant ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const event = await db.query.hackathonEvents.findFirst({
        where: and(
          eq(hackathonEvents.id, input.eventId),
          eq(hackathonEvents.hackathonId, input.hackathonId),
        ),
        columns: { id: true },
      });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      // RETURNING rather than a preceding existence check: it names the row this
      // statement removed, so a scan already undone reads as "nothing to undo".
      const deleted = await db
        .delete(hackathonEventAttendees)
        .where(
          and(
            eq(hackathonEventAttendees.eventId, input.eventId),
            eq(hackathonEventAttendees.participantId, input.participantId),
          ),
        )
        .returning({
          id: hackathonEventAttendees.id,
          pointsAwarded: hackathonEventAttendees.pointsAwarded,
        });

      if (deleted.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That participant is not checked into this event.",
        });
      }

      // Volunteers reach this, so it is the widest-held destructive action in the
      // product — worth a record of who undid which scan.
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.removeEventAttendance",
        resourceId: input.participantId,
        severity: "warn",
        metadata: {
          eventId: input.eventId,
          hackathonId: input.hackathonId,
          // The row carried the points, so undoing it takes them back.
          pointsRemoved: deleted[0]?.pointsAwarded ?? 0,
        },
      });

      ctx.cache.delete(`hackathon:${input.hackathonId}:events`);

      return { success: true };
    }),

  scanParticipantPass: isScanner
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        participantId: z.string().uuid("Invalid participant ID"),
      }),
    )
    .mutation(({ ctx, input }) =>
      checkInParticipant(
        { db: ctx.db as DrizzleDB, cache: ctx.cache, userId: ctx.userId },
        input,
        "scan",
      ),
    ),

  // The desk for a hacker with no phone: staff look at a photo ID, find the
  // person by name and admit them. The same check-in as a pass scan, recorded
  // as a manual one, with a trail of who vouched for whom since no pass was
  // read.
  admit: isScanner
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        participantId: z.string().uuid("Invalid participant ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const result = await checkInParticipant(
        { db, cache: ctx.cache, userId: ctx.userId },
        input,
        "manual",
      );

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.admit",
        resourceId: input.participantId,
        metadata: {
          eventId: input.eventId,
          hackathonId: input.hackathonId,
          checkedIn: result.checkedIn,
        },
      });

      return result;
    }),

  // The station without a camera: staff type part of a name or email. Each
  // match says whether that person is already in this event, so the list
  // answers "did I get them?" without a second lookup.
  searchEventCheckIn: isScanner
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        query: z.string().trim().min(1).max(120),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const event = await db.query.hackathonEvents.findFirst({
        where: and(
          eq(hackathonEvents.id, input.eventId),
          eq(hackathonEvents.hackathonId, input.hackathonId),
        ),
        columns: { id: true },
      });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      const matches = await searchParticipants(db, {
        hackathonId: input.hackathonId,
        query: input.query,
        limit: 20,
      });

      const attended =
        matches.length === 0
          ? []
          : await db
              .select({ participantId: hackathonEventAttendees.participantId })
              .from(hackathonEventAttendees)
              .where(
                and(
                  eq(hackathonEventAttendees.eventId, input.eventId),
                  inArray(
                    hackathonEventAttendees.participantId,
                    matches.map((match) => match.id),
                  ),
                ),
              );
      const inEvent = new Set(attended.map((row) => row.participantId));

      return matches.map((match) => ({
        ...match,
        checkedIntoEvent: inEvent.has(match.id),
      }));
    }),

  // Checks one person in by name. Unlike the pass scan it never admits anyone
  // to the hackathon: arrival happens at the registration desk, and a name in
  // a search box is not proof somebody is in the building.
  manualEventCheckIn: isScanner
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        participantId: z.string().uuid("Invalid participant ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const [participant, event] = await Promise.all([
        db.query.hackathonParticipants.findFirst({
          where: and(
            eq(hackathonParticipants.id, input.participantId),
            eq(hackathonParticipants.hackathonId, input.hackathonId),
          ),
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            registrationStatus: true,
          },
          with: { user: { columns: { name: true, email: true } } },
        }),
        db.query.hackathonEvents.findFirst({
          where: and(
            eq(hackathonEvents.id, input.eventId),
            eq(hackathonEvents.hackathonId, input.hackathonId),
          ),
          columns: {
            id: true,
            name: true,
            type: true,
            points: true,
            startTime: true,
            endTime: true,
          },
        }),
      ]);

      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person is not registered for this hackathon.",
        });
      }

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      const name = fullName(
        personName({ ...participant, accountName: participant.user.name }),
        participant.user.email,
      );

      if (participant.registrationStatus !== "checked_in") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${name} has not checked in at the registration desk yet. Send them there first.`,
        });
      }

      // Same bound as the pass scan, for the same reason: a station left on
      // a finished event keeps handing out its points.
      if (event.endTime < new Date()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${event.name} has already ended. Credit somebody who was there with a points adjustment.`,
        });
      }

      const { pointsAwarded } = await flaggingRuleBreaks(
        db,
        input.hackathonId,
        () =>
          recordEventAttendance(db, {
            event,
            participant: { id: participant.id, name },
            method: "manual",
            actorId: ctx.userId,
          }),
      );

      ctx.cache.delete(`hackathon:${input.hackathonId}:events`);

      return { name, eventName: event.name, pointsAwarded };
    }),
};
