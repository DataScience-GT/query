import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../../trpc";
import {
  hackathons,
  hackathonEvents,
  hackathonEventAttendees,
} from "@query/db";
import { eq, inArray, sql } from "drizzle-orm";
import { isAdmin } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { assertHackathonVisible } from "./visibility";
import type { DrizzleDB } from "@query/db";

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

      // The schedule for this edition, and nothing else. The old blanket
      // pattern also matched every attendee's cached registrations.
      ctx.cache.delete(`hackathon:${existing.hackathonId}:events`);

      return updatedEvent;
    }),


  deleteEvent: isAdmin
    .input(
      z.object({
        eventId: z.string().uuid("Invalid event ID"),
        /** Delete even though people have already scanned in. Their check-in
         *  rows go with it — there is no undo and no export first. */
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

      // hackathon_event_attendee cascades off this row. At a keynote that is
      // every badge scanned at the door — thousands of rows, gone on one
      // click, with nothing that can rebuild them.
      const [scans] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(hackathonEventAttendees)
        .where(eq(hackathonEventAttendees.eventId, input.eventId));

      const checkIns = scans?.count ?? 0;

      if (checkIns > 0 && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${checkIns} person(s) have already checked into "${existing.name}". Deleting the event erases those check-ins permanently.`,
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

        const eventsData = await db.query.hackathonEvents.findMany({
          where: eq(hackathonEvents.hackathonId, input.hackathonId),
          orderBy: (events, { asc }) => [asc(events.startTime)],
        });

        if (eventsData.length === 0) return [];

        // Counted in the database rather than by loading the rows. This is the
        // schedule every attendee's phone polls: eagerly joining attendees to
        // produce a handful of integers meant ~15 events x 2000 people, and it
        // shipped the whole array over the wire on the way back.
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

});
