// Challenges (tracks and prizes) and their grouping.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, eq, isNull, max, sql } from "drizzle-orm";
import {
  judgingAppointments,
  judgingChallenges,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingRooms,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import { effectiveMode, sameLabel } from "../../../services/judging/scope";
import {
  assertStructureEditable,
  groupingProblem,
  lockEdition,
  readChallenges,
  readSetupLock,
  rebuildDerivedMemberships,
} from "../../../services/judging/challenges";
import {
  uuid,
  hackathonInput,
  label,
  challengeMode,
  refuse,
  lockChallenge,
} from "./shared";

export const challengeProcedures = {
  listChallenges: isAdmin
    .input(hackathonInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const id = input.hackathonId;
      const [challenges, entryCounts, roomCounts, lock] = await Promise.all([
        readChallenges(db, id),
        db
          .select({
            challengeId: judgingEntryChallenges.challengeId,
            optIns: sql<number>`count(*) filter (where ${judgingEntryChallenges.isOptIn})::int`,
            total: count(),
          })
          .from(judgingEntryChallenges)
          .innerJoin(
            judgingEntries,
            eq(judgingEntries.id, judgingEntryChallenges.entryId),
          )
          .where(
            and(
              eq(judgingEntryChallenges.hackathonId, id),
              isNull(judgingEntries.deletedAt),
            ),
          )
          .groupBy(judgingEntryChallenges.challengeId),
        db
          .select({
            challengeId: judgingRooms.challengeId,
            value: count(),
            tables: sql<number>`count(*) filter (where ${judgingRooms.kind} = 'table')::int`,
          })
          .from(judgingRooms)
          .where(
            and(
              eq(judgingRooms.hackathonId, id),
              isNull(judgingRooms.archivedAt),
            ),
          )
          .groupBy(judgingRooms.challengeId),
        readSetupLock(db, id),
      ]);

      return {
        structureLocked: lock.scheduleSaved || lock.hasEvaluations,
        challenges: challenges.map((challenge) => {
          const entries = entryCounts.find(
            (row) => row.challengeId === challenge.id,
          );
          const stations = roomCounts.find(
            (row) => row.challengeId === challenge.id,
          );
          return {
            ...challenge,
            effectiveMode: effectiveMode(challenges, challenge.id),
            optIns: entries?.optIns ?? 0,
            entries: entries?.total ?? 0,
            // Rooms and tables together; `tables` is how many are tables.
            rooms: stations?.value ?? 0,
            tables: stations?.tables ?? 0,
            children: challenges.filter((c) => c.parentId === challenge.id)
              .length,
          };
        }),
      };
    }),

  createChallenge: isAdmin
    .input(
      hackathonInput.extend({
        label,
        isGroup: z.boolean().default(false),
        parentId: uuid.nullable().default(null),
        mode: challengeMode.default("scheduled"),
        importLabelMatch: z.string().trim().max(100).nullable().default(null),
        isGeneral: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const created = await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        await assertStructureEditable(tx, input.hackathonId);
        const challenges = await readChallenges(tx, input.hackathonId);

        if (
          challenges.some(
            (c) => c.isGroup === input.isGroup && sameLabel(c.label, input.label),
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A ${input.isGroup ? "group" : "challenge"} called ${input.label} already exists.`,
          });
        }
        if (input.importLabelMatch && !input.isGroup) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only a group collects imported labels.",
          });
        }
        const problem = groupingProblem(
          challenges,
          { id: null, isGroup: input.isGroup, isGeneral: input.isGeneral },
          input.parentId,
        );
        if (problem) {
          throw new TRPCError({ code: "BAD_REQUEST", message: problem });
        }

        const [order] = await tx
          .select({ value: max(judgingChallenges.displayOrder) })
          .from(judgingChallenges)
          .where(eq(judgingChallenges.hackathonId, input.hackathonId));
        const [row] = await tx
          .insert(judgingChallenges)
          .values({
            hackathonId: input.hackathonId,
            label: input.label.replace(/\s+/g, " "),
            isGroup: input.isGroup,
            parentId: input.parentId,
            mode: input.mode,
            importLabelMatch: input.importLabelMatch || null,
            isGeneral: input.isGeneral,
            displayOrder: (order?.value ?? -1) + 1,
          })
          .returning();
        if (input.isGeneral) {
          await rebuildDerivedMemberships(tx, input.hackathonId);
        }
        return row!;
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.createChallenge",
        resourceId: created.id,
        metadata: {
          hackathonId: input.hackathonId,
          isGroup: created.isGroup,
          isGeneral: created.isGeneral,
        },
      });
      return created;
    }),

  /**
   * Renames a challenge or changes its place in the tree. Renaming is always
   * allowed; regrouping, mode and general are frozen once a schedule or
   * scores depend on them.
   */
  updateChallenge: isAdmin
    .input(
      z.object({
        challengeId: uuid,
        label: label.optional(),
        parentId: uuid.nullable().optional(),
        mode: challengeMode.optional(),
        importLabelMatch: z.string().trim().max(100).nullable().optional(),
        isGeneral: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const updated = await db.transaction(async (tx) => {
        const { hackathonId, challenge, challenges } = await lockChallenge(
          tx,
          input.challengeId,
        );
        const next = {
          label: input.label?.replace(/\s+/g, " ") ?? challenge.label,
          parentId:
            input.parentId === undefined ? challenge.parentId : input.parentId,
          mode: input.mode ?? challenge.mode,
          importLabelMatch:
            input.importLabelMatch === undefined
              ? challenge.importLabelMatch
              : input.importLabelMatch || null,
          isGeneral: input.isGeneral ?? challenge.isGeneral,
        };
        const structural =
          next.parentId !== challenge.parentId ||
          next.mode !== challenge.mode ||
          next.isGeneral !== challenge.isGeneral;
        if (structural) await assertStructureEditable(tx, hackathonId);

        if (
          challenges.some(
            (c) =>
              c.id !== challenge.id &&
              c.isGroup === challenge.isGroup &&
              sameLabel(c.label, next.label),
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A ${challenge.isGroup ? "group" : "challenge"} called ${next.label} already exists.`,
          });
        }
        if (next.importLabelMatch && !challenge.isGroup) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only a group collects imported labels.",
          });
        }
        const problem = groupingProblem(
          challenges,
          {
            id: challenge.id,
            isGroup: challenge.isGroup,
            isGeneral: next.isGeneral,
          },
          next.parentId,
        );
        if (problem) {
          throw new TRPCError({ code: "BAD_REQUEST", message: problem });
        }
        if (next.parentId && !challenge.parentId) {
          const [room] = await tx
            .select({ name: judgingRooms.name })
            .from(judgingRooms)
            .where(
              and(
                eq(judgingRooms.challengeId, challenge.id),
                isNull(judgingRooms.archivedAt),
              ),
            )
            .limit(1);
          if (room) {
            throw refuse(
              `${room.name} judges ${challenge.label} directly. Point the room at the group or archive it before moving the challenge in.`,
            );
          }
        }

        const [row] = await tx
          .update(judgingChallenges)
          .set(next)
          .where(eq(judgingChallenges.id, challenge.id))
          .returning();
        if (structural) await rebuildDerivedMemberships(tx, hackathonId);
        return { row: row!, structural };
      });

      if (updated.structural) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.updateChallenge",
          resourceId: updated.row.id,
          metadata: {
            hackathonId: updated.row.hackathonId,
            parentId: updated.row.parentId,
            mode: updated.row.mode,
            isGeneral: updated.row.isGeneral,
          },
        });
      }
      return updated.row;
    }),

  /** Deletes a challenge nothing uses: no projects, rooms or scores. */
  deleteChallenge: isAdmin
    .input(z.object({ challengeId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const deleted = await db.transaction(async (tx) => {
        const { hackathonId, challenge, challenges } = await lockChallenge(
          tx,
          input.challengeId,
        );
        const id = challenge.id;

        const [[optIn], [room], [appointment], [evaluation], [draft]] =
          await Promise.all([
            tx
              .select({ value: count() })
              .from(judgingEntryChallenges)
              .where(
                and(
                  eq(judgingEntryChallenges.challengeId, id),
                  eq(judgingEntryChallenges.isOptIn, true),
                ),
              ),
            tx
              .select({ value: count() })
              .from(judgingRooms)
              .where(eq(judgingRooms.challengeId, id)),
            tx
              .select({ value: count() })
              .from(judgingAppointments)
              .where(eq(judgingAppointments.challengeId, id)),
            tx
              .select({ value: count() })
              .from(judgingEvaluations)
              .where(eq(judgingEvaluations.challengeId, id)),
            tx
              .select({ value: count() })
              .from(judgingEvaluationDrafts)
              .where(eq(judgingEvaluationDrafts.challengeId, id)),
          ]);
        const children = challenges.filter((c) => c.parentId === id).length;
        const uses = [
          [optIn?.value ?? 0, "project opted in", "projects opted in"],
          [children, "challenge in the group", "challenges in the group"],
          [
            room?.value ?? 0,
            "room or table",
            "rooms and tables (archived ones too)",
          ],
          [appointment?.value ?? 0, "presentation", "presentations"],
          [
            (evaluation?.value ?? 0) + (draft?.value ?? 0),
            "evaluation",
            "evaluations",
          ],
        ] as const;
        const inUse = uses.filter(([n]) => n > 0);
        if (inUse.length > 0) {
          throw refuse(
            `${challenge.label} is still in use: ${inUse
              .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
              .join(", ")}.`,
          );
        }

        await tx.delete(judgingChallenges).where(eq(judgingChallenges.id, id));
        await rebuildDerivedMemberships(tx, hackathonId);
        return { id, hackathonId, label: challenge.label };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.deleteChallenge",
        resourceId: deleted.id,
        severity: "warn",
        metadata: { hackathonId: deleted.hackathonId, label: deleted.label },
      });
      return { deleted: true };
    }),

  // ---------------------------------------------------------------------,
};
