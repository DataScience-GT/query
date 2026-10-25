// Turns evaluations into placings: one ranking per challenge and one overall.
// A project's score is the mean of its counted evaluations (scoring.ts), each
// calibrated for its judge's habits first (calibration.ts); equal scores share
// a placing. The raw mean is kept beside it. Projects nobody scored are left
// out rather than listed last, since a placing is published and "8th of 8" for
// a project no judge reached would be a claim nobody made.
//
// Judges grade against a challenge's root, so a child challenge (an individual
// prize under a group like "MLH Challenges") is ranked from its root's
// evaluations, among the projects entered in the child.

import { calibrate } from "./calibration";
import { rootOf } from "./scope";
import { overallScore, rankByScore, scopedScore } from "./scoring";
import type { ScoredEvaluation } from "./scoring";

/** The placement scope for the ranking across every challenge. */
export const OVERALL_SCOPE = "overall";
export const OVERALL_LABEL = "Overall";

export type PlacementEvaluation = ScoredEvaluation & {
  /** Calibration counts evaluations by this alone. */
  ratingsComplete: boolean;
  id: string;
  entryId: string;
  judgeId: string;
  submittedAt: Date;
};

export type ComputedPlacement = {
  /** "overall" or a challenge id. */
  scope: string;
  scopeLabel: string;
  entryId: string;
  placement: number;
  /** Calibrated for judge bias. This is what ranks. */
  score: number;
  /** The plain mean of the same evaluations. */
  rawScore: number;
  evaluationCount: number;
};

export function computePlacements(input: {
  /** Projects still in judging. Evaluations of anything else are ignored. */
  entryIds: readonly string[];
  /** Which projects are in which challenge. */
  memberships: readonly { entryId: string; challengeId: string }[];
  /** Every challenge, in the order rankings should come out. */
  challenges: readonly {
    id: string;
    label: string;
    /** The group it sits in; absent for a top-level challenge. */
    parentId?: string | null;
  }[];
  evaluations: readonly PlacementEvaluation[];
}): ComputedPlacement[] {
  // Sorted so a tie keeps the same order from one compute to the next.
  const entryIds = [...new Set(input.entryIds)].sort();
  const live = new Set(entryIds);

  // Calibrated once, over every counted evaluation of a live entry, so a
  // judge's habits are learned from all of their grades and not from the
  // slice that fell in one scope.
  const liveEvaluations = input.evaluations.filter((evaluation) =>
    live.has(evaluation.entryId),
  );
  const { adjusted } = calibrate(liveEvaluations);

  const evaluationsOf = new Map<string, PlacementEvaluation[]>();
  for (const evaluation of liveEvaluations) {
    const list = evaluationsOf.get(evaluation.entryId) ?? [];
    list.push({ ...evaluation, adjustedScore: adjusted.get(evaluation.id) });
    evaluationsOf.set(evaluation.entryId, list);
  }

  const rank = (
    scope: string,
    scopeLabel: string,
    candidates: readonly string[],
    summarize: (evals: PlacementEvaluation[]) => {
      score: number | null;
      count: number;
    },
  ): ComputedPlacement[] => {
    const scored = candidates
      .map((entryId) => {
        const evals = evaluationsOf.get(entryId) ?? [];
        return {
          entryId,
          ...summarize(evals),
          // The same evaluations on their plain ratings.
          rawScore: summarize(
            evals.map((evaluation) => ({
              ...evaluation,
              adjustedScore: undefined,
            })),
          ).score,
        };
      })
      .filter(
        (
          row,
        ): row is {
          entryId: string;
          score: number;
          count: number;
          rawScore: number;
        } => row.score !== null && row.rawScore !== null,
      );
    return rankByScore(scored).map((row) => ({
      scope,
      scopeLabel,
      entryId: row.entryId,
      placement: row.rank,
      score: row.score,
      rawScore: row.rawScore,
      evaluationCount: row.count,
    }));
  };

  const placements = rank(OVERALL_SCOPE, OVERALL_LABEL, entryIds, overallScore);

  const tree = input.challenges.map((challenge) => ({
    id: challenge.id,
    parentId: challenge.parentId ?? null,
    mode: "scheduled" as const,
  }));
  for (const challenge of input.challenges) {
    // Evaluations are stored against the root, whichever challenge is ranked.
    const evaluated = rootOf(tree, challenge.id)?.id ?? challenge.id;
    const members = new Set(
      input.memberships
        .filter((membership) => membership.challengeId === challenge.id)
        .map((membership) => membership.entryId),
    );
    placements.push(
      ...rank(
        challenge.id,
        challenge.label,
        entryIds.filter((id) => members.has(id)),
        (evals) => scopedScore(evals, evaluated),
      ),
    );
  }

  return placements;
}

/** numeric(4,2) as the driver wants it. */
export function formatScore(score: number): string {
  return score.toFixed(2);
}
