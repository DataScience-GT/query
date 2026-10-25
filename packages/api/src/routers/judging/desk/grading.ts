// Walking the queue and the evaluation lifecycle: open, release, autosave, submit.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import {
  judgingChallenges,
  judgingEntries,
  judgingEvaluationDrafts,
  judgingEvaluations,
} from "@query/db";
import { isUniqueViolation } from "../../../middleware/db-errors";
import {
  assertGuestSeated,
  assertJudgingOpen,
  claimGrading,
  evaluatedChallenge,
  evaluationAccess,
  loadChallenges,
  loadEntryInChallenge,
  loadRubric,
  reconcileDueDrafts,
  seatOf,
  writeEvaluation,
} from "../../../services/judging/evaluation-store";
import { DEADLINE_GRACE_MS } from "../../../services/judging/timing";
import {
  QUEUE_WINDOW,
  nextToGrade,
  queueWindow,
} from "../../../services/judging/queue";
import {
  assertQueueOffers,
  loadQueue,
} from "../../../services/judging/queue-store";
import { checkAnswers } from "../../../services/judging/evaluation";
import {
  evaluationScore,
  hasEveryRating,
} from "../../../services/judging/scoring";
import { rootOf } from "../../../services/judging/scope";
import {
  judgeProcedure,
  uuid,
  ratingsInput,
  responsesInput,
  taskOf,
  answersOf,
  modeOf,
  memberSeat,
} from "./shared";

