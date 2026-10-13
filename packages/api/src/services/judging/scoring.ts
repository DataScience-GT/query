// Pure scoring for room judging. A judge's evaluation scores the mean of its
// 1–5 ratings; a project's score in a scope is the mean of those evaluation
// scores, counting complete evaluations only. Every evaluation weighs the
// same, whoever wrote it.

/** An evaluation as scoring sees it. */
export type ScoredEvaluation = {
  challengeId: string;
  isComplete: boolean;
  /** The 1–5 rating values it holds. */
  ratings: readonly number[];
};

export type ScoreSummary = {
  /** Null when no complete evaluation has a rating. */
  score: number | null;
  /** How many evaluations the score is the mean of. */
  count: number;
};

export function meanOrNull(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** One evaluation's score: the mean of its ratings, null with none. */
export function evaluationScore(values: readonly number[]): number | null {
  return meanOrNull(values);
}

function summarize(evals: readonly ScoredEvaluation[]): ScoreSummary {
  const scores = evals
    .filter((evaluation) => evaluation.isComplete)
    .map((evaluation) => evaluationScore(evaluation.ratings))
    .filter((score): score is number => score !== null);
  return { score: meanOrNull(scores), count: scores.length };
}

/** A project's score in one challenge, from that project's evaluations. */
export function scopedScore(
  evals: readonly ScoredEvaluation[],
  challengeId: string,
): ScoreSummary {
  return summarize(evals.filter((e) => e.challengeId === challengeId));
}

/** A project's overall score: every complete evaluation, in any challenge. */
export function overallScore(evals: readonly ScoredEvaluation[]): ScoreSummary {
  return summarize(evals);
}

// Placements are stored as numeric(4,2), so scores that print the same must
// tie the same; comparing raw floats split 3.333… from 3.333… by rounding noise.
const toHundredths = (score: number) => Math.round(score * 100);

/**
 * Ranks rows by score, highest first. Equal scores share a rank and the next
 * rank skips (1, 1, 3). Rows without a score come last and share the rank
 * after the scored ones. Ties keep their input order.
 */
export function rankByScore<T extends { score: number | null }>(
  rows: readonly T[],
): (T & { rank: number })[] {
  const ordered = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const sa = a.row.score === null ? null : toHundredths(a.row.score);
      const sb = b.row.score === null ? null : toHundredths(b.row.score);
      if (sa === sb) return a.index - b.index;
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sb - sa;
    });

  const ranked: (T & { rank: number })[] = [];
  let previous: number | null | undefined;
  let rank = 0;
  ordered.forEach(({ row }, position) => {
    const key = row.score === null ? null : toHundredths(row.score);
    if (position === 0 || key !== previous) rank = position + 1;
    previous = key;
    ranked.push({ ...row, rank });
  });
  return ranked;
}
