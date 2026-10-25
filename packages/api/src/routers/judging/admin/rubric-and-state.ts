// The rubric and the switches flipped on judging day.

import { z } from "zod";
import { and, asc, count, eq } from "drizzle-orm";
import { judgingConfigs, judgingRubricItems } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import {
  assertHackathonExists,
  ensureJudgingConfig,
} from "../../../services/judging/config";
import {
  lockEdition,
  readSetupLock,
} from "../../../services/judging/challenges";
import {
  rubricLockReason,
  stateChangeProblem,
} from "../../../services/judging/checklist";
import { notifyItineraryPosted } from "../../../services/judging/notify";
import { hackathonInput, rubricItem, refuse } from "./shared";

export const rubricAndStateProcedures = {
  getRubric: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    await assertHackathonExists(db, input.hackathonId);
    const config = await ensureJudgingConfig(db, input.hackathonId);
    const [items, lock] = await Promise.all([
      db
        .select({
          id: judgingRubricItems.id,
          kind: judgingRubricItems.kind,
          label: judgingRubricItems.label,
          description: judgingRubricItems.description,
          required: judgingRubricItems.required,
          memberVisibility: judgingRubricItems.memberVisibility,
          guestVisibility: judgingRubricItems.guestVisibility,
        })
        .from(judgingRubricItems)
        .where(eq(judgingRubricItems.hackathonId, input.hackathonId))
        .orderBy(asc(judgingRubricItems.displayOrder)),
      readSetupLock(db, input.hackathonId),
    ]);
    return {
      items,
      lockedBecause: rubricLockReason({ state: config.state, ...lock }),
    };
  }),

  /**
   * Replaces the rubric. Ratings are 1–5 and always required; a response's
   * visibility is chosen for guests only, since member judges' feedback is
   * always shown to the team.
   */
  saveRubric: isAdmin
    .input(hackathonInput.extend({ items: z.array(rubricItem).max(30) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const saved = await db.transaction(async (tx) => {
        const { config } = await lockEdition(tx, input.hackathonId);
        const lock = await readSetupLock(tx, input.hackathonId);
        const reason = rubricLockReason({ state: config.state, ...lock });
        if (reason) throw refuse(reason);

        await tx
          .delete(judgingRubricItems)
          .where(eq(judgingRubricItems.hackathonId, input.hackathonId));
        if (input.items.length === 0) return [];
        return tx
          .insert(judgingRubricItems)
          .values(
            input.items.map((item, displayOrder) => ({
              hackathonId: input.hackathonId,
              kind: item.kind,
              label: item.label,
              description: item.description || null,
              displayOrder,
              ...(item.kind === "rating"
                ? { required: true, memberVisibility: null, guestVisibility: null }
                : {
                    required: item.required,
                    memberVisibility: "public" as const,
                    guestVisibility: item.guestVisibility,
                  }),
            })),
          )
          .returning();
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.saveRubric",
        resourceId: input.hackathonId,
        metadata: {
          ratings: saved.filter((item) => item.kind === "rating").length,
          responses: saved.filter((item) => item.kind === "response").length,
        },
      });
      return { items: saved };
    }),

  /** draft → open, open ↔ closed, and back to draft before any scoring. */
  setState: isAdmin
    .input(hackathonInput.extend({ state: z.enum(["draft", "open", "closed"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await db.transaction(async (tx) => {
        const { config } = await lockEdition(tx, input.hackathonId);
        if (config.state === input.state) {
          return { config, from: config.state, changed: false };
        }

        const [[ratings], lock] = await Promise.all([
          tx
            .select({ value: count() })
            .from(judgingRubricItems)
            .where(
              and(
                eq(judgingRubricItems.hackathonId, input.hackathonId),
                eq(judgingRubricItems.kind, "rating"),
              ),
            ),
          readSetupLock(tx, input.hackathonId),
        ]);
        const problem = stateChangeProblem(config.state, input.state, {
          ratingItems: ratings?.value ?? 0,
          hasEvaluations: lock.hasEvaluations,
        });
        if (problem) throw refuse(problem);

        const now = new Date();
        const [updated] = await tx
          .update(judgingConfigs)
          .set({
            state: input.state,
            openedAt:
              input.state === "draft"
                ? null
                : input.state === "open"
                  ? (config.openedAt ?? now)
                  : config.openedAt,
            closedAt: input.state === "closed" ? now : null,
            updatedAt: now,
          })
          .where(eq(judgingConfigs.hackathonId, input.hackathonId))
          .returning();
        return { config: updated!, from: config.state, changed: true };
      });

      if (result.changed) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.setState",
          resourceId: input.hackathonId,
          severity: "warn",
          metadata: { from: result.from, to: input.state },
        });
      }
      return {
        state: result.config.state,
        openedAt: result.config.openedAt,
        closedAt: result.config.closedAt,
      };
    }),

  /** Lets member judges see every project's scores, not only ones they judged. */
  setShowAllScores: isAdmin
    .input(hackathonInput.extend({ showAllScores: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      await ensureJudgingConfig(db, input.hackathonId);
      await db
        .update(judgingConfigs)
        .set({ showAllScores: input.showAllScores, updatedAt: new Date() })
        .where(eq(judgingConfigs.hackathonId, input.hackathonId));
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.setShowAllScores",
        resourceId: input.hackathonId,
        metadata: { showAllScores: input.showAllScores },
      });
      return { showAllScores: input.showAllScores };
    }),

  /**
   * The hacker-facing switches: whether the itinerary shows times and rooms,
   * and emergency mode for when the schedule falls over.
   */
  setLaunch: isAdmin
    .input(
      hackathonInput
        .extend({
          itineraryPublished: z.boolean().optional(),
          emergencyMode: z.boolean().optional(),
        })
        .refine(
          (value) =>
            value.itineraryPublished !== undefined ||
            value.emergencyMode !== undefined,
          { message: "Say which switch to change." },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      await ensureJudgingConfig(db, input.hackathonId);
      // Off to on is decided by the row, not a read before it: of two clicks
      // racing to publish, only one still finds it off, so teams hear once.
      const switchedOn =
        input.itineraryPublished === true
          ? await db
              .update(judgingConfigs)
              .set({ itineraryPublished: true })
              .where(
                and(
                  eq(judgingConfigs.hackathonId, input.hackathonId),
                  eq(judgingConfigs.itineraryPublished, false),
                ),
              )
              .returning({ hackathonId: judgingConfigs.hackathonId })
          : [];
      const [config] = await db
        .update(judgingConfigs)
        .set({
          itineraryPublished: input.itineraryPublished,
          emergencyMode: input.emergencyMode,
          updatedAt: new Date(),
        })
        .where(eq(judgingConfigs.hackathonId, input.hackathonId))
        .returning();

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.setLaunch",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: {
          itineraryPublished: input.itineraryPublished,
          emergencyMode: input.emergencyMode,
        },
      });

      // Teams learn their times the moment they appear, once per switch on.
      // Not awaited: a few hundred messages must not hold the organiser's
      // click, and it never rejects.
      if (switchedOn.length > 0) {
        void notifyItineraryPosted(db, input.hackathonId);
      }

      return {
        itineraryPublished: config!.itineraryPublished,
        emergencyMode: config!.emergencyMode,
      };
    }),

  // ---------------------------------------------------------------------,
};
