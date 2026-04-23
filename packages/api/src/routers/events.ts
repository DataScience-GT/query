import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { events, eventCheckIns, members } from "@query/db";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { isAdmin } from "../middleware/procedures";

export const eventRouter = createTRPCRouter({
  create: isAdmin
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        location: z.string().max(200).optional(),
        eventDate: z.date(),
        maxCheckIns: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const qrCode = randomUUID();

      const [newEvent] = await ctx.db!
        .insert(events)
        .values({
          ...input,
          qrCode,
          createdById: ctx.userId!,
        })
        .returning();

      // Invalidate all event-related cache entries after creation
      ctx.cache.deletePattern('event*');

      return newEvent;
    }),

  regenerateQR: isAdmin
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const newQrCode = randomUUID();

      const [updatedEvent] = await ctx.db!
        .update(events)
        .set({
          qrCode: newQrCode,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId))
        .returning();

      if (!updatedEvent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      // Invalidate event and related caches after QR regeneration
      ctx.cache.deletePattern(`event:${input.eventId}`);
      ctx.cache.deletePattern('event*');

      return updatedEvent;
    }),

  listAll: isAdmin.query(async ({ ctx }) => {
    const cacheKey = `events:list:all`;
    const cached = ctx.cache.get<Awaited<ReturnType<typeof ctx.db!.query.events.findMany>>>(cacheKey);
    if (cached) return cached;

    const allEvents = await ctx.db!.query.events.findMany({
      orderBy: (events, { desc }) => [desc(events.eventDate)],
      with: {
        createdBy: {
          columns: { name: true, email: true },
        },
      },
      limit: 100,
    });

    ctx.cache.set(cacheKey, allEvents, 30);
    return allEvents;
  }),

  getById: isAdmin
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const event = await ctx.db!.query.events.findFirst({
        where: eq(events.id, input.id),
        with: {
          checkIns: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
              member: {
                columns: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: (eventCheckIns, { desc }) => [desc(eventCheckIns.checkedInAt)],
          },
        },
      });

      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found",
        });
      }

      return event;
    }),

  toggleCheckIn: isAdmin
    .input(
      z.object({
        eventId: z.string().uuid(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updatedEvent] = await ctx.db!
        .update(events)
        .set({
          checkInEnabled: input.enabled,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId))
        .returning();

      // Invalidate event and check-in related caches
      ctx.cache.deletePattern(`event:${input.eventId}`);
      ctx.cache.deletePattern('event*');

      return updatedEvent;
    }),

  delete: isAdmin
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Also delete associated check-ins before removing the event
      await ctx.db!.delete(eventCheckIns).where(eq(eventCheckIns.eventId, input.eventId));

      await ctx.db!.delete(events).where(eq(events.id, input.eventId));

      // Invalidate all event-related cache entries after deletion
      ctx.cache.deletePattern(`event:${input.eventId}`);
      ctx.cache.deletePattern('event*');

      return { success: true };
    }),

  checkIn: protectedProcedure
    .input(z.object({ qrCode: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db!.transaction(async (tx) => {
        const event = await tx.query.events.findFirst({
          where: eq(events.qrCode, input.qrCode),
        });

        if (!event) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invalid QR code",
          });
        }

        if (!event.checkInEnabled) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Check-in not enabled for this event",
          });
        }

        if (event.maxCheckIns && event.currentCheckIns >= event.maxCheckIns) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Event is full",
          });
        }

        const [member, existingCheckIn] = await Promise.all([
          tx.query.members.findFirst({
            where: eq(members.userId, ctx.userId!),
          }),
          tx.query.eventCheckIns.findFirst({
            where: and(
              eq(eventCheckIns.eventId, event.id),
              eq(eventCheckIns.userId, ctx.userId!)
            ),
          }),
        ]);

        if (!member) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Must be a member to check in",
          });
        }

        if (existingCheckIn) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Already checked in",
          });
        }

        await Promise.all([
          tx.insert(eventCheckIns).values({
            eventId: event.id,
            userId: ctx.userId!,
            memberId: member.id,
            checkInMethod: "qr_code",
          }),
          tx
            .update(events)
            .set({
              currentCheckIns: sql`${events.currentCheckIns} + 1`,
            })
            .where(eq(events.id, event.id)),
        ]);

        // Invalidate event and related caches after successful check-in
        ctx.cache.deletePattern(`event:${event.id}`);
        ctx.cache.deletePattern('event*');

        return {
          success: true,
          eventTitle: event.title,
        };
      });
    }),

  myEvents: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = `events:my:${ctx.userId}`;
    const cached = ctx.cache.get<{ totalEvents: number }>(cacheKey);
    if (cached) return cached;

    const checkIns = await ctx.db!.query.eventCheckIns.findMany({
      where: eq(eventCheckIns.userId, ctx.userId!),
      with: {
        event: {
          columns: { id: true, title: true, description: true, location: true, eventDate: true },
        },
      },
      orderBy: (eventCheckIns, { desc }) => [desc(eventCheckIns.checkedInAt)],
      limit: 50,
    });

    ctx.cache.set(cacheKey, checkIns, 60);
    return checkIns;
  }),

  myStats: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = `events:stats:${ctx.userId}`;
    const cached = ctx.cache.get<{ totalEvents: number }>(cacheKey);
    if (cached) return cached;

    const result = await ctx.db!
      .select({ totalEvents: sql<number>`count(*)::int` })
      .from(eventCheckIns)
      .where(eq(eventCheckIns.userId, ctx.userId!));

    const stats = { totalEvents: result[0]?.totalEvents ?? 0 };
    ctx.cache.set(cacheKey, stats, 60);
    return stats;
  }),
});