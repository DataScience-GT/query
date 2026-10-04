import { describe, it, expect } from "vitest";
import { zNormalize } from "./helpers";

describe("zNormalize", () => {
  it("returns global mean when fewer than two scores", () => {
    expect(zNormalize([8], 5, 2)).toEqual([5]);
    expect(zNormalize([], 5, 2)).toEqual([]);
  });

  it("returns global mean when judge gave identical scores", () => {
    expect(zNormalize([7, 7, 7], 5, 2)).toEqual([5, 5, 5]);
  });

  it("spreads scores around the global mean", () => {
    const normalized = zNormalize([2, 5, 8], 5, 2);
    expect(normalized[0]).toBeLessThan(5);
    expect(normalized[1]).toBeCloseTo(5, 1);
    expect(normalized[2]).toBeGreaterThan(5);
  });
});
