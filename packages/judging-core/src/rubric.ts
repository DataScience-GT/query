/**
 * A score is one number per criterion, inside that criterion's range.
 * The total is the weighted mean, so it stays on the same scale as the
 * criteria. The rows are the truth; the total is derived.
 */

export type Criterion = {
  id: string;
  min: number;
  max: number;
  weight: number;
};

export type ScoreInput = {
  criterionId: string;
  value: number;
};

export type ScoreCheck = { ok: true } | { ok: false; reason: string };

export function validateScores(
  criteria: readonly Criterion[],
  input: readonly ScoreInput[],
): ScoreCheck {
  for (const criterion of criteria) {
    if (!Number.isFinite(criterion.weight) || criterion.weight < 0) {
      return {
        ok: false,
        reason: `weight for ${criterion.id} must be zero or more`,
      };
    }
    if (
      !Number.isFinite(criterion.min) ||
      !Number.isFinite(criterion.max) ||
      criterion.min > criterion.max
    ) {
      return { ok: false, reason: `range for ${criterion.id} is invalid` };
    }
  }

  const seen = new Set<string>();
  for (const score of input) {
    if (seen.has(score.criterionId)) {
      return { ok: false, reason: `duplicate score for ${score.criterionId}` };
    }
    seen.add(score.criterionId);
    const criterion = criteria.find((item) => item.id === score.criterionId);
    if (!criterion) {
      return { ok: false, reason: `unknown criterion ${score.criterionId}` };
    }
    if (
      !Number.isFinite(score.value) ||
      score.value < criterion.min ||
      score.value > criterion.max
    ) {
      return {
        ok: false,
        reason: `${score.criterionId} must be between ${criterion.min} and ${criterion.max}`,
      };
    }
  }

  for (const criterion of criteria) {
    if (!seen.has(criterion.id)) {
      return { ok: false, reason: `missing score for ${criterion.id}` };
    }
  }

  return { ok: true };
}

export function weightedTotal(
  criteria: readonly Criterion[],
  input: readonly ScoreInput[],
): number {
  const check = validateScores(criteria, input);
  if (!check.ok) throw new Error(check.reason);
  const weight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (weight === 0) return 0;
  const byId = new Map(input.map((score) => [score.criterionId, score.value]));
  const sum = criteria.reduce((total, criterion) => {
    return total + (byId.get(criterion.id) ?? 0) * criterion.weight;
  }, 0);
  return sum / weight;
}
