import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { events, eventCheckIns, members, admins } from "@query/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Admin middleware
const isAdmin = protectedProcedure.use(async ({ ctx, next }) => {
  const admin = await ctx.db.query.admins.findFirst({
    where: and(
      eq(admins.userId, ctx.userId!),
      eq(admins.isActive, true)
    ),
  });

  if (!admin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({ ctx: { ...ctx, admin } });
});

export const eventRouter = createTRPCRouter({
  // ADMIN: Create event
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

      const [newEvent] = await ctx.db
        .insert(events)
        .values({
          ...input,
          qrCode,
          createdById: ctx.userId!,
        })
        .returning();

      return newEvent;
    }),

  // ADMIN: Regenerate QR code for an event
  regenerateQR: isAdmin
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const newQrCode = randomUUID();

      const [updatedEvent] = await ctx.db
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

      return updatedEvent;
    }),

  // ADMIN: List all events
  listAll: isAdmin.query(async ({ ctx }) => {
    const allEvents = await ctx.db.query.events.findMany({
      orderBy: (events, { desc }) => [desc(events.eventDate)],
      with: {
        createdBy: {
          columns: {
            name: true,
            email: true,
          },
        },
      },
      limit: 100,
    });

    return allEvents;
  }),

  // ADMIN: Get event with check-ins
  getById: isAdmin
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const event = await ctx.db.query.events.findFirst({
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

  // ADMIN: Toggle check-in enabled
  toggleCheckIn: isAdmin
    .input(
      z.object({
        eventId: z.string().uuid(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updatedEvent] = await ctx.db
        .update(events)
        .set({
          checkInEnabled: input.enabled,
          updatedAt: new Date(),
        })
        .where(eq(events.id, input.eventId))
        .returning();

      return updatedEvent;
    }),

  // ADMIN: Delete event
  delete: isAdmin
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(events).where(eq(events.id, input.eventId));
      return { success: true };
    }),

  // MEMBER: Check in to event via QR code (OPTIMIZED - Single Query)
  checkIn: protectedProcedure
    .input(z.object({ qrCode: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Single transaction with all checks and inserts
      return await ctx.db.transaction(async (tx) => {
        // 1. Get event and validate in one query
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

        // 2. Check max capacity
        if (event.maxCheckIns && event.currentCheckIns >= event.maxCheckIns) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Event is full",
          });
        }

        // 3. Get member and check for existing check-in in parallel
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

        // 4. Create check-in and update counter
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

        return {
          success: true,
          eventTitle: event.title,
        };
      });
    }),

  // MEMBER: Get my attended events
  myEvents: protectedProcedure.query(async ({ ctx }) => {
    const checkIns = await ctx.db.query.eventCheckIns.findMany({
      where: eq(eventCheckIns.userId, ctx.userId!),
      with: {
        event: {
          columns: {
            id: true,
            title: true,
            description: true,
            location: true,
            eventDate: true,
          },
        },
      },
      orderBy: (eventCheckIns, { desc }) => [desc(eventCheckIns.checkedInAt)],
      limit: 50,
    });

    return checkIns;
  }),

  // MEMBER: Get my stats (OPTIMIZED - Single Aggregation Query)
  myStats: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .select({
        totalEvents: sql<number>`count(*)::int`,
      })
      .from(eventCheckIns)
      .where(eq(eventCheckIns.userId, ctx.userId!));

    return {
      totalEvents: result[0]?.totalEvents ?? 0,
    };
  }),
});