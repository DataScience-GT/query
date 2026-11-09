// Inputs, error helpers and row locks shared by the judging admin procedures.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import {
  hackathonProjects,
  judgingAnnouncements,
  judgingBuildings,
  judgingChallenges,
  judgingEntries,
  judgingRooms,
} from "@query/db";
import type { JudgingDb } from "../../../services/judging/config";
import {
  lockEdition,
  readChallenges,
} from "../../../services/judging/challenges";
import {
  emptyRoom,
  revokeRoomAccess,
  roomAppointmentCount,
} from "../../../services/judging/rooms";
import { flaggedEntryIds } from "../../../services/check-in-flags";

export const uuid = z.string().uuid();
export const hackathonInput = z.object({ hackathonId: uuid });
export const resetInput = hackathonInput.extend({
  confirmation: z.string().trim().min(1).max(255),
});
export const label = z.string().trim().min(1).max(255);
export const roomName = z.string().trim().min(1).max(120);
export const roomKind = z.enum(["room", "table"]);
export const challengeMode = z.enum(["scheduled", "unscheduled", "remote"]);

// Line breaks are allowed in an announcement; other control characters are
// not, since they render as nothing or as boxes.
export const announcementText = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  // oxlint-disable-next-line no-control-regex
  .refine((value) => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value), {
    message: "The announcement contains characters that cannot be shown.",
  });

export const rubricItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rating"),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
  }),
  z.object({
    kind: z.literal("response"),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    required: z.boolean().default(true),
    guestVisibility: z.enum(["public", "optional", "private"]),
  }),
]);

// Presence older than this is a closed laptop, not a judge in the room.
export const SEATED_WINDOW_MS = 15 * 60 * 1000;

export const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export const notFound = (message: string) =>
  new TRPCError({ code: "NOT_FOUND", message });

export const refuse = (message: string) =>
  new TRPCError({ code: "PRECONDITION_FAILED", message });

/** Public results are cached; anything that changes what they show evicts them. */
export const evictResults = (
  cache: { delete: (key: string) => void },
  hackathonId: string,
) => cache.delete(`hackathon:${hackathonId}:results`);

/** Live projects of the edition that carry a check-in flag nobody dismissed. */
export async function entriesWithOpenFlags(db: JudgingDb, hackathonId: string) {
  const live = await db
    .select({ id: judgingEntries.id })
    .from(judgingEntries)
    .where(
      and(
        eq(judgingEntries.hackathonId, hackathonId),
        isNull(judgingEntries.deletedAt),
      ),
    );
  const flagged = await flaggedEntryIds(
    db,
    hackathonId,
    live.map((row) => row.id),
  );
  return [...flagged];
}

// Each of these finds the row's edition, takes the edition lock, then reads
// the row again so the checks see it as it stands under the lock.

export async function lockEntry(tx: JudgingDb, entryId: string) {
  const [scope] = await tx
    .select({ hackathonId: judgingEntries.hackathonId })
    .from(judgingEntries)
    .where(eq(judgingEntries.id, entryId))
    .limit(1);
  if (!scope) throw notFound("That project is gone. Refresh the list.");
  await lockEdition(tx, scope.hackathonId);
  const [entry] = await tx
    .select()
    .from(judgingEntries)
    .where(eq(judgingEntries.id, entryId))
    .limit(1);
  if (!entry) throw notFound("That project is gone. Refresh the list.");
  return entry;
}

/**
 * Puts a removed project back into judging. Refused for a portal submission its
 * team's withdrawal or an organiser's pull took out of the gallery.
 */
export async function restoreLockedEntry(
  tx: JudgingDb,
  entry: Awaited<ReturnType<typeof lockEntry>>,
) {
  if (entry.source === "portal" && entry.sourceProjectId) {
    const [project] = await tx
      .select({
        status: hackathonProjects.status,
        withdrawnByAdminAt: hackathonProjects.withdrawnByAdminAt,
      })
      .from(hackathonProjects)
      .where(eq(hackathonProjects.id, entry.sourceProjectId))
      .limit(1);
    if (project && (project.withdrawnByAdminAt || project.status === "draft")) {
      throw refuse(
        "This team's portal submission was withdrawn, so it cannot be judged. Ask the team to submit it again.",
      );
    }
  }

  await tx
    .update(judgingEntries)
    .set({ deletedAt: null, deletedById: null, updatedAt: new Date() })
    .where(eq(judgingEntries.id, entry.id));
}

