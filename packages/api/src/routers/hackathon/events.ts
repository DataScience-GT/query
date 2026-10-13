import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../../trpc";
import {
  hackathons,
  hackathonEvents,
  hackathonEventAttendees,
} from "@query/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isAdmin, isScanner } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { assignCheckInCode } from "../../services/points";
import { assertHackathonVisible } from "./visibility";
import type { DrizzleDB } from "@query/db";

// What attending is worth. Copied onto each check-in as it happens, so a
// change here only affects check-ins from then on.
const eventPoints = z
  .number()
  .int("Points must be a whole number")
  .min(0, "Points cannot be negative")
  .max(10_000, "Points are capped at 10,000 per event");

const eventScope = z.object({
  hackathonId: z.string().uuid("Invalid hackathon ID"),
  eventId: z.string().uuid("Invalid event ID"),
});

// Scoped through the event's own hackathonId, so an eventId from another
// edition answers like one that does not exist.
const findScopedEvent = async (
  db: DrizzleDB,
  input: z.infer<typeof eventScope>,
) => {
  const event = await db.query.hackathonEvents.findFirst({
    where: and(
      eq(hackathonEvents.id, input.eventId),
      eq(hackathonEvents.hackathonId, input.hackathonId),
    ),
  });

  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
  }

  return event;
};

