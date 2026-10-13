// Turns evaluations into placings: one ranking per challenge and one overall.
// A project's score is the mean of its complete evaluations (scoring.ts);
// equal scores share a placing. Projects nobody scored are left out rather
// than listed last, since a placing is published and "8th of 8" for a project
// no judge reached would be a claim nobody made.

import { overallScore, rankByScore, scopedScore } from "./scoring";
import type { ScoredEvaluation } from "./scoring";

/** The placement scope for the ranking across every challenge. */
export const OVERALL_SCOPE = "overall";
export const OVERALL_LABEL = "Overall";

export type PlacementEvaluation = ScoredEvaluation & { entryId: string };

export type ComputedPlacement = {
  /** "overall" or a challenge id. */
  scope: string;
  scopeLabel: string;
  entryId: string;
  placement: number;
  score: number;
  evaluationCount: number;
};

export function computePlacements(input: {
  /** Projects still in judging. Evaluations of anything else are ignored. */
  entryIds: readonly string[];
  /** Which projects are in which challenge. */
  memberships: readonly { entryId: string; challengeId: string }[];
  /** Every challenge, in the order rankings should come out. */
  challenges: readonly { id: string; label: string }[];
  evaluations: readonly PlacementEvaluation[];
}): ComputedPlacement[] {
  // Sorted so a tie keeps the same order from one compute to the next.
  const entryIds = [...new Set(input.entryIds)].sort();
  const live = new Set(entryIds);

  const evaluationsOf = new Map<string, PlacementEvaluation[]>();
  for (const evaluation of input.evaluations) {
    if (!live.has(evaluation.entryId)) continue;
    const list = evaluationsOf.get(evaluation.entryId) ?? [];
    list.push(evaluation);
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
      .map((entryId) => ({
        entryId,
        ...summarize(evaluationsOf.get(entryId) ?? []),
      }))
      .filter(
        (row): row is { entryId: string; score: number; count: number } =>
          row.score !== null,
      );
    return rankByScore(scored).map((row) => ({
      scope,
      scopeLabel,
      entryId: row.entryId,
      placement: row.rank,
      score: row.score,
      evaluationCount: row.count,
    }));
  };

  const placements = rank(OVERALL_SCOPE, OVERALL_LABEL, entryIds, overallScore);

  for (const challenge of input.challenges) {
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
        (evals) => scopedScore(evals, challenge.id),
      ),
    );
  }

  return placements;
}

/** numeric(4,2) as the driver wants it. */
export function formatScore(score: number): string {
  return score.toFixed(2);
}