export const gradingProcedures = {
  // The next project for this judge to grade, in the challenge they pick or
  // the one they sit at. Each judge walks the projects in an order of their own
  // (services/judging/queue.ts), so judges at one table rarely reach for the
  // same one. Only open projects: not graded, not held by another judge. At an
  // untimed challenge only the first QUEUE_WINDOW of them are on offer, and
  // `skip` passes over projects the judge turned down (a team away from its
  // table). At a scheduled challenge, only presentations running now in the
  // judge's room.
  nextProject: judgeProcedure
    .input(
      z.object({
        challengeId: uuid.optional(),
        skip: z.array(uuid).max(20).default([]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const seat = await seatOf(db, judge.judgeId, challenges);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        seat,
      );
      const mode = modeOf(challenges, challenge);
      const found = (
        entryId: string | null,
        needsRoom = false,
        allSkipped = false,
      ) => ({
        challenge: { id: challenge.id, label: challenge.label, mode },
        entryId,
        needsRoom,
        allSkipped,
      });

      const queue = await loadQueue(db, {
        hackathonId: input.hackathonId,
        judgeId: judge.judgeId,
        challenge,
        seat,
        filterId: input.challengeId,
      });
      if (queue.needsRoom) return found(null, true);

      // The schedule decides who sees what at a scheduled challenge.
      const window = queue.timed ? Infinity : QUEUE_WINDOW;
      const entryId = nextToGrade(
        judge.judgeId,
        challenge.id,
        queue.candidates,
        { skip: input.skip, window },
      );
      const allSkipped =
        entryId === null &&
        queueWindow(judge.judgeId, challenge.id, queue.candidates, window)
          .length > 0;
      return found(entryId, false, allSkipped);
    }),

  // Opening a project to grade it. Runs the checks a first save would (the
  // project is free, the queue offers it) and, when it passes, creates or
  // touches the judge's draft with no answers needed, so the hold starts as
  // the judge opens the project rather than at their first save. The draft
  // keeps saveDraft's deadline and revision, so the editor carries on from it.
  startGrading: judgeProcedure
    .input(z.object({ entryId: uuid, challengeId: uuid.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        await memberSeat(db, judge, challenges),
      );

      try {
        return await db.transaction(async (tx) => {
          await assertJudgingOpen(tx, input.hackathonId);
          await assertGuestSeated(tx, judge);
          await loadEntryInChallenge(tx, {
            hackathonId: input.hackathonId,
            entryId: input.entryId,
            challenge,
          });

          const [draft] = await tx
            .select({
              id: judgingEvaluationDrafts.id,
              revision: judgingEvaluationDrafts.revision,
              deadlineAt: judgingEvaluationDrafts.deadlineAt,
            })
            .from(judgingEvaluationDrafts)
            .where(
              taskOf(
                judgingEvaluationDrafts,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .for("update")
            .limit(1);
          const [evaluation] = await tx
            .select({ id: judgingEvaluations.id })
            .from(judgingEvaluations)
            .where(
              taskOf(
                judgingEvaluations,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .limit(1);
          // Their own graded project is theirs to edit; there is nothing to hold.
          if (evaluation) {
            return {
              held: false,
              revision: draft?.revision ?? 0,
              deadlineAt: draft?.deadlineAt ?? null,
            };
          }

          await claimGrading(tx, {
            judgeId: judge.judgeId,
            entryId: input.entryId,
            challenge,
          });
          if (!draft) {
            await assertQueueOffers(tx, {
              hackathonId: input.hackathonId,
              judgeId: judge.judgeId,
              entryId: input.entryId,
              challenge,
              challenges,
            });
          }

          const { timing } = await evaluationAccess(tx, {
            hackathonId: input.hackathonId,
            judgeId: judge.judgeId,
            entryId: input.entryId,
            challenge,
            challenges,
            evaluation: null,
            graceMs: DEADLINE_GRACE_MS,
          });
          if (!timing.canEdit) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: timing.reason,
            });
          }

          // As saveDraft stamps a draft that is not an edit of an evaluation.
          const deadlineAt = timing.deadlineAt ?? draft?.deadlineAt ?? null;
          const now = new Date();
          if (draft) {
            await tx
              .update(judgingEvaluationDrafts)
              .set({
                appointmentId: timing.appointmentId,
                deadlineAt,
                updatedAt: now,
              })
              .where(eq(judgingEvaluationDrafts.id, draft.id));
          } else {
            await tx.insert(judgingEvaluationDrafts).values({
              hackathonId: input.hackathonId,
              judgeId: judge.judgeId,
              entryId: input.entryId,
              challengeId: challenge.id,
              ratings: {},
              responses: {},
              appointmentId: timing.appointmentId,
              deadlineAt,
              revision: 0,
              updatedAt: now,
            });
          }

          return { held: true, revision: draft?.revision ?? 0, deadlineAt };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This project was just opened from another window. Reload to pick up the latest.",
          });
        }
        throw error;
      }
    }),

  // Gives back a project the judge opened (startGrading) and never saved to:
  // deletes their own draft while it is still revision 0, and only when they
  // have no evaluation of the project. A saved draft is work and stays. Called
  // when the judge skips a project or leaves its sheet unsaved, so a skipped
  // project is not held for GRADING_HOLD_MS and an accidental open of a
  // scheduled presentation is not held until its deadline. It touches only the
  // judge's own draft, so it needs no seat or sponsor check.
  releaseGrading: judgeProcedure
    .input(z.object({ entryId: uuid, challengeId: uuid.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;

      const challenges = await loadChallenges(db, input.hackathonId);
      const challengeId = input.challengeId
        ? rootOf(challenges, input.challengeId)?.id
        : evaluatedChallenge(
            judge,
            challenges,
            undefined,
            await memberSeat(db, judge, challenges),
          ).id;
      if (!challengeId) return { released: false };

      return db.transaction(async (tx) => {
        const [draft] = await tx
          .select({
            id: judgingEvaluationDrafts.id,
            revision: judgingEvaluationDrafts.revision,
          })
          .from(judgingEvaluationDrafts)
          .where(
            taskOf(
              judgingEvaluationDrafts,
              judge.judgeId,
              input.entryId,
              challengeId,
            ),
          )
          .for("update")
          .limit(1);
        if (!draft || draft.revision > 0) return { released: false };

        const [evaluation] = await tx
          .select({ id: judgingEvaluations.id })
          .from(judgingEvaluations)
          .where(
            taskOf(
              judgingEvaluations,
              judge.judgeId,
              input.entryId,
              challengeId,
            ),
          )
          .limit(1);
        if (evaluation) return { released: false };

        await tx
          .delete(judgingEvaluationDrafts)
          .where(eq(judgingEvaluationDrafts.id, draft.id));
        return { released: true };
      });
    }),

  // Autosave. `revision` is the draft revision the editor last saw (0 for
  // none); a save from a stale window is refused rather than overwriting.
  // The draft takes the presentation's deadline, and is submitted for the
  // judge when it passes.
  saveDraft: judgeProcedure
    .input(
      z.object({
        entryId: uuid,
        challengeId: uuid,
        ratings: ratingsInput,
        responses: responsesInput,
        revision: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        await memberSeat(db, judge, challenges),
      );
      const rubric = await loadRubric(db, input.hackathonId);
      const check = checkAnswers(rubric, input, judge.kind, "strict");
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
      }

      try {
        return await db.transaction(async (tx) => {
          await assertJudgingOpen(tx, input.hackathonId);
          await assertGuestSeated(tx, judge);
          await loadEntryInChallenge(tx, {
            hackathonId: input.hackathonId,
            entryId: input.entryId,
            challenge,
          });

          const [draft] = await tx
            .select({
              id: judgingEvaluationDrafts.id,
              revision: judgingEvaluationDrafts.revision,
              deadlineAt: judgingEvaluationDrafts.deadlineAt,
            })
            .from(judgingEvaluationDrafts)
            .where(
              taskOf(
                judgingEvaluationDrafts,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .for("update")
            .limit(1);
          const [evaluation] = await tx
            .select({ appointmentId: judgingEvaluations.appointmentId })
            .from(judgingEvaluations)
            .where(
              taskOf(
                judgingEvaluations,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .limit(1);

          // A project is graded once: a judge who has not graded it yet
          // needs it free. Their own draft is locked above, ahead of this.
          if (!evaluation) {
            await claimGrading(tx, {
              judgeId: judge.judgeId,
              entryId: input.entryId,
              challenge,
            });
            // Starting a project means taking one their queue offers.
            if (!draft) {
              await assertQueueOffers(tx, {
                hackathonId: input.hackathonId,
                judgeId: judge.judgeId,
                entryId: input.entryId,
                challenge,
                challenges,
              });
            }
          }

          if ((draft?.revision ?? 0) !== input.revision) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                evaluation && !draft
                  ? "Time ran out, so your saved answers were submitted for you. Reload to see them."
                  : "Your answers changed in another window. Reload to pick up the latest before you keep going.",
            });
          }

          const { timing } = await evaluationAccess(tx, {
            hackathonId: input.hackathonId,
            judgeId: judge.judgeId,
            entryId: input.entryId,
            challenge,
            challenges,
            evaluation: evaluation ?? null,
            graceMs: DEADLINE_GRACE_MS,
          });
          if (!timing.canEdit) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: timing.reason,
            });
          }

          const now = new Date();
          const values = {
            ratings: input.ratings,
            responses: input.responses,
            appointmentId: timing.appointmentId,
            // Editing a submitted evaluation is never timed.
            deadlineAt: evaluation
              ? null
              : (timing.deadlineAt ?? draft?.deadlineAt ?? null),
            revision: input.revision + 1,
            updatedAt: now,
          };
          if (draft) {
            await tx
              .update(judgingEvaluationDrafts)
              .set(values)
              .where(eq(judgingEvaluationDrafts.id, draft.id));
          } else {
            await tx.insert(judgingEvaluationDrafts).values({
              hackathonId: input.hackathonId,
              judgeId: judge.judgeId,
              entryId: input.entryId,
              challengeId: challenge.id,
              ...values,
            });
          }

          return {
            revision: values.revision,
            deadlineAt: values.deadlineAt,
            savedAt: now,
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Your answers were saved from another window at the same moment. Reload to pick up the latest.",
          });
        }
        throw error;
      }
    }),

  // Submits an evaluation, or a new revision of one. `expectedRevision` is
  // the revision the editor shows (0 for a first submission). Every rating and
  // every required response must be answered; only a draft whose time ran out
  // is ever submitted incomplete, and not through here.
  submit: judgeProcedure
    .input(
      z.object({
        entryId: uuid,
        challengeId: uuid,
        ratings: ratingsInput,
        responses: responsesInput,
        expectedRevision: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        await memberSeat(db, judge, challenges),
      );
      const rubric = await loadRubric(db, input.hackathonId);
      const check = checkAnswers(rubric, input, judge.kind, "strict");
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
      }
      if (!check.answers.isComplete) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Answer everything before you submit. Still to do: ${check.answers.missing.join(", ")}.`,
        });
      }

      try {
        return await db.transaction(async (tx) => {
          await assertJudgingOpen(tx, input.hackathonId);
          await assertGuestSeated(tx, judge);
          await loadEntryInChallenge(tx, {
            hackathonId: input.hackathonId,
            entryId: input.entryId,
            challenge,
          });

          // The draft first: a deadline submission holding it finishes
          // before this reads the evaluation, and then sees the result.
          const [draft] = await tx
            .select({ id: judgingEvaluationDrafts.id })
            .from(judgingEvaluationDrafts)
            .where(
              taskOf(
                judgingEvaluationDrafts,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .for("update");
          const [existing] = await tx
            .select({
              id: judgingEvaluations.id,
              revision: judgingEvaluations.revision,
              appointmentId: judgingEvaluations.appointmentId,
              autoSubmittedAt: judgingEvaluations.autoSubmittedAt,
            })
            .from(judgingEvaluations)
            .where(
              taskOf(
                judgingEvaluations,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .for("update")
            .limit(1);

          // A project is graded once: a first submission needs it free. The
          // judge's own draft and evaluation are locked above, ahead of this.
          if (!existing) {
            await claimGrading(tx, {
              judgeId: judge.judgeId,
              entryId: input.entryId,
              challenge,
            });
            // Starting a project means taking one their queue offers.
            if (!draft) {
              await assertQueueOffers(tx, {
                hackathonId: input.hackathonId,
                judgeId: judge.judgeId,
                entryId: input.entryId,
                challenge,
                challenges,
              });
            }
          }

          if ((existing?.revision ?? 0) !== input.expectedRevision) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                existing?.autoSubmittedAt && input.expectedRevision === 0
                  ? "Time ran out, so your saved answers were submitted for you. Reload to see them."
                  : "This evaluation changed in another window. Reload to see the latest before you submit.",
            });
          }

          const { timing } = await evaluationAccess(tx, {
            hackathonId: input.hackathonId,
            judgeId: judge.judgeId,
            entryId: input.entryId,
            challenge,
            challenges,
            evaluation: existing ?? null,
            graceMs: DEADLINE_GRACE_MS,
          });
          if (!timing.canEdit) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: timing.reason,
            });
          }

          const written = await writeEvaluation(tx, {
            hackathonId: input.hackathonId,
            judgeId: judge.judgeId,
            entryId: input.entryId,
            challengeId: challenge.id,
            appointmentId: existing
              ? existing.appointmentId
              : timing.appointmentId,
            answers: check.answers,
            existing: existing ?? null,
            at: new Date(),
            auto: false,
          });
          await tx
            .delete(judgingEvaluationDrafts)
            .where(
              taskOf(
                judgingEvaluationDrafts,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            );

          return {
            ...written,
            isComplete: true,
            score: evaluationScore(check.answers.ratings.map((r) => r.value)),
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This evaluation was just submitted from another window. Reload to see it.",
          });
        }
        throw error;
      }
    }),

  // Everything this judge has submitted in the edition, newest first.
  myEvaluations: judgeProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    await reconcileDueDrafts(db, input.hackathonId);

    const rows = await db
      .select({
        id: judgingEvaluations.id,
        entryId: judgingEvaluations.entryId,
        challengeId: judgingEvaluations.challengeId,
        challengeLabel: judgingChallenges.label,
        title: judgingEntries.title,
        deletedAt: judgingEntries.deletedAt,
        revision: judgingEvaluations.revision,
        isComplete: judgingEvaluations.isComplete,
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
      .where(
        and(
          eq(judgingEvaluations.judgeId, ctx.judge.judgeId),
          eq(judgingEvaluations.hackathonId, input.hackathonId),
        ),
      )
      .orderBy(desc(judgingEvaluations.updatedAt));

    const answers = await answersOf(
      db,
      rows.map((row) => row.id),
    );
    // The score shows once the evaluation counts, as placings count it.
    const ratingItems = (await loadRubric(db, input.hackathonId)).filter(
      (item) => item.kind === "rating",
    ).length;
    return rows.map(({ deletedAt, ...row }) => {
      const mine = answers.get(row.id) ?? { ratings: {}, responses: {} };
      const ratings = Object.values(mine.ratings);
      return {
        ...row,
        withdrawn: deletedAt !== null,
        ratings: mine.ratings,
        responses: mine.responses,
        score: hasEveryRating(ratings, ratingItems)
          ? evaluationScore(ratings)
          : null,
      };
    });
  }),
};
