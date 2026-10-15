import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import {
  judgingAppointments,
  judgingBuildings,
  judgingChallenges,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluationRatings,
  judgingEvaluationResponses,
  judgingEvaluationRevisions,
  judgingEvaluations,
  judgingJudges,
  judgingPlacements,
  judgingRooms,
  judgingRubricItems,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter } from "../../trpc";
import { isAdmin } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { assertHackathonExists } from "../../services/judging/config";
import { reconcileDueDrafts } from "../../services/judging/evaluation-store";
import type { JudgingDb } from "../../services/judging/config";
import { lockJudgingConfig } from "../../services/judging/claims";
import { checkInFlagsForEntries } from "../../services/check-in-flags";
import {
  notifyResultsPublished,
  resultsPublishedBefore,
} from "../../services/judging/notify";
import { evaluationScore, meanOrNull } from "../../services/judging/scoring";
import {
  OVERALL_SCOPE,
  computePlacements,
  formatScore,
} from "../../services/judging/placements";

const hackathonInput = z.object({
  hackathonId: z.string().uuid("Invalid hackathon ID"),
});

const toScore = (value: string | null) =>
  value === null ? null : Number(value);

/** Rating values grouped by evaluation. */
function groupRatings(
  rows: readonly { evaluationId: string; value: number }[],
) {
  const byEvaluation = new Map<string, number[]>();
  for (const row of rows) {
    const list = byEvaluation.get(row.evaluationId) ?? [];
    list.push(row.value);
    byEvaluation.set(row.evaluationId, list);
  }
  return byEvaluation;
}

/** Rating values per evaluation, for the evaluations given. */
async function ratingsOf(db: JudgingDb, evaluationIds: string[]) {
  if (evaluationIds.length === 0) return new Map<string, number[]>();
  return groupRatings(
    await db
      .select({
        evaluationId: judgingEvaluationRatings.evaluationId,
        value: judgingEvaluationRatings.value,
      })
      .from(judgingEvaluationRatings)
      .where(inArray(judgingEvaluationRatings.evaluationId, evaluationIds)),
  );
}

