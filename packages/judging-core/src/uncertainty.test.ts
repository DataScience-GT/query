import { describe, expect, it } from "vitest";
import {
  contestBonus,
  projectUncertainty,
  scoreUncertainty,
} from "./uncertainty";

describe("scoreUncertainty", () => {
  it("is infinite when nobody has scored the project", () => {
    expect(scoreUncertainty([])).toBe(Number.POSITIVE_INFINITY);
  });

  it("is zero when every score agrees", () => {
    expect(scoreUncertainty([5, 5, 5])).toBe(0);
  });

  it("shrinks as the same spread is seen more times", () => {
    const small = scoreUncertainty([0, 10]);
    const large = scoreUncertainty([0, 10, 0, 10]);
    expect(large).toBeLessThan(small);
  });
});

describe("contestBonus", () => {
  it("is zero when one project always wins", () => {
    expect(
      contestBonus(
        [
          { a: "a", b: "b", outcome: "a" },
          { a: "a", b: "b", outcome: "a" },
        ],
        "a",
      ),
    ).toBe(0);
  });

  it("is one when the two projects split", () => {
    expect(
      contestBonus(
        [
          { a: "a", b: "b", outcome: "a" },
          { a: "a", b: "b", outcome: "b" },
        ],
        "a",
      ),
    ).toBe(1);
  });

  it("counts a tie as contested", () => {
    expect(contestBonus([{ a: "a", b: "b", outcome: "tie" }], "a")).toBe(1);
  });
});

describe("projectUncertainty", () => {
  it("adds the contest bonus on top of the score spread", () => {
    const scores = [0, 10];
    const bonus = contestBonus([{ a: "a", b: "b", outcome: "tie" }], "a");
    expect(
      projectUncertainty(scores, [{ a: "a", b: "b", outcome: "tie" }], "a"),
    ).toBeCloseTo(scoreUncertainty(scores) + bonus, 10);
  });

  it("stays infinite when there are no scores yet", () => {
    expect(projectUncertainty([], [], "a")).toBe(Number.POSITIVE_INFINITY);
  });
});
