import { describe, expect, it } from "vitest";
import { validateScores, weightedTotal } from "./rubric";
import type { Criterion } from "./rubric";

const criteria: Criterion[] = [
  { id: "creativity", min: 0, max: 10, weight: 1 },
  { id: "impact", min: 0, max: 10, weight: 3 },
];

describe("validateScores", () => {
  it("accepts one in-range value per criterion", () => {
    expect(
      validateScores(criteria, [
        { criterionId: "creativity", value: 0 },
        { criterionId: "impact", value: 10 },
      ]),
    ).toEqual({ ok: true });
  });

  it("rejects a missing, duplicate, unknown, or out-of-range score", () => {
    expect(validateScores(criteria, []).ok).toBe(false);
    expect(
      validateScores(criteria, [
        { criterionId: "creativity", value: 1 },
        { criterionId: "creativity", value: 2 },
        { criterionId: "impact", value: 3 },
      ]).ok,
    ).toBe(false);
    expect(
      validateScores(criteria, [
        { criterionId: "creativity", value: 1 },
        { criterionId: "nope", value: 1 },
      ]).ok,
    ).toBe(false);
    expect(
      validateScores(criteria, [
        { criterionId: "creativity", value: 11 },
        { criterionId: "impact", value: 1 },
      ]).ok,
    ).toBe(false);
  });
});

describe("weightedTotal", () => {
  it("is the weighted mean", () => {
    expect(
      weightedTotal(criteria, [
        { criterionId: "creativity", value: 4 },
        { criterionId: "impact", value: 8 },
      ]),
    ).toBe(7);
  });

  it("is zero when every weight is zero", () => {
    const flat = criteria.map((criterion) => ({ ...criterion, weight: 0 }));
    expect(
      weightedTotal(flat, [
        { criterionId: "creativity", value: 4 },
        { criterionId: "impact", value: 8 },
      ]),
    ).toBe(0);
  });

  it("throws when the scores are not valid", () => {
    expect(() => weightedTotal(criteria, [])).toThrow(/missing/);
  });
});
