// Judge calibration. Each project is graded once per challenge, by one judge,
// so a strict, lenient, bunched or drifting judge decides the score of every
// project they happened to grade. This takes that judge out of the score.
//
// It is valid only because the judge queue (queue.ts) hands each judge a random
// sample of the projects: a random sample is as good as the pool, so a judge
// whose mean, spread or trend differs from the pool's is showing their own
// habits, not an easier or harder set of projects. Hand a judge picked projects
// and the correction below would punish them for it.
//
// A pool is one root challenge: sponsor judges are compared only with the other
// judges of that sponsor's challenge, table judges with table judges, and a
// judge who grades in two challenges gets separate parameters in each. Within a
// pool, over complete evaluations with a score s (the mean of its ratings):
//
//   mu       the pool's mean
//   drift    a judge's grades in order (submittedAt, then id): the slope of s on
//            the centred order index, shrunk, removed: s' = s - slope * (i - mean i)
//   sd       the pool's population standard deviation of s' with each judge's
//            own mean taken out (judges with two or more grades)
//   offset   a = shrink * (mean(s') - mu): stricter (below 0) or more lenient
//   spread   b = 1 + shrink * (sd_j(s') / sd - 1), in [0.5, 2]: bunched or wide
//
//   adjusted = clamp(mu + (s' - mu - a) / b, 1, 5)
//
// where shrink = n / (n + K) for a judge with n grades (K_A, K_B, K_D below).

import { evaluationScore } from "./scoring";

// Pseudo-evaluations: a judge with n grades is trusted n / (n + K) of the way,
// so one with few grades is pulled toward no correction. K_A is for the offset,
// K_B for the spread, K_D for the drift (a trend needs more grades than a mean
// to be believed).
export const K_A = 3;
export const K_B = 6;
export const K_D = 10;

const MIN_SPREAD = 0.5;
const MAX_SPREAD = 2;
const MIN_RATING = 1;
const MAX_RATING = 5;
// Below this a standard deviation is float noise, not a spread.
const FLAT = 1e-9;

export type CalibrationEvaluation = {
  id: string;
  judgeId: string;
  /** The root challenge. It is the pool: nothing is compared across it. */
  challengeId: string;
  entryId: string;
  submittedAt: Date;
  isComplete: boolean;
  /** The 1-5 rating values it holds. */
  ratings: readonly number[];
};

export type JudgeCalibration = {
  judgeId: string;
  challengeId: string;
  /** Complete, scored evaluations the judge has in this challenge. */
  evaluations: number;
  /** Rating points taken off the judge's scores. Positive: more lenient than the pool. */
  offset: number;
  /** What the judge's spread was divided by. Below 1: bunched. Above 1: wider than the pool. */
  spread: number;
  /** Points gained (positive) or lost (negative) from the judge's first grade to their last. */
  drift: number;
};

export type Calibration = {
  /** The calibrated score of each complete, scored evaluation, by id. */
  adjusted: Map<string, number>;
  judges: JudgeCalibration[];
};

type Graded = {
  id: string;
  judgeId: string;
  challengeId: string;
  at: number;
  score: number;
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const mean = (values: readonly number[]) => {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
};

const populationSd = (values: readonly number[]) => {
  const centre = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - centre) ** 2;
  return Math.sqrt(sum / values.length);
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const shrink = (n: number, k: number) => n / (n + k);

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(key(item)) ?? [];
    list.push(item);
    groups.set(key(item), list);
  }
  return groups;
}

/**
 * Calibrated scores for every complete evaluation, and what was learned about
 * each judge. Incomplete evaluations, and complete ones with no ratings, are
 * left out of both. The result does not depend on the order of the input.
 */
export function calibrate(
  evaluations: readonly CalibrationEvaluation[],
): Calibration {
  const graded: Graded[] = [];
  for (const evaluation of evaluations) {
    if (!evaluation.isComplete) continue;
    const score = evaluationScore(evaluation.ratings);
    if (score === null) continue;
    graded.push({
      id: evaluation.id,
      judgeId: evaluation.judgeId,
      challengeId: evaluation.challengeId,
      at: evaluation.submittedAt.getTime(),
      score,
    });
  }

  // One canonical order, so the sums below add up the same way whatever order
  // the caller listed the evaluations in.
  graded.sort(
    (a, b) =>
      compareText(a.challengeId, b.challengeId) ||
      compareText(a.judgeId, b.judgeId) ||
      a.at - b.at ||
      compareText(a.id, b.id),
  );

  const adjusted = new Map<string, number>();
  const judges: JudgeCalibration[] = [];

  for (const pool of groupBy(graded, (g) => g.challengeId).values()) {
    const mu = mean(pool.map((g) => g.score));

    const byJudge = [...groupBy(pool, (g) => g.judgeId).values()].map(
      (grades) => {
        const n = grades.length;
        const scores = grades.map((g) => g.score);
        const centre = (n - 1) / 2;

        // Least-squares slope of score on the centred order index. Three
        // grades is the fewest that can show a trend.
        let slope = 0;
        if (n >= 3) {
          const average = mean(scores);
          let along = 0;
          let across = 0;
          scores.forEach((score, index) => {
            along += (index - centre) * (score - average);
            across += (index - centre) ** 2;
          });
          slope = (along / across) * shrink(n, K_D);
        }
        const detrended = scores.map(
          (score, index) => score - slope * (index - centre),
        );
        return { grades, slope, detrended };
      },
    );

    // What a judge's spread is measured against: the pool's spread once each
    // judge's own mean is taken out. The plain spread of the pool also holds
    // the gaps between judges' means, so beside a lenient judge a strict one
    // with an ordinary spread would look bunched, and both would be stretched.
    // A judge with one grade has no spread of their own and is left out.
    let squares = 0;
    let counted = 0;
    for (const { detrended } of byJudge) {
      if (detrended.length < 2) continue;
      const centre = mean(detrended);
      for (const value of detrended) squares += (value - centre) ** 2;
      counted += detrended.length;
    }
    const sd = counted > 0 ? Math.sqrt(squares / counted) : 0;

    for (const { grades, slope, detrended } of byJudge) {
      const n = grades.length;
      const offset = shrink(n, K_A) * (mean(detrended) - mu);

      // A judge who gave every project the same score has a spread of 0, which
      // would be a divisor near 0 below. The clamp stops the divisor at 0.5
      // (reached once they have 6 or more grades; with fewer, the shrink keeps
      // it higher), so what is left of their score after the offset is at most
      // doubled. Every project they graded lands on the same value, inside
      // 1 to 5: they said nothing about which project was better.
      let spread = 1;
      if (n >= 2 && sd > FLAT) {
        spread = clamp(
          1 + shrink(n, K_B) * (populationSd(detrended) / sd - 1),
          MIN_SPREAD,
          MAX_SPREAD,
        );
      }

      grades.forEach((grade, index) => {
        adjusted.set(
          grade.id,
          clamp(
            mu + ((detrended[index] as number) - mu - offset) / spread,
            MIN_RATING,
            MAX_RATING,
          ),
        );
      });
      judges.push({
        judgeId: grades[0]!.judgeId,
        challengeId: grades[0]!.challengeId,
        evaluations: n,
        offset,
        spread,
        drift: slope * (n - 1),
      });
    }
  }

  return { adjusted, judges };
}