// Computing and publishing placements, and the organiser's view of what each
// judge submitted.
export const judgingResultsRouter = createTRPCRouter({
  // Replaces the draft placings with a fresh ranking from every complete
  // evaluation. Refused while results are published: recomputing then would
  // either change the public list under people's feet or silently pull it.
  compute: isAdmin.input(hackathonInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    await assertHackathonExists(db, input.hackathonId);
    const now = new Date();
    // Drafts past their deadline are evaluations too; rank with them in.
    await reconcileDueDrafts(db, input.hackathonId, now);

    const result = await db.transaction(async (tx) => {
      await lockJudgingConfig(tx, input.hackathonId);

      const [published] = await tx
        .select({ n: count() })
        .from(judgingPlacements)
        .where(
          and(
            eq(judgingPlacements.hackathonId, input.hackathonId),
            isNotNull(judgingPlacements.publishedAt),
          ),
        );
      if ((published?.n ?? 0) > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Results are published. Unpublish them first, then compute again and republish.",
        });
      }

      // Judges still score a team an organiser pulled from prizes, so its
      // evaluations stay as they are; it just cannot place. Leaving it out of
      // the entry set is enough, because computePlacements ignores
      // evaluations of any entry it was not given.
      const entries = await tx
        .select({ id: judgingEntries.id })
        .from(judgingEntries)
        .where(
          and(
            eq(judgingEntries.hackathonId, input.hackathonId),
            isNull(judgingEntries.deletedAt),
            isNull(judgingEntries.prizeIneligibleAt),
          ),
        );
      const memberships = await tx
        .select({
          entryId: judgingEntryChallenges.entryId,
          challengeId: judgingEntryChallenges.challengeId,
        })
        .from(judgingEntryChallenges)
        .where(eq(judgingEntryChallenges.hackathonId, input.hackathonId));
      const challenges = await tx
        .select({ id: judgingChallenges.id, label: judgingChallenges.label })
        .from(judgingChallenges)
        .where(eq(judgingChallenges.hackathonId, input.hackathonId))
        .orderBy(
          asc(judgingChallenges.displayOrder),
          asc(judgingChallenges.label),
        );
      const evaluations = await tx
        .select({
          id: judgingEvaluations.id,
          entryId: judgingEvaluations.entryId,
          challengeId: judgingEvaluations.challengeId,
          isComplete: judgingEvaluations.isComplete,
        })
        .from(judgingEvaluations)
        .where(
          and(
            eq(judgingEvaluations.hackathonId, input.hackathonId),
            eq(judgingEvaluations.isComplete, true),
          ),
        );
      // Joined rather than listed by id: an edition's evaluations run to
      // thousands, and the filter is the same one as above.
      const ratingRows = await tx
        .select({
          evaluationId: judgingEvaluationRatings.evaluationId,
          value: judgingEvaluationRatings.value,
        })
        .from(judgingEvaluationRatings)
        .innerJoin(
          judgingEvaluations,
          eq(judgingEvaluations.id, judgingEvaluationRatings.evaluationId),
        )
        .where(
          and(
            eq(judgingEvaluations.hackathonId, input.hackathonId),
            eq(judgingEvaluations.isComplete, true),
          ),
        );
      const ratings = groupRatings(ratingRows);

      const placements = computePlacements({
        entryIds: entries.map((entry) => entry.id),
        memberships,
        challenges,
        evaluations: evaluations.map((evaluation) => ({
          ...evaluation,
          ratings: ratings.get(evaluation.id) ?? [],
        })),
      });

      await tx
        .delete(judgingPlacements)
        .where(eq(judgingPlacements.hackathonId, input.hackathonId));
      if (placements.length > 0) {
        await tx.insert(judgingPlacements).values(
          placements.map((placement) => ({
            hackathonId: input.hackathonId,
            entryId: placement.entryId,
            scope: placement.scope,
            scopeLabel: placement.scopeLabel,
            placement: placement.placement,
            score: formatScore(placement.score),
            evaluationCount: placement.evaluationCount,
            computedAt: now,
          })),
        );
      }

      return {
        placements: placements.length,
        scopes: new Set(placements.map((placement) => placement.scope)).size,
        evaluations: evaluations.length,
      };
    });

    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.results.compute",
      resourceId: input.hackathonId,
      metadata: result,
    });

    return { ...result, computedAt: now };
  }),

  // Makes the drafts public through hackathon.getResults.
  publish: isAdmin.input(hackathonInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    await assertHackathonExists(db, input.hackathonId);
    const now = new Date();

    const published = await db.transaction(async (tx) => {
      await lockJudgingConfig(tx, input.hackathonId);
      const [existing] = await tx
        .select({ n: count() })
        .from(judgingPlacements)
        .where(eq(judgingPlacements.hackathonId, input.hackathonId));
      if ((existing?.n ?? 0) === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "There is nothing to publish yet. Compute results first, once judges have submitted.",
        });
      }
      const rows = await tx
        .update(judgingPlacements)
        .set({ publishedAt: now })
        .where(
          and(
            eq(judgingPlacements.hackathonId, input.hackathonId),
            isNull(judgingPlacements.publishedAt),
          ),
        )
        .returning({ id: judgingPlacements.id });
      return rows.length;
    });

    // Read before this publish is recorded: only the first one tells hackers.
    const announce =
      published > 0 && !(await resultsPublishedBefore(db, input.hackathonId));

    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.results.publish",
      resourceId: input.hackathonId,
      severity: "warn",
      metadata: { placements: published },
    });

    if (announce) void notifyResultsPublished(db, input.hackathonId);

    return { published, publishedAt: now };
  }),

  unpublish: isAdmin.input(hackathonInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    await assertHackathonExists(db, input.hackathonId);

    const rows = await db
      .update(judgingPlacements)
      .set({ publishedAt: null })
      .where(
        and(
          eq(judgingPlacements.hackathonId, input.hackathonId),
          isNotNull(judgingPlacements.publishedAt),
        ),
      )
      .returning({ id: judgingPlacements.id });

    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.results.unpublish",
      resourceId: input.hackathonId,
      severity: "warn",
      metadata: { placements: rows.length },
    });

    return { unpublished: rows.length };
  }),

  // The placings as computed, grouped by scope with Overall first, and how
  // many evaluations were saved after the last compute (a stale ranking).
  list: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;

    const rows = await db
      .select({
        id: judgingPlacements.id,
        scope: judgingPlacements.scope,
        scopeLabel: judgingPlacements.scopeLabel,
        placement: judgingPlacements.placement,
        score: judgingPlacements.score,
        evaluationCount: judgingPlacements.evaluationCount,
        publishedAt: judgingPlacements.publishedAt,
        computedAt: judgingPlacements.computedAt,
        entryId: judgingEntries.id,
        title: judgingEntries.title,
        deletedAt: judgingEntries.deletedAt,
        prizeIneligibleAt: judgingEntries.prizeIneligibleAt,
      })
      .from(judgingPlacements)
      .innerJoin(
        judgingEntries,
        eq(judgingEntries.id, judgingPlacements.entryId),
      )
      .where(eq(judgingPlacements.hackathonId, input.hackathonId))
      .orderBy(
        asc(judgingPlacements.scopeLabel),
        asc(judgingPlacements.placement),
        asc(judgingEntries.title),
      );

    const computedAt = rows.reduce<Date | null>(
      (latest, row) =>
        !latest || row.computedAt > latest ? row.computedAt : latest,
      null,
    );
    const publishedAt =
      rows.find((row) => row.publishedAt)?.publishedAt ?? null;

    let evaluationsSinceCompute = 0;
    if (computedAt) {
      const [since] = await db
        .select({ n: count() })
        .from(judgingEvaluations)
        .where(
          and(
            eq(judgingEvaluations.hackathonId, input.hackathonId),
            gt(judgingEvaluations.updatedAt, computedAt),
          ),
        );
      evaluationsSinceCompute = since?.n ?? 0;
    }

    // An organiser decides these teams' prizes, so each row says how many
    // flags are still open. The flag detail (who, which events) stays in the
    // Projects section; this payload carries the count and nothing else.
    const flags = await checkInFlagsForEntries(db, input.hackathonId, [
      ...new Set(rows.map((row) => row.entryId)),
    ]);
    const openFlags = new Map(
      [...flags].map(([entryId, views]) => [
        entryId,
        views.filter((view) => !view.dismissed).length,
      ]),
    );

    const scopes = new Map<
      string,
      {
        scope: string;
        scopeLabel: string;
        placements: {
          id: string;
          entryId: string;
          title: string;
          placement: number;
          score: number | null;
          evaluationCount: number;
          /** Pulled from judging since; getResults already hides it. */
          withdrawn: boolean;
          /** Check-in flags nobody has dismissed. Only the count leaves here. */
          openCheckInFlags: number;
          /** Pulled from prizes; getResults hides it and a recompute drops it. */
          prizeIneligible: boolean;
        }[];
      }
    >();
    for (const row of rows) {
      const scope = scopes.get(row.scope) ?? {
        scope: row.scope,
        scopeLabel: row.scopeLabel,
        placements: [],
      };
      scope.placements.push({
        id: row.id,
        entryId: row.entryId,
        title: row.title,
        placement: row.placement,
        score: toScore(row.score),
        evaluationCount: row.evaluationCount,
        withdrawn: !!row.deletedAt,
        openCheckInFlags: openFlags.get(row.entryId) ?? 0,
        prizeIneligible: !!row.prizeIneligibleAt,
      });
      scopes.set(row.scope, scope);
    }

    return {
      computedAt,
      publishedAt,
      evaluationsSinceCompute,
      scopes: [...scopes.values()].sort(
        (a, b) =>
          Number(b.scope === OVERALL_SCOPE) -
            Number(a.scope === OVERALL_SCOPE) ||
          a.scopeLabel.localeCompare(b.scopeLabel),
      ),
    };
  }),

  // One presentation's results: each judge who wrote or started an
  // evaluation, their ratings and responses once complete, and the mean.
  appointmentResults: isAdmin
    .input(hackathonInput.extend({ appointmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await reconcileDueDrafts(db, input.hackathonId);

      const [appointment] = await db
        .select({
          id: judgingAppointments.id,
          entryId: judgingAppointments.entryId,
          challengeId: judgingAppointments.challengeId,
          startsAt: judgingAppointments.startsAt,
          endsAt: judgingAppointments.endsAt,
          title: judgingEntries.title,
          challenge: judgingChallenges.label,
          room: judgingRooms.name,
          building: judgingBuildings.name,
        })
        .from(judgingAppointments)
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingAppointments.entryId),
        )
        .innerJoin(
          judgingChallenges,
          eq(judgingChallenges.id, judgingAppointments.challengeId),
        )
        .innerJoin(
          judgingRooms,
          eq(judgingRooms.id, judgingAppointments.roomId),
        )
        .leftJoin(
          judgingBuildings,
          eq(judgingBuildings.id, judgingRooms.buildingId),
        )
        .where(
          and(
            eq(judgingAppointments.id, input.appointmentId),
            eq(judgingAppointments.hackathonId, input.hackathonId),
          ),
        )
        .limit(1);
      if (!appointment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That appointment is not in the saved schedule any more.",
        });
      }

      const [evaluations, drafts, elsewhere] = await Promise.all([
        db
          .select({
            id: judgingEvaluations.id,
            judgeId: judgingJudges.id,
            judgeName: judgingJudges.displayName,
            kind: judgingJudges.kind,
            isComplete: judgingEvaluations.isComplete,
            autoSubmittedAt: judgingEvaluations.autoSubmittedAt,
            updatedAt: judgingEvaluations.updatedAt,
          })
          .from(judgingEvaluations)
          .innerJoin(
            judgingJudges,
            eq(judgingJudges.id, judgingEvaluations.judgeId),
          )
          .where(
            and(
              eq(judgingEvaluations.hackathonId, input.hackathonId),
              eq(judgingEvaluations.appointmentId, appointment.id),
            ),
          ),
        db
          .select({
            judgeId: judgingJudges.id,
            judgeName: judgingJudges.displayName,
            kind: judgingJudges.kind,
            updatedAt: judgingEvaluationDrafts.updatedAt,
          })
          .from(judgingEvaluationDrafts)
          .innerJoin(
            judgingJudges,
            eq(judgingJudges.id, judgingEvaluationDrafts.judgeId),
          )
          .where(
            and(
              eq(judgingEvaluationDrafts.hackathonId, input.hackathonId),
              eq(judgingEvaluationDrafts.appointmentId, appointment.id),
            ),
          ),
        // Complete evaluations of the same project and challenge outside this
        // slot: an untimed visit, or a slot it was moved from.
        db
          .select({ id: judgingEvaluations.id })
          .from(judgingEvaluations)
          .where(
            and(
              eq(judgingEvaluations.hackathonId, input.hackathonId),
              eq(judgingEvaluations.entryId, appointment.entryId),
              eq(judgingEvaluations.challengeId, appointment.challengeId),
              eq(judgingEvaluations.isComplete, true),
              or(
                isNull(judgingEvaluations.appointmentId),
                ne(judgingEvaluations.appointmentId, appointment.id),
              ),
            ),
          )
          .limit(1),
      ]);

      const completeIds = evaluations
        .filter((evaluation) => evaluation.isComplete)
        .map((evaluation) => evaluation.id);
      const [ratings, responses] = completeIds.length
        ? await Promise.all([
            db
              .select({
                evaluationId: judgingEvaluationRatings.evaluationId,
                itemId: judgingRubricItems.id,
                label: judgingRubricItems.label,
                value: judgingEvaluationRatings.value,
              })
              .from(judgingEvaluationRatings)
              .innerJoin(
                judgingRubricItems,
                eq(judgingRubricItems.id, judgingEvaluationRatings.itemId),
              )
              .where(
                inArray(judgingEvaluationRatings.evaluationId, completeIds),
              )
              .orderBy(asc(judgingRubricItems.displayOrder)),
            db
              .select({
                evaluationId: judgingEvaluationResponses.evaluationId,
                itemId: judgingRubricItems.id,
                label: judgingRubricItems.label,
                value: judgingEvaluationResponses.value,
                isPublic: judgingEvaluationResponses.isPublic,
              })
              .from(judgingEvaluationResponses)
              .innerJoin(
                judgingRubricItems,
                eq(judgingRubricItems.id, judgingEvaluationResponses.itemId),
              )
              .where(
                inArray(judgingEvaluationResponses.evaluationId, completeIds),
              )
              .orderBy(asc(judgingRubricItems.displayOrder)),
          ])
        : [[], []];

      const judged = new Set(
        evaluations.map((evaluation) => evaluation.judgeId),
      );
      const judges = [
        ...evaluations.map((evaluation) => {
          const own = evaluation.isComplete
            ? ratings.filter((rating) => rating.evaluationId === evaluation.id)
            : [];
          return {
            judgeId: evaluation.judgeId,
            judgeName: evaluation.judgeName,
            kind: evaluation.kind,
            evaluationId: evaluation.id as string | null,
            status: evaluation.isComplete
              ? ("complete" as const)
              : ("incomplete" as const),
            autoSubmitted: !!evaluation.autoSubmittedAt,
            updatedAt: evaluation.updatedAt,
            score: evaluationScore(own.map((rating) => rating.value)),
            ratings: own.map(({ itemId, label, value }) => ({
              itemId,
              label,
              value,
            })),
            responses: evaluation.isComplete
              ? responses
                  .filter((response) => response.evaluationId === evaluation.id)
                  .map(({ itemId, label, value, isPublic }) => ({
                    itemId,
                    label,
                    value,
                    isPublic,
                  }))
              : [],
          };
        }),
        // Still typing: a draft with nothing submitted.
        ...drafts
          .filter((draft) => !judged.has(draft.judgeId))
          .map((draft) => ({
            judgeId: draft.judgeId,
            judgeName: draft.judgeName,
            kind: draft.kind,
            evaluationId: null,
            status: "drafting" as const,
            autoSubmitted: false,
            updatedAt: draft.updatedAt,
            score: null,
            ratings: [],
            responses: [],
          })),
      ].sort((a, b) => a.judgeName.localeCompare(b.judgeName));

      const complete = judges.filter((judge) => judge.status === "complete");
      return {
        appointment,
        average: meanOrNull(
          complete
            .map((judge) => judge.score)
            .filter((score): score is number => score !== null),
        ),
        completeCount: complete.length,
        hasResultsElsewhere: elsewhere.length > 0,
        judges,
      };
    }),

  // Every evaluation in the edition, newest first: who scored which project
  // in which challenge, the score, and whether the deadline submitted it.
  evaluationAudit: isAdmin
    .input(hackathonInput.extend({ entryId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await reconcileDueDrafts(db, input.hackathonId);

      const rows = await db
        .select({
          id: judgingEvaluations.id,
          entryId: judgingEntries.id,
          title: judgingEntries.title,
          challengeId: judgingChallenges.id,
          challenge: judgingChallenges.label,
          judgeId: judgingJudges.id,
          judgeName: judgingJudges.displayName,
          kind: judgingJudges.kind,
          appointmentId: judgingEvaluations.appointmentId,
          isComplete: judgingEvaluations.isComplete,
          revision: judgingEvaluations.revision,
          submittedAt: judgingEvaluations.submittedAt,
          autoSubmittedAt: judgingEvaluations.autoSubmittedAt,
          updatedAt: judgingEvaluations.updatedAt,
        })
        .from(judgingEvaluations)
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingEvaluations.entryId),
        )
        .innerJoin(
          judgingChallenges,
          eq(judgingChallenges.id, judgingEvaluations.challengeId),
        )
        .innerJoin(
          judgingJudges,
          eq(judgingJudges.id, judgingEvaluations.judgeId),
        )
        .where(
          and(
            eq(judgingEvaluations.hackathonId, input.hackathonId),
            input.entryId
              ? eq(judgingEvaluations.entryId, input.entryId)
              : undefined,
          ),
        )
        .orderBy(desc(judgingEvaluations.updatedAt))
        .limit(500);

      const ratings = await ratingsOf(
        db,
        rows.map((row) => row.id),
      );

      return rows.map(({ autoSubmittedAt, ...row }) => ({
        ...row,
        autoSubmitted: !!autoSubmittedAt,
        autoSubmittedAt,
        score: evaluationScore(ratings.get(row.id) ?? []),
      }));
    }),

  // Every saved version of one evaluation, newest first, with the rubric so
  // the snapshots' item ids can be labelled.
  revisions: isAdmin
    .input(hackathonInput.extend({ evaluationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const [evaluation] = await db
        .select({
          id: judgingEvaluations.id,
          title: judgingEntries.title,
          challenge: judgingChallenges.label,
          judgeName: judgingJudges.displayName,
          kind: judgingJudges.kind,
          revision: judgingEvaluations.revision,
          isComplete: judgingEvaluations.isComplete,
          autoSubmittedAt: judgingEvaluations.autoSubmittedAt,
          updatedAt: judgingEvaluations.updatedAt,
        })
        .from(judgingEvaluations)
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingEvaluations.entryId),
        )
        .innerJoin(
          judgingChallenges,
          eq(judgingChallenges.id, judgingEvaluations.challengeId),
        )
        .innerJoin(
          judgingJudges,
          eq(judgingJudges.id, judgingEvaluations.judgeId),
        )
        .where(
          and(
            eq(judgingEvaluations.id, input.evaluationId),
            eq(judgingEvaluations.hackathonId, input.hackathonId),
          ),
        )
        .limit(1);
      if (!evaluation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That evaluation no longer exists.",
        });
      }

      const [revisions, rubric] = await Promise.all([
        db
          .select({
            id: judgingEvaluationRevisions.id,
            revision: judgingEvaluationRevisions.revision,
            snapshot: judgingEvaluationRevisions.snapshot,
            createdAt: judgingEvaluationRevisions.createdAt,
          })
          .from(judgingEvaluationRevisions)
          .where(eq(judgingEvaluationRevisions.evaluationId, evaluation.id))
          .orderBy(desc(judgingEvaluationRevisions.revision)),
        db
          .select({
            id: judgingRubricItems.id,
            kind: judgingRubricItems.kind,
            label: judgingRubricItems.label,
          })
          .from(judgingRubricItems)
          .where(eq(judgingRubricItems.hackathonId, input.hackathonId))
          .orderBy(asc(judgingRubricItems.displayOrder)),
      ]);

      return { evaluation, revisions, rubric };
    }),
});
