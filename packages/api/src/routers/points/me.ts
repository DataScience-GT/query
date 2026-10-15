import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import {
  hackathons,
  hackathonEvents,
  hackathonParticipants,
  hackathonStoreItems,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { notHackathonBanned } from "../../middleware/procedures";
import { rateLimit } from "../../middleware/security";
import {
  isSoldOut,
  leaderboardName,
  normalizeCheckInCode,
  pointsShort,
  rankedLeaderboard,
  readBalance,
  readLedger,
  recordEventAttendance,
  selfCheckInWindow,
} from "../../services/points";

const scope = z.object({
  hackathonId: z.string().uuid("Invalid hackathon ID"),
});

// Points belong to a registration, not to the account, so every read starts
// from the caller's own participant row for this edition. Nothing here takes
// a participant id from the client.
async function myParticipant(
  db: DrizzleDB,
  userId: string,
  hackathonId: string,
) {
  const participant = await db.query.hackathonParticipants.findFirst({
    where: and(
      eq(hackathonParticipants.hackathonId, hackathonId),
      eq(hackathonParticipants.userId, userId),
    ),
    columns: { id: true, registrationStatus: true },
  });

  if (!participant) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "You are not registered for this hackathon.",
    });
  }

  return participant;
}

// Pending, waitlisted and rejected registrations have nothing to show yet.
function assertAccepted(participant: { registrationStatus: string }) {
  if (
    participant.registrationStatus !== "approved" &&
    participant.registrationStatus !== "checked_in"
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Points open once your registration is accepted.",
    });
  }
}

