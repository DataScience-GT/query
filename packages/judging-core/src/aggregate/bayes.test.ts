import { describe, expect, it } from "vitest";
import { bayesianShrink, round2 } from "./bayes";

describe("bayesianShrink", () => {
  it("is zero when nobody voted", () => {
    expect(bayesianShrink(9, 0, 5, 2)).toBe(0);
  });

  it("weighs two votes equally with the prior at c = 2", () => {
    expect(bayesianShrink(8, 2, 4, 2)).toBe(6);
  });

  it("approaches the project's own average as votes accumulate", () => {
    const few = bayesianShrink(10, 1, 0, 2);
    const many = bayesianShrink(10, 100, 0, 2);
    expect(many).toBeGreaterThan(few);
    expect(many).toBeGreaterThan(9.5);
  });
});

describe("round2", () => {
  it("rounds half up to the hundredth", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(7.085)).toBe(7.09);
  });
});
