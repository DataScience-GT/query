import { describe, expect, it } from "vitest";
import { zNormalize } from "./zscore";

const mean = (xs: number[]) => xs.reduce((sum, value) => sum + value, 0) / xs.length;
const stddev = (xs: number[]) => {
  const center = mean(xs);
  return Math.sqrt(mean(xs.map((value) => (value - center) ** 2)));
};

describe("zNormalize", () => {
  it("returns the global mean when fewer than two scores", () => {
    expect(zNormalize([8], 5, 2)).toEqual([5]);
    expect(zNormalize([], 5, 2)).toEqual([]);
  });

  it("returns the global mean when a judge scored everything the same", () => {
    expect(zNormalize([7, 7, 7], 5, 2)).toEqual([5, 5, 5]);
  });

  it("spreads scores around the global mean", () => {
    const normalized = zNormalize([2, 5, 8], 5, 2);
    expect(normalized[0] ?? 0).toBeLessThan(5);
    expect(normalized[1] ?? 0).toBeCloseTo(5, 1);
    expect(normalized[2] ?? 0).toBeGreaterThan(5);
  });

  it("preserves a judge's own ordering", () => {
    const normalized = zNormalize([1, 4, 9, 10], 5, 2);
    for (let index = 1; index < normalized.length; index += 1) {
      expect(normalized[index] ?? 0).toBeGreaterThan(normalized[index - 1] ?? 0);
    }
  });

  it("makes a harsh judge and a lenient judge agree", () => {
    const harsh = zNormalize([1, 2, 3], 5, 2);
    const lenient = zNormalize([8, 9, 10], 5, 2);
    expect(harsh[0] ?? 0).toBeCloseTo(lenient[0] ?? 0, 10);
    expect(harsh[1] ?? 0).toBeCloseTo(lenient[1] ?? 0, 10);
    expect(harsh[2] ?? 0).toBeCloseTo(lenient[2] ?? 0, 10);
  });

  it("makes a wide-spread judge and a narrow-spread judge agree", () => {
    const wide = zNormalize([0, 5, 10], 5, 2);
    const narrow = zNormalize([4, 5, 6], 5, 2);
    expect(wide[0] ?? 0).toBeCloseTo(narrow[0] ?? 0, 10);
    expect(wide[2] ?? 0).toBeCloseTo(narrow[2] ?? 0, 10);
  });

  it("centres the normalized scores on the global mean", () => {
    expect(mean(zNormalize([1, 4, 9, 10], 7, 2))).toBeCloseTo(7, 10);
  });

  it("gives the normalized scores the global spread", () => {
    expect(stddev(zNormalize([1, 4, 9, 10], 5, 3))).toBeCloseTo(3, 10);
  });

  it("never produces NaN or Infinity for degenerate input", () => {
    const cases = [
      zNormalize([7, 7], 5, 2),
      zNormalize([0, 0, 0], 5, 2),
      zNormalize([5], 5, 0),
      zNormalize([1, 2], 0, 0),
    ];
    for (const result of cases) {
      for (const value of result) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("handles negative scores and keeps equals equal", () => {
    const negative = zNormalize([-5, 0, 5], 5, 2);
    expect(negative[0] ?? 0).toBeLessThan(negative[2] ?? 0);
    const tied = zNormalize([3, 3, 9], 5, 2);
    expect(tied[0] ?? 0).toBeCloseTo(tied[1] ?? 0, 10);
  });

  it("collapses to the global mean when the global spread is zero", () => {
    expect(zNormalize([1, 5, 9], 6, 0)).toEqual([6, 6, 6]);
  });
});