export const pointsMeRouter = createTRPCRouter({
  // Balance and every row behind it. Staff names and void reasons stay on the
  // staff side.
  summary: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const participant = await myParticipant(db, ctx.userId, input.hackathonId);
    assertAccepted(participant);

    const ledger = await readLedger(db, participant.id);

    return {
      checkedIn: participant.registrationStatus === "checked_in",
      balance: ledger.balance,
      events: ledger.attendance.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        eventName: row.eventName,
        eventStartTime: row.eventStartTime,
        checkedInAt: row.checkedInAt,
        points: row.pointsAwarded ?? 0,
        method: row.method,
      })),
      adjustments: ledger.adjustments.map((row) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        createdAt: row.createdAt,
      })),
      purchases: ledger.purchases.map((row) => ({
        id: row.id,
        itemName: row.itemName,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        total: row.total,
        createdAt: row.createdAt,
        voidedAt: row.voidedAt,
      })),
    };
  }),

  // The top of the board and where the caller stands on it. Other hackers
  // appear as "First L." with no ids.
  leaderboard: protectedProcedure
    .input(
      scope.extend({ limit: z.number().int().min(1).max(100).default(10) }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const participant = await myParticipant(
        db,
        ctx.userId,
        input.hackathonId,
      );
      assertAccepted(participant);

      const ranked = await rankedLeaderboard(db, input.hackathonId);
      const mine = ranked.find((row) => row.id === participant.id);

      return {
        entries: ranked.slice(0, input.limit).map((row) => ({
          rank: row.rank,
          name: leaderboardName(row.name),
          earned: row.earned,
          isMe: row.id === participant.id,
        })),
        // Null until the caller is checked in: only arrivals are ranked.
        me: mine ? { rank: mine.rank, earned: mine.earned } : null,
        ranked: ranked.length,
      };
    }),

  // Store status and pickup location for every accepted hacker; the catalog
  // only once they are checked in and the organisers have revealed it.
  store: protectedProcedure.input(scope).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const participant = await myParticipant(db, ctx.userId, input.hackathonId);
    assertAccepted(participant);

    const hackathon = await db.query.hackathons.findFirst({
      where: eq(hackathons.id, input.hackathonId),
      columns: {
        storeCatalogVisible: true,
        storeOpen: true,
        storeLocation: true,
      },
    });

    if (!hackathon) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Hackathon not found",
      });
    }

    const checkedIn = participant.registrationStatus === "checked_in";
    const status = {
      catalogVisible: hackathon.storeCatalogVisible,
      open: hackathon.storeOpen,
      location: hackathon.storeLocation,
      checkedIn,
    };

    if (!checkedIn || !hackathon.storeCatalogVisible) {
      return { ...status, available: null, items: [] };
    }

    const [balance, items] = await Promise.all([
      readBalance(db, participant.id),
      db
        .select({
          id: hackathonStoreItems.id,
          name: hackathonStoreItems.name,
          description: hackathonStoreItems.description,
          price: hackathonStoreItems.price,
          stock: hackathonStoreItems.stock,
          soldOut: hackathonStoreItems.soldOut,
        })
        .from(hackathonStoreItems)
        .where(
          and(
            eq(hackathonStoreItems.hackathonId, input.hackathonId),
            eq(hackathonStoreItems.archived, false),
          ),
        )
        .orderBy(
          asc(hackathonStoreItems.displayOrder),
          asc(hackathonStoreItems.name),
          asc(hackathonStoreItems.id),
        ),
    ]);

    return {
      ...status,
      available: balance.available,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        // Shown only where somebody is counting.
        stock: item.stock,
        soldOut: isSoldOut(item),
        pointsShort: pointsShort(item.price, balance.available),
      })),
    };
  }),

  // Self check-in with the code shown at the event. Every refusal says what
  // to do instead, since the hacker is standing in a doorway reading it. Behind
  // the ban gate because it writes: a banned hacker who kept their
  // registration could otherwise keep collecting points. The reads above stay
  // open, as with the rest of the API.
  checkIn: notHackathonBanned
    .input(scope.extend({ code: z.string().max(32) }))
    .mutation(async ({ ctx, input }) => {
      // There are 31^6 codes; this keeps anyone from walking the space. Per
      // user, because a whole venue shares one address.
      const limit = rateLimit(`points-code:${ctx.userId}`, 10, 0.1);
      if (!limit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many codes tried. Wait ${limit.retryAfter ?? 60} seconds, then check the code on the screen.`,
        });
      }

      const code = normalizeCheckInCode(input.code);
      if (!code) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Event codes are 6 letters and numbers. Check the code on the screen and try again.",
        });
      }

      const db = ctx.db as DrizzleDB;
      const participant = await myParticipant(
        db,
        ctx.userId,
        input.hackathonId,
      );

      // Before the code lookup, so somebody who is not here cannot use this
      // to learn which codes are live.
      if (participant.registrationStatus !== "checked_in") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            participant.registrationStatus === "approved"
              ? "Check in at the registration desk first. Event codes work once you have arrived."
              : "Only checked-in hackers can collect event points.",
        });
      }

      const event = await db.query.hackathonEvents.findFirst({
        where: and(
          eq(hackathonEvents.hackathonId, input.hackathonId),
          eq(hackathonEvents.checkInCode, code),
        ),
        columns: {
          id: true,
          name: true,
          points: true,
          startTime: true,
          endTime: true,
          selfCheckIn: true,
        },
      });

      if (!event) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No event here uses that code. Check the code on the screen and try again.",
        });
      }

      if (!event.selfCheckIn) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${event.name} is not taking codes right now. Ask staff at the door to check you in.`,
        });
      }

      const window = selfCheckInWindow(event, new Date());
      if (window === "early") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Check-in for ${event.name} opens 15 minutes before it starts.`,
        });
      }
      if (window === "ended") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${event.name} has ended, so its code no longer works.`,
        });
      }

      const { pointsAwarded } = await recordEventAttendance(db, {
        event,
        participant: { id: participant.id, name: "You" },
        method: "code",
        actorId: ctx.userId,
      });

      // The public schedule shows how many people came.
      ctx.cache.delete(`hackathon:${input.hackathonId}:events`);

      return { eventName: event.name, pointsAwarded };
    }),
});
