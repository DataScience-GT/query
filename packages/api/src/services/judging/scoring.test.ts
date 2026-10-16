import { describe, expect, it } from "vitest";
import {
  evaluationScore,
  hasEveryRating,
  meanOrNull,
  overallScore,
  rankByScore,
  scopedScore,
} from "./scoring";
import type { ScoredEvaluation } from "./scoring";

describe("meanOrNull", () => {
  it("is null for no values", () => {
    expect(meanOrNull([])).toBeNull();
  });

  it("is the arithmetic mean", () => {
    expect(meanOrNull([4])).toBe(4);
    expect(meanOrNull([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("hasEveryRating", () => {
  it("is whether the evaluation rated every rating item", () => {
    expect(hasEveryRating([5, 4, 3], 3)).toBe(true);
    expect(hasEveryRating([5, 4], 3)).toBe(false);
    expect(hasEveryRating([], 3)).toBe(false);
  });

  it("does not need to be told about written responses", () => {
    // Four rating items, however many responses the rubric also asks for.
    expect(hasEveryRating([1, 2, 3, 4], 4)).toBe(true);
  });

  it("has nothing to miss on a rubric with no rating items", () => {
    expect(hasEveryRating([], 0)).toBe(true);
  });
});

describe("evaluationScore", () => {
  it("is the mean of the ratings", () => {
    expect(evaluationScore([5, 4, 3])).toBe(4);
    expect(evaluationScore([1, 2])).toBe(1.5);
  });

  it("is null with no ratings", () => {
    expect(evaluationScore([])).toBeNull();
  });
});

const evals: ScoredEvaluation[] = [
  { challengeId: "general", ratingsComplete: true, ratings: [5, 5, 5] }, // 5
  { challengeId: "general", ratingsComplete: true, ratings: [3, 3, 3] }, // 3
  { challengeId: "general", ratingsComplete: false, ratings: [1, 1] }, // short of a rating: ignored
  { challengeId: "mongo", ratingsComplete: true, ratings: [4, 2] }, // 3
  { challengeId: "mongo", ratingsComplete: true, ratings: [] }, // no score
];

describe("scopedScore", () => {
  it("averages evaluations with every rating in that challenge only", () => {
    expect(scopedScore(evals, "general")).toEqual({ score: 4, count: 2 });
    expect(scopedScore(evals, "mongo")).toEqual({ score: 3, count: 1 });
  });

  it("is null with nothing to average", () => {
    expect(scopedScore(evals, "other")).toEqual({ score: null, count: 0 });
    expect(
      scopedScore(
        [{ challengeId: "general", ratingsComplete: false, ratings: [5] }],
        "general",
      ),
    ).toEqual({ score: null, count: 0 });
  });
});

describe("overallScore", () => {
  it("weighs every counted evaluation the same, across challenges", () => {
    // (5 + 3 + 3) / 3
    expect(overallScore(evals)).toEqual({ score: 11 / 3, count: 3 });
  });

  it("is null with no evaluations", () => {
    expect(overallScore([])).toEqual({ score: null, count: 0 });
  });
});

describe("which evaluations count", () => {
  const score = (over: Partial<ScoredEvaluation>) =>
    overallScore([{ challengeId: "general", ratings: [4, 2], ...over }]);

  it("counts one with every rating, though a written response is missing", () => {
    // An auto-submit at the hard end: not complete in the database, but all
    // its ratings are there.
    expect(score({ ratingsComplete: true, isComplete: false })).toEqual({
      score: 3,
      count: 1,
    });
  });

  it("leaves out one short of a rating, though it was submitted whole", () => {
    expect(score({ ratingsComplete: false, isComplete: true })).toEqual({
      score: null,
      count: 0,
    });
  });

  it("reads isComplete from a caller that gives no ratingsComplete", () => {
    expect(score({ isComplete: true })).toEqual({ score: 3, count: 1 });
    expect(score({ isComplete: false })).toEqual({ score: null, count: 0 });
  });

  it("counts nothing when told nothing", () => {
    expect(score({})).toEqual({ score: null, count: 0 });
  });
});

describe("an adjusted score", () => {
  const adjusted: ScoredEvaluation[] = [
    {
      challengeId: "general",
      ratingsComplete: true,
      ratings: [5, 5],
      adjustedScore: 4,
    },
    {
      challengeId: "general",
      ratingsComplete: true,
      ratings: [3, 3],
      adjustedScore: 3.5,
    },
    // No adjusted score: the mean of its ratings counts.
    { challengeId: "general", ratingsComplete: true, ratings: [2, 4] },
    // Short of a rating is still left out, adjusted or not.
    {
      challengeId: "general",
      ratingsComplete: false,
      ratings: [1],
      adjustedScore: 1,
    },
  ];

  it("counts in place of the mean of the ratings", () => {
    // (4 + 3.5 + 3) / 3
    expect(scopedScore(adjusted, "general")).toEqual({ score: 3.5, count: 3 });
    expect(overallScore(adjusted)).toEqual({ score: 3.5, count: 3 });
  });

  it("leaves evaluations without one on the raw mean", () => {
    const raw = adjusted.map(({ challengeId, ratingsComplete, ratings }) => ({
      challengeId,
      ratingsComplete,
      ratings,
    }));
    // (5 + 3 + 3) / 3
    expect(overallScore(raw)).toEqual({ score: 11 / 3, count: 3 });
  });
});

describe("rankByScore", () => {
  it("ranks highest first", () => {
    const ranked = rankByScore([
      { id: "a", score: 3 },
      { id: "b", score: 4.5 },
      { id: "c", score: 1 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
  });

  it("gives ties the same rank and skips the next", () => {
    const ranked = rankByScore([
      { id: "a", score: 4 },
      { id: "b", score: 5 },
      { id: "c", score: 4 },
      { id: "d", score: 2 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 2],
      ["d", 4],
    ]);
  });

  it("ties scores that round to the same hundredth", () => {
    const ranked = rankByScore([
      { id: "a", score: 10 / 3 },
      { id: "b", score: (3 + 3 + 4) / 3 + 1e-12 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("puts rows without a score last, sharing a rank", () => {
    const ranked = rankByScore([
      { id: "a", score: null },
      { id: "b", score: 2 },
      { id: "c", score: null },
      { id: "d", score: 3 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["d", 1],
      ["b", 2],
      ["a", 3],
      ["c", 3],
    ]);
  });

  it("keeps the other fields and does not touch the input", () => {
    const rows = [
      { id: "a", score: 1, title: "Alpha" },
      { id: "b", score: 2, title: "Beta" },
    ];
    const ranked = rankByScore(rows);
    expect(ranked[0]).toEqual({ id: "b", score: 2, title: "Beta", rank: 1 });
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rankByScore([])).toEqual([]);
  });
});
