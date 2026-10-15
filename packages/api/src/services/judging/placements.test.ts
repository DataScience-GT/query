import { describe, expect, it } from "vitest";
import { computePlacements, formatScore } from "./placements";
import type { PlacementEvaluation } from "./placements";

const evaluation = (
  entryId: string,
  challengeId: string,
  ratings: number[],
  isComplete = true,
): PlacementEvaluation => ({ entryId, challengeId, ratings, isComplete });

const challenges = [
  { id: "general", label: "General" },
  { id: "sponsor", label: "Sponsor Prize" },
];

describe("computePlacements", () => {
  it("ranks overall and per challenge, ties sharing a placing", () => {
    const placements = computePlacements({
      entryIds: ["a", "b", "c"],
      memberships: [
        { entryId: "a", challengeId: "general" },
        { entryId: "b", challengeId: "general" },
        { entryId: "c", challengeId: "general" },
        { entryId: "b", challengeId: "sponsor" },
        { entryId: "c", challengeId: "sponsor" },
      ],
      challenges,
      evaluations: [
        evaluation("a", "general", [4, 4]),
        evaluation("b", "general", [5, 3]),
        evaluation("c", "general", [3, 3]),
        evaluation("b", "sponsor", [2, 2]),
        evaluation("c", "sponsor", [5, 5]),
      ],
    });

    const scope = (name: string) =>
      placements
        .filter((p) => p.scope === name)
        .map(({ entryId, placement, score, evaluationCount }) => ({
          entryId,
          placement,
          score,
          evaluationCount,
        }));

    // Overall: a 4, b mean(4, 2) = 3, c mean(3, 5) = 4.
    expect(scope("overall")).toEqual([
      { entryId: "a", placement: 1, score: 4, evaluationCount: 1 },
      { entryId: "c", placement: 1, score: 4, evaluationCount: 2 },
      { entryId: "b", placement: 3, score: 3, evaluationCount: 2 },
    ]);
    expect(scope("general")).toEqual([
      { entryId: "a", placement: 1, score: 4, evaluationCount: 1 },
      { entryId: "b", placement: 1, score: 4, evaluationCount: 1 },
      { entryId: "c", placement: 3, score: 3, evaluationCount: 1 },
    ]);
    expect(scope("sponsor")).toEqual([
      { entryId: "c", placement: 1, score: 5, evaluationCount: 1 },
      { entryId: "b", placement: 2, score: 2, evaluationCount: 1 },
    ]);
    expect(placements.find((p) => p.scope === "sponsor")?.scopeLabel).toBe(
      "Sponsor Prize",
    );
    expect(placements.find((p) => p.scope === "overall")?.scopeLabel).toBe(
      "Overall",
    );
  });

  it("counts complete evaluations only and leaves unscored projects out", () => {
    const placements = computePlacements({
      entryIds: ["a", "b"],
      memberships: [
        { entryId: "a", challengeId: "general" },
        { entryId: "b", challengeId: "general" },
      ],
      challenges,
      evaluations: [
        evaluation("a", "general", [5]),
        evaluation("a", "general", [1], false),
        evaluation("b", "general", [2], false),
      ],
    });
    expect(placements.map((p) => [p.scope, p.entryId, p.score])).toEqual([
      ["overall", "a", 5],
      ["general", "a", 5],
    ]);
  });

  it("ignores pulled projects and challenges a project is not in", () => {
    const placements = computePlacements({
      entryIds: ["a"],
      memberships: [{ entryId: "a", challengeId: "general" }],
      challenges,
      evaluations: [
        evaluation("a", "general", [3]),
        // Scored for a challenge it was since removed from.
        evaluation("a", "sponsor", [5]),
        // A project no longer in judging.
        evaluation("gone", "general", [5]),
      ],
    });
    expect(placements.map((p) => [p.scope, p.entryId, p.score])).toEqual([
      ["overall", "a", 4],
      ["general", "a", 3],
    ]);
  });

  it("returns nothing before anyone is scored", () => {
    expect(
      computePlacements({
        entryIds: ["a"],
        memberships: [{ entryId: "a", challengeId: "general" }],
        challenges,
        evaluations: [],
      }),
    ).toEqual([]);
  });
});

describe("formatScore", () => {
  it("writes two decimal places for numeric(4,2)", () => {
    expect(formatScore(4)).toBe("4.00");
    expect(formatScore(10 / 3)).toBe("3.33");
  });
});
