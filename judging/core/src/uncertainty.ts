import type { Comparison } from "./comparison";

/**
 * How unsettled a project's rank is.
 * Score spread shrinks as more judges agree and as the sample grows.
 * A pairwise neighbour that is split (or tied) adds a bonus, because those
 * two projects are the ones another look can still reorder.
 */

export function scoreUncertainty(scores: readonly number[]): number {
  const n = scores.length;
  if (n === 0) return Number.POSITIVE_INFINITY;
  const mean = scores.reduce((sum, value) => sum + value, 0) / n;
  const variance =
    scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n;
  return variance / Math.sqrt(n);
}

export function contestBonus(
  comparisons: readonly Comparison[],
  projectId: string,
): number {
  const against = new Map<
    string,
    { wins: number; losses: number; ties: number }
  >();

  for (const comparison of comparisons) {
    const opponent =
      comparison.a === projectId
        ? comparison.b
        : comparison.b === projectId
          ? comparison.a
          : null;
    if (!opponent) continue;
    const row = against.get(opponent) ?? { wins: 0, losses: 0, ties: 0 };
    if (comparison.outcome === "tie") row.ties += 1;
    else if (
      (comparison.outcome === "a" && comparison.a === projectId) ||
      (comparison.outcome === "b" && comparison.b === projectId)
    ) {
      row.wins += 1;
    } else {
      row.losses += 1;
    }
    against.set(opponent, row);
  }

  let bonus = 0;
  for (const row of against.values()) {
    const n = row.wins + row.losses + row.ties;
    if (n === 0) continue;
    bonus += (n - Math.abs(row.wins - row.losses)) / n;
  }
  return bonus;
}

export function projectUncertainty(
  scores: readonly number[],
  comparisons: readonly Comparison[],
  projectId: string,
): number {
  const spread = scoreUncertainty(scores);
  if (!Number.isFinite(spread)) return spread;
  return spread + contestBonus(comparisons, projectId);
}
