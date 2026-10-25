// Announcements and re-opening submitted grades.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import {
  judgingAnnouncements,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingPlacements,
  judgingRooms,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import { lockGrading } from "../../../services/judging/evaluation-store";
import { lockEdition } from "../../../services/judging/challenges";
import {
  uuid,
  hackathonInput,
  announcementText,
  notFound,
  refuse,
} from "./shared";

export const announcementProcedures = {
  /** The messages on judges' screens now: one for everyone, one per room. */
  listAnnouncements: isAdmin
    .input(hackathonInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      return db
        .select({
          id: judgingAnnouncements.id,
          roomId: judgingAnnouncements.roomId,
          roomName: judgingRooms.name,
          message: judgingAnnouncements.message,
          includeGuests: judgingAnnouncements.includeGuests,
          isUrgent: judgingAnnouncements.isUrgent,
          createdAt: judgingAnnouncements.createdAt,
        })
        .from(judgingAnnouncements)
        .leftJoin(judgingRooms, eq(judgingRooms.id, judgingAnnouncements.roomId))
        .where(
          and(
            eq(judgingAnnouncements.hackathonId, input.hackathonId),
            isNull(judgingAnnouncements.clearedAt),
          ),
        )
        .orderBy(
          sql`${judgingAnnouncements.roomId} is not null`,
          asc(judgingRooms.name),
        );
    }),

  /** Replaces the message for everyone (no room) or for one room. */
  setAnnouncement: isAdmin
    .input(
      hackathonInput.extend({
        roomId: uuid.nullable(),
        message: announcementText,
        includeGuests: z.boolean().default(true),
        isUrgent: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const announcement = await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        if (input.roomId) {
          const [room] = await tx
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
              code: "BAD_REQUEST",
              message: "That room is not an active room of this hackathon.",
            });
          }
        }

        const now = new Date();
        await tx
          .update(judgingAnnouncements)
          .set({ clearedAt: now })
          .where(
            and(
              eq(judgingAnnouncements.hackathonId, input.hackathonId),
              input.roomId
                ? eq(judgingAnnouncements.roomId, input.roomId)
                : isNull(judgingAnnouncements.roomId),
              isNull(judgingAnnouncements.clearedAt),
            ),
          );
        const [row] = await tx
          .insert(judgingAnnouncements)
          .values({
            hackathonId: input.hackathonId,
            roomId: input.roomId,
            message: input.message,
            includeGuests: input.includeGuests,
            isUrgent: input.isUrgent,
            createdById: ctx.userId,
          })
          .returning();
        return row!;
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.setAnnouncement",
        resourceId: announcement.id,
        metadata: {
          hackathonId: input.hackathonId,
          scope: input.roomId ? "room" : "everyone",
          isUrgent: input.isUrgent,
          includeGuests: input.includeGuests,
        },
      });
      return announcement;
    }),

  clearAnnouncement: isAdmin
    .input(z.object({ announcementId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const [cleared] = await db
        .update(judgingAnnouncements)
        .set({ clearedAt: new Date() })
        .where(
          and(
            eq(judgingAnnouncements.id, input.announcementId),
            isNull(judgingAnnouncements.clearedAt),
          ),
        )
        .returning({
          id: judgingAnnouncements.id,
          hackathonId: judgingAnnouncements.hackathonId,
        });
      if (cleared) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.clearAnnouncement",
          resourceId: cleared.id,
          metadata: { hackathonId: cleared.hackathonId },
        });
      }
      return { cleared: !!cleared };
    }),

  /**
   * Deletes one evaluation and any draft for the same project and challenge, so
   * the project is open for another judge to grade (grading-hold.ts). The
   * ratings, responses and revisions go with the evaluation by cascade. Allowed
   * while judging is closed, as setPrizeEligibility is: closing freezes judges'
   * writes, not the organiser's decisions on a project. No judge can grade the
   * project until judging is open again.
   *
   * The draft placings were ranked with the grade in them, in its challenge
   * and overall, and a judge's calibration moved with it, so every draft
   * placing is deleted in the same transaction. Publishing needs a compute
   * after the project is graded again; until then there is nothing to publish.
   *
   * Refused while results are published: the public list was ranked on it.
   */
  reopenGrade: isAdmin
    .input(hackathonInput.extend({ evaluationId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const reopened = await db.transaction(async (tx) => {
        // Takes the config lock, which holds off every judge write and a
        // publish while the grade is deleted.
        await lockEdition(tx, input.hackathonId);

        const [published] = await tx
          .select({ value: count() })
          .from(judgingPlacements)
          .where(
            and(
              eq(judgingPlacements.hackathonId, input.hackathonId),
              isNotNull(judgingPlacements.publishedAt),
            ),
          );
        if ((published?.value ?? 0) > 0) {
          throw refuse(
            "Results are published. Unpublish them first, then reopen the grade and compute results again.",
          );
        }

        const [evaluation] = await tx
          .select({
            entryId: judgingEvaluations.entryId,
            challengeId: judgingEvaluations.challengeId,
            judgeId: judgingEvaluations.judgeId,
            revision: judgingEvaluations.revision,
            isComplete: judgingEvaluations.isComplete,
          })
          .from(judgingEvaluations)
          .where(
            and(
              eq(judgingEvaluations.id, input.evaluationId),
              eq(judgingEvaluations.hackathonId, input.hackathonId),
            ),
          )
          .limit(1);
        if (!evaluation) {
          throw notFound("That evaluation is gone. Refresh the list.");
        }

        // The drafts first, then the project's grading lock: the order the
        // deadline submission takes them in, so the two cannot deadlock.
        const drafts = await tx
          .select({ id: judgingEvaluationDrafts.id })
          .from(judgingEvaluationDrafts)
          .where(
            and(
              eq(judgingEvaluationDrafts.entryId, evaluation.entryId),
              eq(judgingEvaluationDrafts.challengeId, evaluation.challengeId),
            ),
          )
          .for("update");
        await lockGrading(tx, evaluation.entryId, evaluation.challengeId);

        if (drafts.length > 0) {
          await tx.delete(judgingEvaluationDrafts).where(
            inArray(
              judgingEvaluationDrafts.id,
              drafts.map((draft) => draft.id),
            ),
          );
        }
        await tx
          .delete(judgingEvaluations)
          .where(eq(judgingEvaluations.id, input.evaluationId));
        const placings = await tx
          .delete(judgingPlacements)
          .where(
            and(
              eq(judgingPlacements.hackathonId, input.hackathonId),
              isNull(judgingPlacements.publishedAt),
            ),
          )
          .returning({ id: judgingPlacements.id });

        return {
          ...evaluation,
          drafts: drafts.length,
          placings: placings.length,
        };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.reopenGrade",
        resourceId: input.evaluationId,
        severity: "critical",
        metadata: {
          hackathonId: input.hackathonId,
          entryId: reopened.entryId,
          challengeId: reopened.challengeId,
          judgeId: reopened.judgeId,
          revision: reopened.revision,
          wasComplete: reopened.isComplete,
          draftsDeleted: reopened.drafts,
          placingsDeleted: reopened.placings,
        },
      });
      return {
        reopened: true,
        drafts: reopened.drafts,
        /** Draft placings cleared with it: compute again once it is regraded. */
        placings: reopened.placings,
      };
    }),

  // ---------------------------------------------------------------------,
};