export async function lockChallenge(tx: JudgingDb, challengeId: string) {
  const [scope] = await tx
    .select({ hackathonId: judgingChallenges.hackathonId })
    .from(judgingChallenges)
    .where(eq(judgingChallenges.id, challengeId))
    .limit(1);
  if (!scope) throw notFound("That challenge is gone. Refresh the list.");
  await lockEdition(tx, scope.hackathonId);
  const challenges = await readChallenges(tx, scope.hackathonId);
  const challenge = challenges.find((c) => c.id === challengeId);
  if (!challenge) throw notFound("That challenge is gone. Refresh the list.");
  return { hackathonId: scope.hackathonId, challenge, challenges };
}

export async function lockRoom(tx: JudgingDb, roomId: string) {
  const [scope] = await tx
    .select({ hackathonId: judgingRooms.hackathonId })
    .from(judgingRooms)
    .where(eq(judgingRooms.id, roomId))
    .limit(1);
  if (!scope) throw notFound("That room is gone. Refresh the Rooms tab.");
  await lockEdition(tx, scope.hackathonId);
  const [room] = await tx
    .select()
    .from(judgingRooms)
    .where(eq(judgingRooms.id, roomId))
    .limit(1);
  if (!room) throw notFound("That room is gone. Refresh the Rooms tab.");
  return room;
}

/**
 * Archives a room the caller has locked: its link is retired, everyone in it
 * stands up and its message is cleared. Refused while presentations are
 * scheduled in it.
 */
export async function archiveLockedRoom(
  tx: JudgingDb,
  room: Awaited<ReturnType<typeof lockRoom>>,
  userId: string,
) {
  const scheduled = await roomAppointmentCount(tx, room.id);
  if (scheduled > 0) {
    throw refuse(
      `${room.name} has ${scheduled} scheduled presentation${scheduled === 1 ? "" : "s"}. Move them or drop the schedule before archiving it.`,
    );
  }
  const signedOut = (
    await revokeRoomAccess(
      tx,
      { hackathonId: room.hackathonId, roomId: room.id },
      userId,
    )
  ).sessions;
  await emptyRoom(tx, room.id);
  // Nobody is left to read the room's message.
  await tx
    .update(judgingAnnouncements)
    .set({ clearedAt: new Date() })
    .where(
      and(
        eq(judgingAnnouncements.roomId, room.id),
        isNull(judgingAnnouncements.clearedAt),
      ),
    );
  const [updated] = await tx
    .update(judgingRooms)
    .set({ archivedAt: new Date() })
    .where(eq(judgingRooms.id, room.id))
    .returning();
  return { room: updated!, signedOut };
}

/** A challenge a room can serve: top-level and in this edition. */
export async function assertRoomChallenge(
  tx: JudgingDb,
  hackathonId: string,
  challengeId: string,
) {
  const [challenge] = await tx
    .select({ parentId: judgingChallenges.parentId })
    .from(judgingChallenges)
    .where(
      and(
        eq(judgingChallenges.id, challengeId),
        eq(judgingChallenges.hackathonId, hackathonId),
      ),
    )
    .limit(1);
  if (!challenge) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That challenge is not part of this hackathon.",
    });
  }
  if (challenge.parentId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Rooms judge a top-level challenge or group. Pick the group this challenge sits in.",
    });
  }
}

export async function assertBuilding(
  tx: JudgingDb,
  hackathonId: string,
  buildingId: string,
) {
  const [building] = await tx
    .select({ id: judgingBuildings.id })
    .from(judgingBuildings)
    .where(
      and(
        eq(judgingBuildings.id, buildingId),
        eq(judgingBuildings.hackathonId, hackathonId),
      ),
    )
    .limit(1);
  if (!building) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That building is not part of this hackathon.",
    });
  }
}

export const roomNameTaken = (name: string) =>
  new TRPCError({
    code: "CONFLICT",
    message: `An active room or table called ${name} is already in that building. Pick another name.`,
  });
