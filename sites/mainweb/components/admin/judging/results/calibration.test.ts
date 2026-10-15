import { describe, expect, it } from "vitest";
import { describeJudge, judgeNumbers, signed } from "./calibration";

const judge = (over: Partial<Parameters<typeof describeJudge>[0]> = {}) => ({
  grades: 12,
  offset: 0,
  spread: 1,
  drift: 0,
  ...over,
});

describe("signed", () => {
  it("shows the direction of a number", () => {
    expect(signed(0.384)).toBe("+0.38");
    expect(signed(-0.451)).toBe("-0.45");
    expect(signed(0)).toBe("0.00");
  });
});

describe("describeJudge", () => {
  it("calls a judge in line when nothing stands out", () => {
    expect(describeJudge(judge())).toEqual(["In line with the other judges"]);
    expect(
      describeJudge(judge({ offset: 0.1, spread: 0.9, drift: -0.2 })),
    ).toEqual(["In line with the other judges"]);
  });

  it("says which way a judge's marks sit and by how much", () => {
    expect(describeJudge(judge({ offset: -0.4 }))).toEqual([
      "Stricter than average by 0.40",
    ]);
    expect(describeJudge(judge({ offset: 0.55 }))).toEqual([
      "More lenient than average by 0.55",
    ]);
  });

  it("says when scores are bunched or spread wide", () => {
    expect(describeJudge(judge({ spread: 0.6 }))).toEqual([
      "Scores bunched together",
    ]);
    expect(describeJudge(judge({ spread: 1.4 }))).toEqual([
      "Scores spread wider than average",
    ]);
  });

  it("says when a judge changed over the day", () => {
    expect(describeJudge(judge({ drift: -0.8 }))).toEqual([
      "Got harsher through the day",
    ]);
    expect(describeJudge(judge({ drift: 0.7 }))).toEqual([
      "Got more lenient through the day",
    ]);
  });

  it("does not read a habit into what chance alone gives a judge", () => {
    expect(
      describeJudge(judge({ grades: 30, offset: -0.15, drift: 0.45 })),
    ).toEqual(["In line with the other judges"]);
  });

  it("lists everything that applies", () => {
    expect(
      describeJudge(judge({ offset: -0.3, spread: 0.7, drift: -0.6 })),
    ).toEqual([
      "Stricter than average by 0.30",
      "Scores bunched together",
      "Got harsher through the day",
    ]);
  });

  it("does not read much into a judge with few grades", () => {
    expect(describeJudge(judge({ grades: 2, offset: -0.4 }))).toEqual([
      "Too few grades to adjust much",
    ]);
    expect(describeJudge(judge({ grades: 1 }))).toEqual([
      "Too few grades to adjust much",
    ]);
  });
});

describe("judgeNumbers", () => {
  it("prints the grades and the three numbers", () => {
    expect(
      judgeNumbers(judge({ offset: -0.38, spread: 0.72, drift: -0.45 })),
    ).toBe("12 grades · offset -0.38 · spread 0.72 · drift -0.45");
  });

  it("is singular for one grade", () => {
    expect(judgeNumbers(judge({ grades: 1 }))).toBe(
      "1 grade · offset 0.00 · spread 1.00 · drift 0.00",
    );
  });
});
