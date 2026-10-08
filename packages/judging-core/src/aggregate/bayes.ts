/**
 * Pull a project's normalised average toward the field when few judges have
 * seen it. `c` is how many average votes the prior is worth. At `c = 2`,
 * two real votes and the prior weigh the same.
 */
export function bayesianShrink(
  normalizedAvg: number,
  n: number,
  globalAvg: number,
  c: number,
): number {
  if (n <= 0) return 0;
  return (n / (n + c)) * normalizedAvg + (c / (n + c)) * globalAvg;
}

/** Hundredths, same rounding the published placings use. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
