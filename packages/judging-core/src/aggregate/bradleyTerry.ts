import type { Comparison } from "../comparison";

/**
 * Bradley-Terry strengths from pairwise outcomes. A tie is half a win each.
 * Strengths are scaled so their mean is 1. Projects that never appear in a
 * comparison are left at 1. Iteration is the minorization-maximization
 * update; `iterations` is a cap, not a clock.
 */
export function bradleyTerry(
  projectIds: readonly string[],
  comparisons: readonly Comparison[],
  iterations = 50,
): Map<string, number> {
  const ids = [...new Set(projectIds)];
  const strength = new Map(ids.map((id) => [id, 1]));
  if (ids.length === 0 || comparisons.length === 0) return strength;

  const wins = new Map(ids.map((id) => [id, 0]));
  const games = new Map<string, Map<string, number>>();

  const addGame = (left: string, right: string) => {
    const row = games.get(left) ?? new Map<string, number>();
    row.set(right, (row.get(right) ?? 0) + 1);
    games.set(left, row);
  };

  for (const comparison of comparisons) {
    if (
      comparison.a === comparison.b ||
      !strength.has(comparison.a) ||
      !strength.has(comparison.b)
    ) {
      continue;
    }
    if (comparison.outcome === "tie") {
      wins.set(comparison.a, (wins.get(comparison.a) ?? 0) + 0.5);
      wins.set(comparison.b, (wins.get(comparison.b) ?? 0) + 0.5);
    } else if (comparison.outcome === "a") {
      wins.set(comparison.a, (wins.get(comparison.a) ?? 0) + 1);
    } else {
      wins.set(comparison.b, (wins.get(comparison.b) ?? 0) + 1);
    }
    addGame(comparison.a, comparison.b);
    addGame(comparison.b, comparison.a);
  }

  for (let step = 0; step < iterations; step += 1) {
    const next = new Map<string, number>();
    for (const id of ids) {
      const opponents = games.get(id);
      if (!opponents || opponents.size === 0) {
        next.set(id, strength.get(id) ?? 1);
        continue;
      }
      let denominator = 0;
      for (const [other, count] of opponents) {
        const pi = strength.get(id) ?? 1;
        const pj = strength.get(other) ?? 1;
        const sum = pi + pj;
        if (sum > 0) denominator += count / sum;
      }
      const won = wins.get(id) ?? 0;
      next.set(id, denominator > 0 ? won / denominator : 0);
    }
    let total = 0;
    for (const value of next.values()) total += value;
    const mean = total / ids.length || 1;
    for (const id of ids) strength.set(id, (next.get(id) ?? 0) / mean);
  }

  return strength;
}
