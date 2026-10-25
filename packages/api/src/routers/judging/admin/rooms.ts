// Buildings, rooms and tables.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  max,
} from "drizzle-orm";
import {
  judgingAnnouncements,
  judgingAppointments,
  judgingBuildings,
  judgingGuestSessions,
  judgingPresence,
  judgingRoomLinks,
  judgingRooms,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import { isUniqueViolation } from "../../../middleware/db-errors";
import { assertHackathonExists } from "../../../services/judging/config";
import {
  lockEdition,
  readChallenges,
} from "../../../services/judging/challenges";
import {
  MAX_TABLE_NUMBER,
  newTableNumbers,
  nextTableNumber,
  portalOrigin,
  revokeRoomAccess,
  roomAppointmentCount,
  roomLinkUrl,
  slotTables,
  tableName,
  tableNumber,
} from "../../../services/judging/rooms";
import {
  uuid,
  hackathonInput,
  roomName,
  roomKind,
  SEATED_WINDOW_MS,
  notFound,
  refuse,
  lockRoom,
  archiveLockedRoom,
  assertRoomChallenge,
  assertBuilding,
  roomNameTaken,
} from "./shared";

export const roomProcedures = {
  /** Buildings and every room, archived ones included, with live state. */
  listRooms: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const id = input.hackathonId;
    const seatedSince = new Date(Date.now() - SEATED_WINDOW_MS);
    const now = new Date();

    const [buildings, rooms, challenges, links, seated, guests, appointments, notices] =
      await Promise.all([
        db
          .select({ id: judgingBuildings.id, name: judgingBuildings.name })
          .from(judgingBuildings)
          .where(eq(judgingBuildings.hackathonId, id))
          .orderBy(asc(judgingBuildings.name)),
        db
          .select({
            id: judgingRooms.id,
            name: judgingRooms.name,
            kind: judgingRooms.kind,
            buildingId: judgingRooms.buildingId,
            challengeId: judgingRooms.challengeId,
            displayOrder: judgingRooms.displayOrder,
            archivedAt: judgingRooms.archivedAt,
          })
          .from(judgingRooms)
          .where(eq(judgingRooms.hackathonId, id))
          .orderBy(asc(judgingRooms.displayOrder), asc(judgingRooms.name)),
        readChallenges(db, id),
        db
          .select({
            id: judgingRoomLinks.id,
            roomId: judgingRoomLinks.roomId,
            createdAt: judgingRoomLinks.createdAt,
          })
          .from(judgingRoomLinks)
          .where(
            and(
              eq(judgingRoomLinks.hackathonId, id),
              isNull(judgingRoomLinks.revokedAt),
            ),
          ),
        db
          .select({ roomId: judgingPresence.roomId, value: count() })
          .from(judgingPresence)
          .where(
            and(
              eq(judgingPresence.hackathonId, id),
              isNull(judgingPresence.leftAt),
              gte(judgingPresence.lastSeenAt, seatedSince),
            ),
          )
          .groupBy(judgingPresence.roomId),
        db
          .select({ roomId: judgingGuestSessions.roomId, value: count() })
          .from(judgingGuestSessions)
          .where(
            and(
              eq(judgingGuestSessions.hackathonId, id),
              isNull(judgingGuestSessions.revokedAt),
              gte(judgingGuestSessions.expiresAt, now),
            ),
          )
          .groupBy(judgingGuestSessions.roomId),
        db
          .select({ roomId: judgingAppointments.roomId, value: count() })
          .from(judgingAppointments)
          .where(eq(judgingAppointments.hackathonId, id))
          .groupBy(judgingAppointments.roomId),
        db
          .select({
            id: judgingAnnouncements.id,
            roomId: judgingAnnouncements.roomId,
            message: judgingAnnouncements.message,
            isUrgent: judgingAnnouncements.isUrgent,
            includeGuests: judgingAnnouncements.includeGuests,
            createdAt: judgingAnnouncements.createdAt,
          })
          .from(judgingAnnouncements)
          .where(
            and(
              eq(judgingAnnouncements.hackathonId, id),
              isNull(judgingAnnouncements.clearedAt),
              isNotNull(judgingAnnouncements.roomId),
            ),
          ),
      ]);

    const origin = portalOrigin(ctx.req);
    const byRoom = (list: { roomId: string; value: number }[], roomId: string) =>
      list.find((row) => row.roomId === roomId)?.value ?? 0;

    return {
      buildings: buildings.map((building) => {
        const inside = rooms.filter((room) => room.buildingId === building.id);
        return {
          ...building,
          rooms: inside.filter((room) => !room.archivedAt).length,
          // Where "Add tables" starts when no first number is given.
          nextTable: nextTableNumber(
            inside.map((room) => ({
              name: room.name,
              archived: !!room.archivedAt,
            })),
          ),
        };
      }),
      rooms: rooms.map((room) => {
        const link = links.find((l) => l.roomId === room.id);
        const challenge = challenges.find((c) => c.id === room.challengeId);
        return {
          ...room,
          buildingName:
            buildings.find((b) => b.id === room.buildingId)?.name ?? null,
          challengeLabel: challenge?.label ?? "",
          challengeMode: challenge?.mode ?? "scheduled",
          link: link
            ? {
                id: link.id,
                createdAt: link.createdAt,
                url: roomLinkUrl(link.id, origin),
              }
            : null,
          judgesSeated: byRoom(seated, room.id),
          guestSessions: byRoom(guests, room.id),
          appointments: byRoom(appointments, room.id),
          announcement:
            notices.find((notice) => notice.roomId === room.id) ?? null,
        };
      }),
    };
  }),

  createBuilding: isAdmin
    .input(hackathonInput.extend({ name: roomName }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      try {
        const [building] = await db
          .insert(judgingBuildings)
          .values({ hackathonId: input.hackathonId, name: input.name })
          .returning();
        return building!;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `There is already a building called ${input.name}.`,
          });
        }
        throw error;
      }
    }),

  renameBuilding: isAdmin
    .input(z.object({ buildingId: uuid, name: roomName }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      try {
        const [building] = await db
          .update(judgingBuildings)
          .set({ name: input.name })
          .where(eq(judgingBuildings.id, input.buildingId))
          .returning();
        if (!building) throw notFound("That building is gone. Refresh the Rooms tab.");
        return building;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `There is already a building called ${input.name}.`,
          });
        }
        throw error;
      }
    }),

  /** Deletes a building no active room is in. */
  deleteBuilding: isAdmin
    .input(z.object({ buildingId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await db.transaction(async (tx) => {
        const [building] = await tx
          .select()
          .from(judgingBuildings)
          .where(eq(judgingBuildings.id, input.buildingId))
          .limit(1);
        if (!building) throw notFound("That building is gone. Refresh the Rooms tab.");
        await lockEdition(tx, building.hackathonId);

        const [rooms] = await tx
          .select({ value: count() })
          .from(judgingRooms)
          .where(
            and(
              eq(judgingRooms.buildingId, building.id),
              isNull(judgingRooms.archivedAt),
            ),
          );
        if ((rooms?.value ?? 0) > 0) {
          throw refuse(
            `${building.name} still has ${rooms!.value} active room${rooms!.value === 1 ? "" : "s"}. Move or archive them first.`,
          );
        }
        await tx
          .delete(judgingBuildings)
          .where(eq(judgingBuildings.id, building.id));
      });
      return { deleted: true };
    }),

  createRoom: isAdmin
    .input(
      hackathonInput.extend({
        name: roomName,
        kind: roomKind.default("room"),
        challengeId: uuid,
        buildingId: uuid.nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      try {
        return await db.transaction(async (tx) => {
          await lockEdition(tx, input.hackathonId);
          await assertRoomChallenge(tx, input.hackathonId, input.challengeId);
          if (input.buildingId) {
            await assertBuilding(tx, input.hackathonId, input.buildingId);
          }
          const [order] = await tx
            .select({ value: max(judgingRooms.displayOrder) })
            .from(judgingRooms)
            .where(eq(judgingRooms.hackathonId, input.hackathonId));
          const [room] = await tx
            .insert(judgingRooms)
            .values({
              hackathonId: input.hackathonId,
              name: input.name,
              kind: input.kind,
              challengeId: input.challengeId,
              buildingId: input.buildingId,
              displayOrder: (order?.value ?? -1) + 1,
            })
            .returning();
          return room!;
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw roomNameTaken(input.name);
        throw error;
      }
    }),

  /**
   * Adds a hall's numbered tables in one go, "Table 1" to "Table 30" say,
   * listed in number order among the hall's tables. Numbers an active station
   * in the hall already goes by are skipped, so re-running a range fills gaps.
   */
  createTables: isAdmin
    .input(
      hackathonInput.extend({
        challengeId: uuid,
        buildingId: uuid,
        count: z.number().int().min(1).max(200),
        // Left out: one past the hall's highest table number.
        firstNumber: z.number().int().min(1).max(MAX_TABLE_NUMBER).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      try {
        return await db.transaction(async (tx) => {
          await lockEdition(tx, input.hackathonId);
          await assertRoomChallenge(tx, input.hackathonId, input.challengeId);
          await assertBuilding(tx, input.hackathonId, input.buildingId);
          const listed = await tx
            .select({
              id: judgingRooms.id,
              name: judgingRooms.name,
              buildingId: judgingRooms.buildingId,
              displayOrder: judgingRooms.displayOrder,
              archivedAt: judgingRooms.archivedAt,
            })
            .from(judgingRooms)
            .where(eq(judgingRooms.hackathonId, input.hackathonId))
            .orderBy(asc(judgingRooms.displayOrder), asc(judgingRooms.name));
          const inHall = (room: { buildingId: string | null }) =>
            room.buildingId === input.buildingId;
          const stations = listed.filter(inHall).map((room) => ({
            name: room.name,
            archived: !!room.archivedAt,
          }));
          const first = input.firstNumber ?? nextTableNumber(stations);
          const last = first + input.count - 1;
          if (last > MAX_TABLE_NUMBER) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Table numbers stop at ${MAX_TABLE_NUMBER}. Start lower or add fewer tables.`,
            });
          }
          const numbers = newTableNumbers(stations, input.count, first);
          if (numbers.length === 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                input.count === 1
                  ? `${tableName(first)} is in that building already.`
                  : `${tableName(first)} to ${tableName(last)} are all in that building already.`,
            });
          }
          const order = slotTables(
            listed.map((room) => ({
              id: room.id as string | null,
              displayOrder: room.displayOrder,
              number: inHall(room) ? tableNumber(room.name) : null,
            })),
            numbers.map((number) => ({ id: null, displayOrder: -1, number })),
          );
          // Stations after a table slotted in ahead of them move down.
          for (const [index, station] of order.entries()) {
            if (station.id && station.displayOrder !== index) {
              await tx
                .update(judgingRooms)
                .set({ displayOrder: index })
                .where(eq(judgingRooms.id, station.id));
            }
          }
          await tx.insert(judgingRooms).values(
            order.flatMap((station, index) =>
              station.id || station.number === null
                ? []
                : [
                    {
                      hackathonId: input.hackathonId,
                      name: tableName(station.number),
                      kind: "table" as const,
                      challengeId: input.challengeId,
                      buildingId: input.buildingId,
                      displayOrder: index,
                    },
                  ],
            ),
          );
          return { created: numbers.length, numbers };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "One of these table numbers was taken in that building just now. Refresh the Rooms tab and try again.",
          });
        }
        throw error;
      }
    }),

  /**
   * Edits an active room. Moving it to another challenge or building is
   * refused while presentations are scheduled in it. A new challenge also
   * changes what its guests may judge, so a live link is retired, which
   * takes the room's name typed out.
   */
  updateRoom: isAdmin
    .input(
      z.object({
        roomId: uuid,
        name: roomName.optional(),
        kind: roomKind.optional(),
        challengeId: uuid.optional(),
        buildingId: uuid.nullable().optional(),
        confirmation: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const name = input.name;
      try {
        const result = await db.transaction(async (tx) => {
          const room = await lockRoom(tx, input.roomId);
          if (room.archivedAt) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unarchive the room before editing it.",
            });
          }

          const challengeChanges =
            input.challengeId !== undefined &&
            input.challengeId !== room.challengeId;
          const buildingChanges =
            input.buildingId !== undefined &&
            input.buildingId !== room.buildingId;

          if (challengeChanges || buildingChanges) {
            const scheduled = await roomAppointmentCount(tx, room.id);
            if (scheduled > 0) {
              throw refuse(
                `${room.name} has ${scheduled} scheduled presentation${scheduled === 1 ? "" : "s"}. Drop the schedule before moving the room to another ${challengeChanges ? "challenge" : "building"}.`,
              );
            }
          }
          if (challengeChanges) {
            await assertRoomChallenge(tx, room.hackathonId, input.challengeId!);
          }
          if (buildingChanges && input.buildingId) {
            await assertBuilding(tx, room.hackathonId, input.buildingId);
          }

          let signedOut = 0;
          if (challengeChanges) {
            const [link] = await tx
              .select({ id: judgingRoomLinks.id })
              .from(judgingRoomLinks)
              .where(
                and(
                  eq(judgingRoomLinks.roomId, room.id),
                  isNull(judgingRoomLinks.revokedAt),
                ),
              )
              .limit(1);
            if (link) {
              if (input.confirmation !== room.name) {
                throw refuse(
                  `${room.name} has a live QR link. Changing its challenge retires the link and signs its guest judges out; type ${room.name} to confirm.`,
                );
              }
              signedOut = (
                await revokeRoomAccess(
                  tx,
                  { hackathonId: room.hackathonId, roomId: room.id },
                  ctx.userId,
                )
              ).sessions;
            }
          }

          if (
            input.name === undefined &&
            input.kind === undefined &&
            input.challengeId === undefined &&
            input.buildingId === undefined
          ) {
            return { room, signedOut, challengeChanges };
          }
          const [updated] = await tx
            .update(judgingRooms)
            .set({
              name: input.name,
              kind: input.kind,
              challengeId: input.challengeId,
              buildingId: input.buildingId,
            })
            .where(eq(judgingRooms.id, room.id))
            .returning();
          return { room: updated!, signedOut, challengeChanges };
        });

        if (result.challengeChanges) {
          await recordAdminAction(db, {
            userId: ctx.userId,
            action: "judging.updateRoom",
            resourceId: result.room.id,
            severity: result.signedOut > 0 ? "warn" : "info",
            metadata: {
              hackathonId: result.room.hackathonId,
              challengeId: result.room.challengeId,
              guestsSignedOut: result.signedOut,
            },
          });
        }
        return result;
      } catch (error) {
        if (isUniqueViolation(error)) throw roomNameTaken(name ?? "that name");
        throw error;
      }
    }),

  /**
   * Sets the order rooms are listed in, first to last. Only stations whose
   * place changed are written, so swapping two rooms in an edition of
   * hundreds of tables is two updates.
   */
  reorderRooms: isAdmin
    .input(hackathonInput.extend({ roomIds: z.array(uuid).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        const current = await tx
          .select({
            id: judgingRooms.id,
            displayOrder: judgingRooms.displayOrder,
          })
          .from(judgingRooms)
          .where(eq(judgingRooms.hackathonId, input.hackathonId));
        const orderOf = new Map(
          current.map((room) => [room.id, room.displayOrder]),
        );
        for (const [index, roomId] of input.roomIds.entries()) {
          if (orderOf.get(roomId) === index) continue;
          await tx
            .update(judgingRooms)
            .set({ displayOrder: index })
            .where(
              and(
                eq(judgingRooms.id, roomId),
                eq(judgingRooms.hackathonId, input.hackathonId),
              ),
            );
        }
      });
      return { reordered: input.roomIds.length };
    }),

  /**
   * Archives a room (its link is retired and everyone in it stands up) or
   * brings it back. Refused while presentations are scheduled in it.
   */
  setRoomArchived: isAdmin
    .input(z.object({ roomId: uuid, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      let roomName = "that room";
      try {
        const result = await db.transaction(async (tx) => {
          const room = await lockRoom(tx, input.roomId);
          roomName = room.name;
          if (!!room.archivedAt === input.archived) {
            return { room, changed: false, signedOut: 0 };
          }

          if (input.archived) {
            return {
              ...(await archiveLockedRoom(tx, room, ctx.userId)),
              changed: true,
            };
          }

          const [updated] = await tx
            .update(judgingRooms)
            .set({ archivedAt: null })
            .where(eq(judgingRooms.id, room.id))
            .returning();
          return { room: updated!, changed: true, signedOut: 0 };
        });

        if (result.changed) {
          await recordAdminAction(db, {
            userId: ctx.userId,
            action: input.archived
              ? "judging.archiveRoom"
              : "judging.unarchiveRoom",
            resourceId: result.room.id,
            severity: input.archived ? "warn" : "info",
            metadata: {
              hackathonId: result.room.hackathonId,
              guestsSignedOut: result.signedOut,
            },
          });
        }
        return { room: result.room, signedOut: result.signedOut };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Another active room in that building is called ${roomName}. Rename one of them first.`,
          });
        }
        throw error;
      }
    }),

  /**
   * Archives many rooms at once, as setRoomArchived does each. All or
   * nothing: one room with presentations scheduled, or from another
   * edition, refuses the lot.
   */
  archiveRooms: isAdmin
    .input(
      hackathonInput.extend({ roomIds: z.array(uuid).min(1).max(500) }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const roomIds = [...new Set(input.roomIds)].sort();
      const archived = await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        const rooms = await tx
          .select()
          .from(judgingRooms)
          .where(
            and(
              eq(judgingRooms.hackathonId, input.hackathonId),
              inArray(judgingRooms.id, roomIds),
            ),
          )
          .orderBy(asc(judgingRooms.id));
        if (rooms.length !== roomIds.length) {
          throw notFound(
            "Some of those rooms are gone or belong to another hackathon. Refresh the Rooms tab.",
          );
        }
        const done: { room: typeof rooms[number]; signedOut: number }[] = [];
        for (const room of rooms) {
          if (room.archivedAt) continue;
          done.push(await archiveLockedRoom(tx, room, ctx.userId));
        }
        return done;
      });

      for (const { room, signedOut } of archived) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.archiveRoom",
          resourceId: room.id,
          severity: "warn",
          metadata: { hackathonId: room.hackathonId, guestsSignedOut: signedOut },
        });
      }
      return { archived: archived.length };
    }),

  /** Deletes a room that hosts no scheduled presentation. */
  deleteRoom: isAdmin
    .input(z.object({ roomId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const room = await db.transaction(async (tx) => {
        const room = await lockRoom(tx, input.roomId);
        const scheduled = await roomAppointmentCount(tx, room.id);
        if (scheduled > 0) {
          throw refuse(
            `${room.name} has ${scheduled} scheduled presentation${scheduled === 1 ? "" : "s"}. Drop the schedule before deleting it, or archive it after the presentations move.`,
          );
        }
        await tx.delete(judgingRooms).where(eq(judgingRooms.id, room.id));
        return room;
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.deleteRoom",
        resourceId: room.id,
        severity: "warn",
        metadata: { hackathonId: room.hackathonId, name: room.name },
      });
      return { deleted: true };
    }),
};
