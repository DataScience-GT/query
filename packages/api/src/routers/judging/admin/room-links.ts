// QR links that let guests into a room.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import { judgingRoomLinks, judgingRooms } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import { lockEdition } from "../../../services/judging/challenges";
import {
  issueRoomLink,
  portalOrigin,
  revokeRoomAccess,
  roomLinkUrl,
} from "../../../services/judging/rooms";
import { uuid, hackathonInput, lockRoom } from "./shared";

export const roomLinkProcedures = {
  /**
   * Issues the room's QR link, retiring the old one and signing out the
   * guests who came in through it. The first link locks the project list.
   */
  generateRoomLink: isAdmin
    .input(z.object({ roomId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await db.transaction(async (tx) => {
        const room = await lockRoom(tx, input.roomId);
        if (room.archivedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unarchive the room before giving it a QR link.",
          });
        }
        const issued = await issueRoomLink(tx, room, ctx.userId);
        return { room, ...issued };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.generateRoomLink",
        resourceId: result.room.id,
        severity: result.revoked.sessions > 0 ? "warn" : "info",
        metadata: {
          hackathonId: result.room.hackathonId,
          replaced: result.revoked.links,
          guestsSignedOut: result.revoked.sessions,
        },
      });
      return {
        linkId: result.link.id,
        createdAt: result.link.createdAt,
        url: roomLinkUrl(result.link.id, portalOrigin(ctx.req)),
        replaced: result.revoked.links > 0,
        guestsSignedOut: result.revoked.sessions,
      };
    }),

  /**
   * Issues a QR link to each listed room or table that has none, so a hall's
   * tables need not be linked one at a time. One with a live link keeps it,
   * so no printed code stops working. The first link locks the project list.
   */
  generateRoomLinks: isAdmin
    .input(hackathonInput.extend({ roomIds: z.array(uuid).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const issued = await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        const rooms = await tx
          .select({ id: judgingRooms.id, hackathonId: judgingRooms.hackathonId })
          .from(judgingRooms)
          .where(
            and(
              eq(judgingRooms.hackathonId, input.hackathonId),
              inArray(judgingRooms.id, input.roomIds),
              isNull(judgingRooms.archivedAt),
              notExists(
                tx
                  .select({ one: sql`1` })
                  .from(judgingRoomLinks)
                  .where(
                    and(
                      eq(judgingRoomLinks.roomId, judgingRooms.id),
                      isNull(judgingRoomLinks.revokedAt),
                    ),
                  ),
              ),
            ),
          );
        for (const room of rooms) {
          await issueRoomLink(tx, room, ctx.userId);
        }
        return rooms.length;
      });

      if (issued > 0) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.generateRoomLinks",
          resourceId: input.hackathonId,
          metadata: { issued },
        });
      }
      return { issued };
    }),

  /** Retires the room's QR link and signs out its guest judges. */
  revokeRoomLink: isAdmin
    .input(z.object({ roomId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await db.transaction(async (tx) => {
        const room = await lockRoom(tx, input.roomId);
        const revoked = await revokeRoomAccess(
          tx,
          { hackathonId: room.hackathonId, roomId: room.id },
          ctx.userId,
        );
        return { room, revoked };
      });

      if (result.revoked.links + result.revoked.sessions > 0) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.revokeRoomLink",
          resourceId: result.room.id,
          severity: "warn",
          metadata: {
            hackathonId: result.room.hackathonId,
            links: result.revoked.links,
            guestsSignedOut: result.revoked.sessions,
          },
        });
      }
      return {
        revoked: result.revoked.links > 0,
        guestsSignedOut: result.revoked.sessions,
      };
    }),

  // ---------------------------------------------------------------------,
};
