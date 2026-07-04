import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../../trpc";
import {
  hackathons,
  hackathonEvents,
} from "@query/db";
import { eq } from "drizzle-orm";
import { isAdmin } from "../../middleware/procedures";
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
          points: z.number().int().min(0).max(1000).default(0),
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
        })
        .returning();

      ctx.cache.deletePattern("hackathon*");

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
        points: z.number().int().min(0).max(1000).optional(),
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

      const [updatedEvent] = await (ctx.db as DrizzleDB)
        .update(hackathonEvents)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(hackathonEvents.id, eventId))
        .returning();

      ctx.cache.deletePattern("hackathon*");

      return updatedEvent;
    }),


  deleteEvent: isAdmin
    .input(
      z.object({
        eventId: z.string().uuid("Invalid event ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await (
        ctx.db as DrizzleDB
      ).query.hackathonEvents.findFirst({
        where: eq(hackathonEvents.id, input.eventId),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }

      await (ctx.db as DrizzleDB)
        .delete(hackathonEvents)
        .where(eq(hackathonEvents.id, input.eventId));

      ctx.cache.deletePattern("hackathon*");

      return { success: true };
    }),


  getEvents: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:events`;

      const fetchEvents = async () => {
        const eventsData = await (
          ctx.db as DrizzleDB
        ).query.hackathonEvents.findMany({
          where: eq(hackathonEvents.hackathonId, input.hackathonId),
          orderBy: (events, { asc }) => [asc(events.startTime)],
          with: {
            attendees: {
              columns: { id: true },
            },
          },
        });

        return eventsData.map((e) => ({
          ...e,
          attendeeCount: e.attendees.length,
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
