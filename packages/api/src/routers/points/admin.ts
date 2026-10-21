import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  hackathonEvents,
  hackathonEventAttendees,
  hackathonParticipants,
  hackathonPointAdjustments,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter } from "../../trpc";
import { isAdmin } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import {
  fullName,
  personName,
  rankedLeaderboard,
  readBalance,
  readLedger,
} from "../../services/points";

const participantScope = z.object({
  hackathonId: z.string().uuid("Invalid hackathon ID"),
  participantId: z.string().uuid("Invalid participant ID"),
});

// Staff tools for points: adjustments, one person's ledger, the whole board,
// and how each event's check-ins came in. Check-in codes live with the events
// (hackathon.generateEventCheckInCode) and manual check-in with the other
// station tools (hackathon.manualEventCheckIn).
export const pointsAdminRouter = createTRPCRouter({
  // Points added or taken away by hand, always with the reason, which the
  // hacker sees on their own history.
  adjust: isAdmin
    .input(
      participantScope.extend({
        delta: z
          .number()
          .int("Adjust by a whole number of points")
          .min(-1000, "Adjust by at most 1,000 points at a time")
          .max(1000, "Adjust by at most 1,000 points at a time")
          .refine((delta) => delta !== 0, "An adjustment of 0 changes nothing"),
        reason: z
          .string()
          .trim()
          .min(1, "Say why, so the hacker can see it on their history")
          .max(300),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const result = await db.transaction(async (tx) => {
        // Locked the way a purchase locks it, so a deduction and a purchase
        // for the same person are decided one after the other.
        const [participant] = await tx
          .select({ id: hackathonParticipants.id })
          .from(hackathonParticipants)
          .where(
            and(
              eq(hackathonParticipants.id, input.participantId),
              eq(hackathonParticipants.hackathonId, input.hackathonId),
            ),
          )
          .for("update");

        if (!participant) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That person is not registered for this hackathon.",
          });
        }

        const [adjustment] = await tx
          .insert(hackathonPointAdjustments)
          .values({
            hackathonId: input.hackathonId,
            participantId: participant.id,
            delta: input.delta,
            reason: input.reason,
            actorId: ctx.userId,
          })
          .returning();

        return {
          adjustment: adjustment!,
          balance: await readBalance(tx, participant.id),
        };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "points.adjust",
        resourceId: input.participantId,
        severity: input.delta < 0 ? "warn" : "info",
        metadata: {
          hackathonId: input.hackathonId,
          adjustmentId: result.adjustment.id,
          delta: input.delta,
          reason: input.reason,
        },
      });

      return result;
    }),

  // Everything behind one person's balance, with who did what.
  ledger: isAdmin.input(participantScope).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;

    const participant = await db.query.hackathonParticipants.findFirst({
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
    });

    if (!participant) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "That person is not registered for this hackathon.",
      });
    }

    const ledger = await readLedger(db, participant.id);

    const actorIds = new Set<string>();
    for (const row of ledger.attendance) {
      if (row.checkedInById) actorIds.add(row.checkedInById);
    }
    for (const row of ledger.adjustments) {
      if (row.actorId) actorIds.add(row.actorId);
    }
    for (const row of ledger.purchases) {
      if (row.actorId) actorIds.add(row.actorId);
      if (row.voidedById) actorIds.add(row.voidedById);
    }

    const actors =
      actorIds.size === 0
        ? []
        : await db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(inArray(users.id, [...actorIds]));
    const actorName = new Map(
      actors.map((actor) => [actor.id, actor.name || actor.email]),
    );
    const nameOf = (id: string | null) =>
      id ? (actorName.get(id) ?? null) : null;

    return {
      participant: {
        id: participant.id,
        name: fullName(
          personName({ ...participant, accountName: participant.user.name }),
          participant.user.email,
        ),
        email: participant.user.email,
        registrationStatus: participant.registrationStatus,
      },
      balance: ledger.balance,
      attendance: ledger.attendance.map((row) => ({
        ...row,
        checkedInByName: nameOf(row.checkedInById),
      })),
      adjustments: ledger.adjustments.map((row) => ({
        ...row,
        actorName: nameOf(row.actorId),
      })),
      purchases: ledger.purchases.map((row) => ({
        ...row,
        actorName: nameOf(row.actorId),
        voidedByName: nameOf(row.voidedById),
      })),
    };
  }),

  // The whole board with full names and spending, for staff.
  leaderboard: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const ranked = await rankedLeaderboard(
        ctx.db as DrizzleDB,
        input.hackathonId,
      );

      return ranked.map((row) => ({
        rank: row.rank,
        participantId: row.id,
        name: fullName(row.name, row.email),
        email: row.email,
        ...row.balance,
      }));
    }),

  // How each event's check-ins arrived and what they paid out. An event with
  // nobody in it still gets a row.
  attendance: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const method = hackathonEventAttendees.method;

      return db
        .select({
          eventId: hackathonEvents.id,
          name: hackathonEvents.name,
          type: hackathonEvents.type,
          startTime: hackathonEvents.startTime,
          endTime: hackathonEvents.endTime,
          points: hackathonEvents.points,
          selfCheckIn: hackathonEvents.selfCheckIn,
          hasCode: sql<boolean>`${hackathonEvents.checkInCode} is not null`,
          total: sql<number>`count(${hackathonEventAttendees.id})::int`,
          byScan: sql<number>`(count(*) filter (where ${method} = 'scan'))::int`,
          byCode: sql<number>`(count(*) filter (where ${method} = 'code'))::int`,
          byManual: sql<number>`(count(*) filter (where ${method} = 'manual'))::int`,
          pointsAwarded: sql<number>`coalesce(sum(${hackathonEventAttendees.pointsAwarded}), 0)::int`,
        })
        .from(hackathonEvents)
        .leftJoin(
          hackathonEventAttendees,
          eq(hackathonEventAttendees.eventId, hackathonEvents.id),
        )
        .where(eq(hackathonEvents.hackathonId, input.hackathonId))
        .groupBy(hackathonEvents.id)
        .orderBy(asc(hackathonEvents.startTime), asc(hackathonEvents.id));
    }),
});