export const hackathonEventsRouter = createTRPCRouter({
  createEvent: isAdmin
    .input(
      z
        .object({
          hackathonId: z.string().uuid("Invalid hackathon ID"),
          name: z.string().min(1).max(200),
          description: z.string().max(2000).optional(),
          type: z.enum([
            "workshop",
            "meal",
            "ceremony",
            "activity",
            "sponsor_session",
          ]),
          location: z.string().min(1).max(500),
          startTime: z.date(),
          endTime: z.date(),
          points: eventPoints.default(0),
          selfCheckIn: z.boolean().default(false),
        })
        .refine((data) => data.endTime > data.startTime, {
          message: "End time must be after start time",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      const [newEvent] = await (ctx.db as DrizzleDB)
        .insert(hackathonEvents)
        .values({
          hackathonId: input.hackathonId,
          name: input.name,
          description: input.description,
          type: input.type,
          location: input.location,
          startTime: input.startTime,
          endTime: input.endTime,
          points: input.points,
          selfCheckIn: input.selfCheckIn,
        })
        .returning();

      ctx.cache.delete(`hackathon:${input.hackathonId}:events`);

      return newEvent;
    }),


  updateEvent: isAdmin
    .input(
      z.object({
        eventId: z.string().uuid("Invalid event ID"),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        type: z
          .enum(["workshop", "meal", "ceremony", "activity", "sponsor_session"])
          .optional(),
        location: z.string().min(1).max(500).optional(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        // Past check-ins keep the points they were given.
        points: eventPoints.optional(),
        selfCheckIn: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { eventId, ...updateData } = input;

      const existing = await (
        ctx.db as DrizzleDB
      ).query.hackathonEvents.findFirst({
        where: eq(hackathonEvents.id, eventId),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }

      // Merge with existing times for partial-update validation
      const resolvedStart = updateData.startTime ?? existing.startTime;
      const resolvedEnd = updateData.endTime ?? existing.endTime;

      if (resolvedEnd <= resolvedStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be after start time",
        });
      }

      const [updatedEvent] = await (ctx.db as DrizzleDB)
        .update(hackathonEvents)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(hackathonEvents.id, eventId))
        .returning();

      // The schedule for this edition, and nothing else. The old blanket pattern
      // also matched every attendee's cached registrations.
      ctx.cache.delete(`hackathon:${existing.hackathonId}:events`);

      return updatedEvent;
    }),


  deleteEvent: isAdmin
    .input(
      z.object({
        eventId: z.string().uuid("Invalid event ID"),
        // Delete even though people have already scanned in. Their check-in rows go
        // with it — there is no undo and no export first.
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const existing = await db.query.hackathonEvents.findFirst({
        where: eq(hackathonEvents.id, input.eventId),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }

      // hackathon_event_attendee cascades off this row. At a keynote that is every
      // badge scanned at the door — thousands of rows, gone on one click.
      const [scans] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(hackathonEventAttendees)
        .where(eq(hackathonEventAttendees.eventId, input.eventId));

      const checkIns = scans?.count ?? 0;

      if (checkIns > 0 && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${checkIns} person(s) have already checked into "${existing.name}". Deleting the event erases those check-ins and the points they earned, permanently.`,
        });
      }

      await db
        .delete(hackathonEvents)
        .where(eq(hackathonEvents.id, input.eventId));

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.deleteEvent",
        resourceId: input.eventId,
        // Forcing past the refusal destroys check-in records with no undo.
        severity: checkIns > 0 ? "critical" : "info",
        metadata: {
          name: existing.name,
          hackathonId: existing.hackathonId,
          deletedCheckIns: checkIns,
          forced: input.force,
        },
      });

      ctx.cache.delete(`hackathon:${existing.hackathonId}:events`);

      return { success: true, deletedCheckIns: checkIns };
    }),


  getEvents: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      // A draft edition's schedule is not public just because its uuid leaked.
      await assertHackathonVisible(ctx, input.hackathonId);

      const cacheKey = `hackathon:${input.hackathonId}:events`;

      const fetchEvents = async () => {
        const db = ctx.db as DrizzleDB;

        // Never the check-in code: this is public, and a code anyone can read
        // is points for anyone who never came.
        const eventsData = await db.query.hackathonEvents.findMany({
          where: eq(hackathonEvents.hackathonId, input.hackathonId),
          columns: { checkInCode: false },
          orderBy: (events, { asc }) => [asc(events.startTime)],
        });

        if (eventsData.length === 0) return [];

        // Counted in the database rather than by loading rows. This is the schedule
        // every attendee's phone polls: eagerly joining attendees for a handful of
        // integers meant ~15 events x 2000 people, shipped over the wire as well.
        const counts = await db
          .select({
            eventId: hackathonEventAttendees.eventId,
            count: sql<number>`count(*)::int`,
          })
          .from(hackathonEventAttendees)
          .where(
            inArray(
              hackathonEventAttendees.eventId,
              eventsData.map((event) => event.id),
            ),
          )
          .groupBy(hackathonEventAttendees.eventId);

        const countByEvent = new Map(
          counts.map((row) => [row.eventId, row.count]),
        );

        return eventsData.map((e) => ({
          ...e,
          // An event nobody has scanned into produces no group, not a zero row.
          attendeeCount: countByEvent.get(e.id) ?? 0,
        }));
      };

      const cached =
        ctx.cache.get<Awaited<ReturnType<typeof fetchEvents>>>(cacheKey);
      if (cached !== null) return cached;

      const events = await fetchEvents();

      ctx.cache.set(cacheKey, events, 60);

      return events;
    }),

  // The schedule as staff see it: codes included, read fresh rather than from
  // the public cache, since a rotated code has to show up straight away.
  adminGetEvents: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const [eventsData, counts] = await Promise.all([
        db.query.hackathonEvents.findMany({
          where: eq(hackathonEvents.hackathonId, input.hackathonId),
          orderBy: (events, { asc }) => [asc(events.startTime)],
        }),
        db
          .select({
            eventId: hackathonEventAttendees.eventId,
            count: sql<number>`count(*)::int`,
          })
          .from(hackathonEventAttendees)
          .innerJoin(
            hackathonEvents,
            eq(hackathonEvents.id, hackathonEventAttendees.eventId),
          )
          .where(eq(hackathonEvents.hackathonId, input.hackathonId))
          .groupBy(hackathonEventAttendees.eventId),
      ]);

      const countByEvent = new Map(
        counts.map((row) => [row.eventId, row.count]),
      );

      return eventsData.map((event) => ({
        ...event,
        attendeeCount: countByEvent.get(event.id) ?? 0,
      }));
    }),

  // What the screen at the door shows. Volunteers run doors, so any event
  // staff can read it; they can already check anyone in by name.
  getEventCheckInCode: isScanner
    .input(eventScope)
    .query(async ({ ctx, input }) => {
      const event = await findScopedEvent(ctx.db as DrizzleDB, input);

      return {
        id: event.id,
        hackathonId: event.hackathonId,
        name: event.name,
        location: event.location,
        startTime: event.startTime,
        endTime: event.endTime,
        points: event.points,
        selfCheckIn: event.selfCheckIn,
        checkInCode: event.checkInCode,
      };
    }),

  // Issues a code, or replaces the current one. Rotating is the answer to a
  // code that got posted in a group chat: the old one stops working at once.
  generateEventCheckInCode: isAdmin
    .input(eventScope)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const event = await findScopedEvent(db, input);

      const checkInCode = await assignCheckInCode(db, event);

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: event.checkInCode
          ? "hackathon.rotateEventCheckInCode"
          : "hackathon.generateEventCheckInCode",
        resourceId: event.id,
        metadata: { hackathonId: event.hackathonId, name: event.name },
      });

      return { checkInCode };
    }),

  // Takes the code away. Self check-in stays switched however it was; with no
  // code there is nothing to type, so it simply stops admitting anyone.
  clearEventCheckInCode: isAdmin
    .input(eventScope)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const event = await findScopedEvent(db, input);

      await db
        .update(hackathonEvents)
        .set({ checkInCode: null, updatedAt: new Date() })
        .where(eq(hackathonEvents.id, event.id));

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.clearEventCheckInCode",
        resourceId: event.id,
        metadata: { hackathonId: event.hackathonId, name: event.name },
      });

      return { success: true };
    }),
});
