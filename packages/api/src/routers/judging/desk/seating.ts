// Who is at the desk, where they sit, and the messages they see.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import {
  hackathons,
  judgingAnnouncements,
  judgingBuildings,
  judgingPresence,
  judgingRooms,
} from "@query/db";
import {
  asJudge,
  nameGuest,
  seatJudge,
} from "../../../services/judging/principal";
import {
  guestScope,
  judgingSwitches,
  loadChallenges,
  memberScope,
  reconcileDueDrafts,
  seatOf,
} from "../../../services/judging/evaluation-store";
import {
  effectiveMode,
  rootOf,
  sameLabel,
} from "../../../services/judging/scope";
import {
  deskProcedure,
  judgeProcedure,
  uuid,
  modeOf,
  roomSummary,
  openRoomId,
  preferredTrackOf,
} from "./shared";

export const seatingProcedures = {
  // Who is at the desk, which edition, which room, and where judging stands.
  // A guest who has not given a name yet gets `needsName` and little else.
  context: deskProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    const { principal } = ctx;
    const judge = asJudge(principal);
    if (judge) await reconcileDueDrafts(db, input.hackathonId);

    const [hackathon] = await db
      .select({ id: hackathons.id, name: hackathons.name })
      .from(hackathons)
      .where(eq(hackathons.id, input.hackathonId))
      .limit(1);
    if (!hackathon) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message:
          "That hackathon does not exist. Open the desk from the judging page.",
      });
    }

    const challenges = await loadChallenges(db, input.hackathonId);
    const switches = await judgingSwitches(db, input.hackathonId);
    const seat = judge ? await seatOf(db, judge.judgeId, challenges) : null;
    const roomId =
      principal.kind === "guest" ? principal.roomId : (seat?.roomId ?? null);
    // A guest sees their room's challenge; a table judge sees General's and,
    // from a seat in its room, a sponsor's.
    const visible =
      principal.kind === "guest"
        ? guestScope(challenges, principal.roomChallengeId)
        : memberScope(challenges, seat);

    return {
      kind: principal.kind,
      needsName: !judge,
      judge: judge
        ? { id: judge.judgeId, displayName: judge.displayName }
        : null,
      hackathon,
      state: switches.state,
      showAllScores: principal.kind === "member" && switches.showAllScores,
      room: roomId ? await roomSummary(db, roomId, challenges) : null,
      challenges: challenges
        .filter((c) => visible.has(c.id))
        .map((c) => ({
          id: c.id,
          label: c.label,
          parentId: c.parentId,
          isGeneral: c.isGeneral,
          isGroup: c.isGroup,
          mode: modeOf(challenges, c),
        })),
      serverNow: new Date(),
    };
  }),

  // The guest name gate. Creates the guest's judge row and seats them in the
  // room their QR code opened.
  setGuestName: deskProcedure
    .input(
      z.object({
        displayName: z
          .string()
          .trim()
          .min(1, "Enter your name.")
          .max(80, "Keep your name under 80 characters."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.principal.kind !== "guest") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You are signed in as a judge, so there is no guest name to set.",
        });
      }
      return nameGuest(
        ctx.db,
        ctx.principal,
        input.displayName.replace(/\s+/g, " "),
      );
    }),

  // Open rooms and tables to sit at. A guest sees only their own.
  rooms: judgeProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    const challenges = await loadChallenges(db, input.hackathonId);
    const seat = await seatOf(db, ctx.judge.judgeId, challenges);
    const track =
      ctx.judge.kind === "member"
        ? await preferredTrackOf(db, ctx.judge.userId, input.hackathonId)
        : null;
    const rows = await db
      .select({
        id: judgingRooms.id,
        name: judgingRooms.name,
        kind: judgingRooms.kind,
        buildingName: judgingBuildings.name,
        challengeId: judgingRooms.challengeId,
      })
      .from(judgingRooms)
      .leftJoin(
        judgingBuildings,
        eq(judgingBuildings.id, judgingRooms.buildingId),
      )
      .where(
        and(
          eq(judgingRooms.hackathonId, input.hackathonId),
          isNull(judgingRooms.archivedAt),
          ctx.judge.kind === "guest"
            ? eq(judgingRooms.id, ctx.judge.roomId)
            : undefined,
        ),
      )
      .orderBy(asc(judgingRooms.displayOrder), asc(judgingRooms.name));
    const labelOf = new Map(challenges.map((c) => [c.id, c.label]));

    return {
      currentRoomId: seat?.roomId ?? null,
      rooms: rows.map((room) => ({
        ...room,
        challengeLabel: labelOf.get(room.challengeId) ?? "",
        mode: effectiveMode(challenges, room.challengeId) ?? "scheduled",
        // The room serves the track the judge applied for, by its challenge
        // or the group that challenge sits in.
        yourTrack:
          !!track &&
          [
            labelOf.get(room.challengeId),
            rootOf(challenges, room.challengeId)?.label,
          ].some((label) => !!label && sameLabel(label, track)),
      })),
    };
  }),

  joinRoom: judgeProcedure
    .input(z.object({ roomId: uuid }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.judge.kind !== "member") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Guest judges stay at the room or table their QR code opened.",
        });
      }
      const [room] = await ctx.db
        .select({ id: judgingRooms.id })
        .from(judgingRooms)
        .where(
          and(
            eq(judgingRooms.id, input.roomId),
            eq(judgingRooms.hackathonId, input.hackathonId),
            isNull(judgingRooms.archivedAt),
          ),
        )
        .limit(1);
      if (!room) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "That room or table is not open for judging. Pick another from the list.",
        });
      }
      const judgeId = ctx.judge.judgeId;
      await ctx.db.transaction((tx) =>
        seatJudge(tx, {
          judgeId,
          roomId: room.id,
          hackathonId: input.hackathonId,
        }),
      );
      return { roomId: room.id };
    }),

  leaveRoom: judgeProcedure.mutation(async ({ ctx }) => {
    if (ctx.judge.kind !== "member") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Guest judges stay at the room or table their QR code opened.",
      });
    }
    const closed = await ctx.db
      .update(judgingPresence)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(judgingPresence.judgeId, ctx.judge.judgeId),
          isNull(judgingPresence.leftAt),
        ),
      )
      .returning({ id: judgingPresence.id });
    return { left: closed.length > 0 };
  }),

  // Tells organisers the judge is still in the room (polled every 60s).
  heartbeat: judgeProcedure.mutation(async ({ ctx }) => {
    const [seat] = await ctx.db
      .update(judgingPresence)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(judgingPresence.judgeId, ctx.judge.judgeId),
          isNull(judgingPresence.leftAt),
        ),
      )
      .returning({ roomId: judgingPresence.roomId });
    return { roomId: seat?.roomId ?? null };
  }),

  // The edition-wide message and the judge's room's, global first. Guests see
  // only messages organisers marked for them.
  announcements: judgeProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    const roomId =
      ctx.judge.kind === "guest"
        ? ctx.judge.roomId
        : await openRoomId(db, ctx.judge.judgeId);

    const rows = await db
      .select({
        id: judgingAnnouncements.id,
        message: judgingAnnouncements.message,
        isUrgent: judgingAnnouncements.isUrgent,
        roomId: judgingAnnouncements.roomId,
        roomName: judgingRooms.name,
        createdAt: judgingAnnouncements.createdAt,
      })
      .from(judgingAnnouncements)
      .leftJoin(judgingRooms, eq(judgingRooms.id, judgingAnnouncements.roomId))
      .where(
        and(
          eq(judgingAnnouncements.hackathonId, input.hackathonId),
          isNull(judgingAnnouncements.clearedAt),
          roomId
            ? or(
                isNull(judgingAnnouncements.roomId),
                eq(judgingAnnouncements.roomId, roomId),
              )
            : isNull(judgingAnnouncements.roomId),
          ctx.judge.kind === "guest"
            ? eq(judgingAnnouncements.includeGuests, true)
            : undefined,
        ),
      )
      .orderBy(asc(judgingAnnouncements.createdAt));

    return rows.sort(
      (a, b) => Number(a.roomId !== null) - Number(b.roomId !== null),
    );
  }),
};
