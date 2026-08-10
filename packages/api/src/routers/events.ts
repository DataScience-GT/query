import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { events, eventCheckIns, members, users } from "@query/db";
import { eq, and, lt, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { isAdmin, isScanner } from "../middleware/procedures";

/**
 * Postgres unique_violation. Drizzle wraps every driver error in a
 * DrizzleQueryError, which carries no `code` — the pg error holding the
 * SQLSTATE sits on `.cause` — so the chain has to be walked. Checking only the
 * top-level object silently never matches in production.
 */
const isUniqueViolation = (error: unknown) => {
  for (let cursor = error, depth = 0; cursor && depth < 5; depth++) {
    if (typeof cursor !== "object") break;
    if ((cursor as { code?: string }).code === "23505") return true;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return false;
};

export const eventRouter = createTRPCRouter({
  create: isAdmin
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        location: z.string().max(200).optional(),
        eventDate: z.date(),
        maxCheckIns: z.number().int().positive().optional(),
        membersOnly: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const qrCode = randomUUID();

      const [newEvent] = await (ctx.db as NonNullable<typeof ctx.db>)
        .insert(events)
        .values({
          ...input,
          qrCode,
          createdById: ctx.userId as string,
        })
        .returning();

      // Invalidate all event-related cache entries after creation
      ctx.cache.deletePattern("event*");

      return newEvent;
    }),

  /**
   * Corrects a club event in place.
   *
   * Without this the only way to fix a typo in a title was to delete the event
   * and make a new one — which destroys every check-in already collected
   * against it, and mints a new QR code that the printed one no longer matches.
   */
  update: isAdmin
    .input(
      z.object({
        eventId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).nullable().optional(),
        location: z.string().max(200).nullable().optional(),
        eventDate: z.date().optional(),
        /** Null removes the cap. */
        maxCheckIns: z.number().int().positive().nullable().optional(),
        membersOnly: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { eventId, ...fields } = input;

      const existing = await (
        ctx.db as NonNullable<typeof ctx.db>
      ).query.events.findFirst({
        where: eq(events.id, eventId),
        columns: { currentCheckIns: true },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }

      // A cap below the number of people already scanned would make the counter
      // read as over-full forever and refuse everyone at the door, with nothing
      // saying why.
      if (
        typeof fields.maxCheckIns === "number" &&
        fields.maxCheckIns < existing.currentCheckIns
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${existing.currentCheckIns} people have already checked in, so the cap cannot be lower than that.`,
        });
      }

      const [updated] = await (ctx.db as NonNullable<typeof ctx.db>)
        .update(events)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(events.id, eventId))
        .returning();

      ctx.cache.deletePattern(`event:${eventId}`);
      ctx.cache.deletePattern("event*");

      return updated;
    }),

  regenerateQR: isAdmin
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const newQrCode = randomUUID();

      const [updatedEvent] = await (ctx.db as NonNullable<typeof ctx.db>)
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
      ctx.cache.deletePattern("event*");

      return updatedEvent;
    }),

  listAll: isAdmin.query(async ({ ctx }) => {
    const fetchEvents = () =>
      (ctx.db as NonNullable<typeof ctx.db>).query.events.findMany({
        orderBy: (events, { desc }) => [desc(events.eventDate)],
        with: {
          createdBy: {
            columns: { name: true, email: true },
          },
        },
        limit: 100,
      });

    const cacheKey = `events:list:all`;
    const cached =
      ctx.cache.get<Awaited<ReturnType<typeof fetchEvents>>>(cacheKey);
    if (cached !== null) return cached;

    const allEvents = await fetchEvents();
    ctx.cache.set(cacheKey, allEvents, 30);
    return allEvents;
  }),

  list: publicProcedure.query(async ({ ctx }) => {
    const fetchEvents = () =>
      (ctx.db as NonNullable<typeof ctx.db>).query.events.findMany({
        orderBy: (events, { desc }) => [desc(events.eventDate)],
        limit: 50,
      });

    const cacheKey = `events:list:public`;
    const cached =
      ctx.cache.get<Awaited<ReturnType<typeof fetchEvents>>>(cacheKey);
    let allEvents = cached;

    if (!allEvents) {
      allEvents = await fetchEvents();
      ctx.cache.set(cacheKey, allEvents, 30);
    }

    const now = new Date();
    return allEvents.map((event) => {
      const { qrCode: _qrCode, ...safeEvent } = event;
      return {
        ...safeEvent,
        status:
          event.checkInEnabled &&
          event.eventDate >= new Date(now.getTime() - 24 * 60 * 60 * 1000)
            ? "open"
            : "closed",
      };
    });
  }),

  getById: isAdmin
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const event = await (
        ctx.db as NonNullable<typeof ctx.db>
      ).query.events.findFirst({
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
            orderBy: (eventCheckIns, { desc }) => [
              desc(eventCheckIns.checkedInAt),
            ],
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updatedEvent] = await (ctx.db as NonNullable<typeof ctx.db>)
        .update(events)
        .set({
          checkInEnabled: input.enabled,
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

      // Invalidate event and check-in related caches
      ctx.cache.deletePattern(`event:${input.eventId}`);
      ctx.cache.deletePattern("event*");

      return updatedEvent;
    }),

  delete: isAdmin
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Also delete associated check-ins before removing the event
      await (ctx.db as NonNullable<typeof ctx.db>)
        .delete(eventCheckIns)
        .where(eq(eventCheckIns.eventId, input.eventId));

      await (ctx.db as NonNullable<typeof ctx.db>)
        .delete(events)
        .where(eq(events.id, input.eventId));

      // Invalidate all event-related cache entries after deletion
      ctx.cache.deletePattern(`event:${input.eventId}`);
      ctx.cache.deletePattern("event*");

      return { success: true };
    }),

  checkIn: protectedProcedure
    .input(z.object({ qrCode: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
        async (tx) => {
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

          // The public listing stops advertising an event 24h after it starts;
          // the door has to agree, or a photographed QR keeps admitting people
          // long after the event is over.
          if (event.eventDate < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Check-in for this event has closed",
            });
          }

          // Every guard below reads state this transaction is about to change.
          // Locking the event row first is what makes them hold: two scanners
          // otherwise decide on identical snapshots, so the same badge lands
          // twice and a capped event overshoots.
          const [locked] = await tx
            .select({ currentCheckIns: events.currentCheckIns })
            .from(events)
            .where(eq(events.id, event.id))
            .for("update");

          const [member, existingCheckIn] = await Promise.all([
            // Club check-in no longer depends on a hackathon edition existing.
            // It used to skip this lookup entirely when none resolved, and
            // then refuse everyone at the door with "Must be a member" — at a
            // club event that has nothing to do with any hackathon.
            tx.query.members.findFirst({
              where: eq(members.userId, ctx.userId as string),
            }),
            tx.query.eventCheckIns.findFirst({
              where: and(
                eq(eventCheckIns.eventId, event.id),
                eq(eventCheckIns.userId, ctx.userId as string),
              ),
            }),
          ]);

          // An event marked open to everyone takes attendance from non-members
          // too — that is the whole point of a kickoff or an interest meeting.
          // Only an explicit false opens the door: anything else, including a
          // row read before the column existed, keeps the membership gate.
          if (event.membersOnly !== false) {
            if (!member) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Must be a member to check in",
              });
            }

            // isActive alone still admits a lapsed membership the portal
            // already reports as expired.
            if (
              !member.isActive ||
              !member.membershipEndDate ||
              member.membershipEndDate <= new Date()
            ) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Your membership is not active",
              });
            }
          }

          if (existingCheckIn) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Already checked in",
            });
          }

          // Someone already inside is a duplicate, not an extra body, so the
          // capacity gate only applies once that is ruled out.
          if (
            event.maxCheckIns &&
            locked &&
            locked.currentCheckIns >= event.maxCheckIns
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Event is full",
            });
          }

          // unique(event_id, user_id) is what actually settles a double tap:
          // the read above only rules out badges already committed when this
          // transaction began, and the loser has to read as the same conflict
          // a sequential rescan gets rather than an unexplained failure.
          try {
            await tx.insert(eventCheckIns).values({
              eventId: event.id,
              userId: ctx.userId as string,
              memberId: member?.id ?? null,
              checkInMethod: "qr_code",
            });
          } catch (error: unknown) {
            if (isUniqueViolation(error)) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Already checked in",
              });
            }
            throw error;
          }

          // The counter is the capacity, so the increment re-tests it in the
          // same statement. A scanner that got past the gate above on a stale
          // count finds no row left to claim, and throwing here takes the
          // attendance row down with the transaction.
          const claimed = await tx
            .update(events)
            .set({
              currentCheckIns: sql`${events.currentCheckIns} + 1`,
            })
            .where(
              event.maxCheckIns
                ? and(
                    eq(events.id, event.id),
                    lt(events.currentCheckIns, event.maxCheckIns),
                  )
                : eq(events.id, event.id),
            )
            .returning({ id: events.id });

          if (event.maxCheckIns && claimed.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Event is full",
            });
          }

          // Invalidate event and related caches after successful check-in
          ctx.cache.deletePattern(`event:${event.id}`);
          ctx.cache.deletePattern("event*");

          return {
            success: true,
            eventTitle: event.title,
          };
        },
      );
    }),

  /**
   * Officer-side check-in, by email.
   *
   * `checkIn` is keyed on the caller's own session, so it only records people
   * who are signed in and scanning for themselves. Nothing wrote the `manual`
   * method the schema reserves, which left a door with a queue, a member who
   * forgot their phone, or a guest at a recruiting event with no way in.
   */
  manualCheckIn: isScanner
    .input(
      z.object({
        eventId: z.string().uuid(),
        email: z.string().trim().email().max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
        async (tx) => {
          const event = await tx.query.events.findFirst({
            where: eq(events.id, input.eventId),
          });

          if (!event) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Event not found",
            });
          }

          // Stored lowercased by every writer.
          const user = await tx.query.users.findFirst({
            where: eq(users.email, input.email.toLowerCase()),
            columns: { id: true, name: true, email: true },
          });

          if (!user) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message:
                "Nobody has signed in with that email yet. They need an account first.",
            });
          }

          const [locked] = await tx
            .select({ currentCheckIns: events.currentCheckIns })
            .from(events)
            .where(eq(events.id, event.id))
            .for("update");

          const member = await tx.query.members.findFirst({
            where: eq(members.userId, user.id),
            columns: { id: true },
          });

          if (
            event.maxCheckIns &&
            locked &&
            locked.currentCheckIns >= event.maxCheckIns
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Event is full",
            });
          }

          try {
            await tx.insert(eventCheckIns).values({
              eventId: event.id,
              userId: user.id,
              memberId: member?.id ?? null,
              checkInMethod: "manual",
            });
          } catch (error: unknown) {
            if (isUniqueViolation(error)) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `${user.name ?? user.email} is already checked in.`,
              });
            }
            throw error;
          }

          const claimed = await tx
            .update(events)
            .set({ currentCheckIns: sql`${events.currentCheckIns} + 1` })
            .where(
              event.maxCheckIns
                ? and(
                    eq(events.id, event.id),
                    lt(events.currentCheckIns, event.maxCheckIns),
                  )
                : eq(events.id, event.id),
            )
            .returning({ id: events.id });

          if (event.maxCheckIns && claimed.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Event is full",
            });
          }

          ctx.cache.deletePattern(`event:${event.id}`);
          ctx.cache.deletePattern("event*");

          return {
            success: true,
            name: user.name ?? user.email,
            isMember: !!member,
          };
        },
      );
    }),

  /**
   * Officer-side check-in by scanning the member's pass.
   *
   * The club QR points the other way to the hackathon one — the event holds the
   * code and members scan it — so a door with a queue had no scannable path at
   * all. Membership is reported, not enforced: an officer scanning somebody in
   * has already made that call, and a kickoff wants the lapsed ones too.
   */
  scanMemberPass: isScanner
    .input(
      z.object({
        eventId: z.string().uuid(),
        passCode: z.string().uuid("That is not a member pass"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
        async (tx) => {
          const event = await tx.query.events.findFirst({
            where: eq(events.id, input.eventId),
          });

          if (!event) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Event not found",
            });
          }

          const member = await tx.query.members.findFirst({
            where: eq(members.passCode, input.passCode),
            columns: {
              id: true,
              userId: true,
              firstName: true,
              lastName: true,
              isActive: true,
              membershipEndDate: true,
            },
          });

          if (!member) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Unrecognised pass. It may have been rotated.",
            });
          }

          const [locked] = await tx
            .select({ currentCheckIns: events.currentCheckIns })
            .from(events)
            .where(eq(events.id, event.id))
            .for("update");

          if (
            event.maxCheckIns &&
            locked &&
            locked.currentCheckIns >= event.maxCheckIns
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Event is full",
            });
          }

          const name = `${member.firstName} ${member.lastName}`.trim();

          try {
            await tx.insert(eventCheckIns).values({
              eventId: event.id,
              userId: member.userId,
              memberId: member.id,
              checkInMethod: "qr_code",
            });
          } catch (error: unknown) {
            if (isUniqueViolation(error)) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `${name} is already checked in.`,
              });
            }
            throw error;
          }

          const claimed = await tx
            .update(events)
            .set({ currentCheckIns: sql`${events.currentCheckIns} + 1` })
            .where(
              event.maxCheckIns
                ? and(
                    eq(events.id, event.id),
                    lt(events.currentCheckIns, event.maxCheckIns),
                  )
                : eq(events.id, event.id),
            )
            .returning({ id: events.id });

          if (event.maxCheckIns && claimed.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Event is full",
            });
          }

          ctx.cache.deletePattern(`event:${event.id}`);
          ctx.cache.deletePattern("event*");

          return {
            success: true,
            name,
            membershipActive: !!(
              member.isActive &&
              member.membershipEndDate &&
              member.membershipEndDate > new Date()
            ),
          };
        },
      );
    }),

  /** The roster behind the scanner, so a mis-scan can be seen and undone. */
  attendees: isScanner
    .input(
      z.object({
        eventId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as NonNullable<typeof ctx.db>;

      const [rows, [totals]] = await Promise.all([
        db.query.eventCheckIns.findMany({
          where: eq(eventCheckIns.eventId, input.eventId),
          with: { user: { columns: { id: true, name: true, email: true } } },
          orderBy: (checkIns, { desc }) => [desc(checkIns.checkedInAt)],
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(eventCheckIns)
          .where(eq(eventCheckIns.eventId, input.eventId)),
      ]);

      return { attendees: rows, matching: totals?.count ?? 0 };
    }),

  /** Undoes one check-in. The counter is the capacity, so it moves with it. */
  removeAttendance: isScanner
    .input(
      z.object({
        eventId: z.string().uuid(),
        userId: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
        async (tx) => {
          const removed = await tx
            .delete(eventCheckIns)
            .where(
              and(
                eq(eventCheckIns.eventId, input.eventId),
                eq(eventCheckIns.userId, input.userId),
              ),
            )
            .returning({ id: eventCheckIns.id });

          if (removed.length === 0) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That person is not checked in to this event.",
            });
          }

          // Guarded so a double undo cannot drive the counter negative and
          // hand out capacity the room does not have.
          await tx
            .update(events)
            .set({ currentCheckIns: sql`${events.currentCheckIns} - 1` })
            .where(
              and(eq(events.id, input.eventId), lt(sql`0`, events.currentCheckIns)),
            );

          ctx.cache.deletePattern(`event:${input.eventId}`);
          ctx.cache.deletePattern("event*");

          return { success: true };
        },
      );
    }),

  myEvents: protectedProcedure.query(async ({ ctx }) => {
    const fetchCheckIns = () =>
      (ctx.db as NonNullable<typeof ctx.db>).query.eventCheckIns.findMany({
        where: eq(eventCheckIns.userId, ctx.userId as string),
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

    const cacheKey = `events:my:${ctx.userId}`;
    const cached =
      ctx.cache.get<Awaited<ReturnType<typeof fetchCheckIns>>>(cacheKey);
    if (cached) return cached;

    const checkIns = await fetchCheckIns();
    ctx.cache.set(cacheKey, checkIns, 60);
    return checkIns;
  }),

  myStats: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = `events:stats:${ctx.userId}`;
    const cached = ctx.cache.get<{ totalEvents: number }>(cacheKey);
    if (cached) return cached;

    const result = await (ctx.db as NonNullable<typeof ctx.db>)
      .select({ totalEvents: sql<number>`count(*)::int` })
      .from(eventCheckIns)
      .where(eq(eventCheckIns.userId, ctx.userId as string));

    const stats = { totalEvents: result[0]?.totalEvents ?? 0 };
    ctx.cache.set(cacheKey, stats, 60);
    return stats;
  }),
});
