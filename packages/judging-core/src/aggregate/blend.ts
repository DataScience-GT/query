/** `weight` is the share of the pairwise component. Zero is rubric only. */
export function blend(
  rubric: number,
  pairwise: number,
  weight: number,
): number {
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
    throw new Error("pairwise weight must be between 0 and 1");
  }
  return (1 - weight) * rubric + weight * pairwise;
}
