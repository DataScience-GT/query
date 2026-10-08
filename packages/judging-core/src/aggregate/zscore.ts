/**
 * Z-score a judge's scores against their own mean and spread, then place
 * that shape on the global mean and spread. A judge with fewer than two
 * scores, or who gave everything the same number, has no spread of their
 * own, so every score becomes the global mean. A global spread of zero
 * collapses everyone onto the global mean too.
 */
export function zNormalize(
  scores: readonly number[],
  globalMean: number,
  globalStd: number,
): number[] {
  if (scores.length < 2) return scores.map(() => globalMean);
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance =
    scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);
  if (std === 0 || globalStd === 0) return scores.map(() => globalMean);
  return scores.map(
    (value) => globalMean + ((value - mean) / std) * globalStd,
  );
}
