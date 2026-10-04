import { describe, it, expect } from "vitest";
import { zNormalize } from "./helpers";

/**
 * The maths that decides who wins.
 *
 * These are the invariants a result has to satisfy to be defensible: a judge's
 * own ordering must survive normalization, two judges who rank the same order
 * must agree after it whatever their personal harshness.
 */

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stddev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

describe("zNormalize — properties", () => {
  it("preserves a judge's own ordering", () => {
    const normalized = zNormalize([1, 4, 9, 10], 5, 2);

    for (let i = 1; i < normalized.length; i++) {
      expect(normalized[i]!).toBeGreaterThan(normalized[i - 1]!);
    }
  });

  /**
   * The entire point of normalizing: a harsh judge and a lenient one who put
   * the same projects in the same order must produce the same numbers, so
   * neither one's temperament decides the result.
   */
  it("makes a harsh judge and a lenient judge agree", () => {
    const harsh = zNormalize([1, 2, 3], 5, 2);
    const lenient = zNormalize([8, 9, 10], 5, 2);

    expect(harsh[0]).toBeCloseTo(lenient[0]!, 10);
    expect(harsh[1]).toBeCloseTo(lenient[1]!, 10);
    expect(harsh[2]).toBeCloseTo(lenient[2]!, 10);
  });

  it("makes a wide-spread judge and a narrow-spread judge agree on ordering", () => {
    const wide = zNormalize([0, 5, 10], 5, 2);
    const narrow = zNormalize([4, 5, 6], 5, 2);

    expect(wide[0]).toBeCloseTo(narrow[0]!, 10);
    expect(wide[2]).toBeCloseTo(narrow[2]!, 10);
  });

  it("centres the normalized scores on the global mean", () => {
    expect(mean(zNormalize([1, 4, 9, 10], 7, 2))).toBeCloseTo(7, 10);
  });

  it("gives the normalized scores the global spread", () => {
    expect(stddev(zNormalize([1, 4, 9, 10], 5, 3))).toBeCloseTo(3, 10);
  });

  it("returns the global mean when a judge scored everything the same", () => {
    expect(zNormalize([7, 7, 7], 5, 2)).toEqual([5, 5, 5]);
  });

  it("returns the global mean for a judge with a single score", () => {
    expect(zNormalize([9], 5, 2)).toEqual([5]);
  });

  it("returns nothing for a judge with no scores", () => {
    expect(zNormalize([], 5, 2)).toEqual([]);
  });

  it("never produces NaN or Infinity for degenerate input", () => {
    const cases = [
      zNormalize([7, 7], 5, 2),
      zNormalize([0, 0, 0], 5, 2),
      zNormalize([5], 5, 0),
      zNormalize([1, 2], 0, 0),
    ];

    for (const result of cases) {
      for (const value of result) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("handles negative and zero scores", () => {
    const normalized = zNormalize([-5, 0, 5], 5, 2);
    expect(normalized.every((v) => Number.isFinite(v))).toBe(true);
    expect(normalized[0]!).toBeLessThan(normalized[2]!);
  });

  it("collapses to the global mean when the global spread is zero", () => {
    expect(zNormalize([1, 5, 9], 6, 0)).toEqual([6, 6, 6]);
  });

  it("keeps two equal scores equal after normalizing", () => {
    const normalized = zNormalize([3, 3, 9], 5, 2);
    expect(normalized[0]).toBeCloseTo(normalized[1]!, 10);
  });
});
