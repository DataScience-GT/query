// Shared judge scoring utilities

// Z-score normalizes a judge's scores against their own mean and stddev,
// removing per-judge harshness before aggregation. Null under 2 data points.
export function zNormalize(
  scores: number[],
  globalMean: number,
  globalStd: number,
): number[] {
  if (scores.length < 2) return scores.map(() => globalMean);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);
  if (std === 0) return scores.map(() => globalMean); // judge gave same score to everything
  return scores.map((v) => globalMean + ((v - mean) / std) * globalStd);
}
