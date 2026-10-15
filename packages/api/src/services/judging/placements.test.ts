import { beforeEach, describe, expect, it, vi } from "vitest";
import { calibrate } from "./calibration";
import type * as CalibrationModule from "./calibration";
import { computePlacements, formatScore } from "./placements";
import type { PlacementEvaluation } from "./placements";

// The real calibrate, but spied on so a test can swap it out. The first group
// below is about ranking, scopes and ties, so it runs on scores that are left
// as the raw means; the second runs the real thing.
vi.mock("./calibration", async (importOriginal) => {
  const actual = await importOriginal<typeof CalibrationModule>();
  return { ...actual, calibrate: vi.fn(actual.calibrate) };
});
const actualCalibrate = async () =>
  (await vi.importActual<typeof CalibrationModule>("./calibration")).calibrate;

const leaveAsRaw: typeof calibrate = (evaluations) => ({
  adjusted: new Map(
    evaluations
      .filter((e) => e.isComplete && e.ratings.length > 0)
      .map((e) => [
        e.id,
        e.ratings.reduce((sum, value) => sum + value, 0) / e.ratings.length,
      ]),
  ),
  judges: [],
});

let count = 0;
const evaluation = (
  entryId: string,
  challengeId: string,
  ratings: number[],
  isComplete = true,
  over: Partial<PlacementEvaluation> = {},
): PlacementEvaluation => {
  count += 1;
  return {
    id: `evaluation-${count}`,
    judgeId: "judge",
    submittedAt: new Date(Date.UTC(2027, 1, 6, 10, 0, count)),
    entryId,
    challengeId,
    ratings,
    isComplete,
    ...over,
  };
};

const challenges = [
  { id: "general", label: "General" },
  { id: "sponsor", label: "Sponsor Prize" },
];

describe("computePlacements", () => {
  beforeEach(() => {
    count = 0;
    vi.mocked(calibrate).mockReset();
    vi.mocked(calibrate).mockImplementation(leaveAsRaw);
  });

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

describe("computePlacements with judge calibration", () => {
  beforeEach(async () => {
    count = 0;
    vi.mocked(calibrate).mockReset();
    vi.mocked(calibrate).mockImplementation(await actualCalibrate());
  });

  // A strict judge and a lenient one each graded six projects, dealt out at
  // random, so the two sets are alike in quality and the lenient judge's higher
  // marks are the judge's, not the projects'.
  const strictScores = [3.0, 3.2, 3.4, 3.6, 3.8, 4.0];
  const lenientScores = [3.8, 4.0, 4.2, 4.4, 4.6, 4.8];
  // Marked in a scrambled order, so neither judge looks to be drifting.
  const gradingOrder = [2, 5, 0, 4, 1, 3];
  const twoJudges = () => {
    const graded = (prefix: string, judgeId: string, scores: number[]) =>
      gradingOrder.map((i) =>
        evaluation(`${prefix}${i + 1}`, "general", [scores[i]!], true, {
          judgeId,
        }),
      );
    const evaluations = [
      ...graded("s", "strict", strictScores),
      ...graded("l", "lenient", lenientScores),
    ];
    const entryIds = evaluations.map((e) => e.entryId);
    return computePlacements({
      entryIds,
      memberships: entryIds.map((entryId) => ({
        entryId,
        challengeId: "general",
      })),
      challenges,
      evaluations,
    });
  };

  it("ranks on the calibrated score, so a strict judge's best is not buried", () => {
    const overall = new Map(
      twoJudges()
        .filter((p) => p.scope === "overall")
        .map((p) => [p.entryId, p]),
    );
    const place = (entryId: string) => overall.get(entryId)!.placement;
    const raw = (entryId: string) => overall.get(entryId)!.rawScore;

    // On raw marks the strict judge's best (4.0) is below the lenient judge's
    // third best (4.4).
    expect(raw("s6")).toBeLessThan(raw("l4"));
    // Calibrated, each of the strict judge's projects beats the lenient
    // judge's project whose raw mark is 0.4 above it.
    expect(place("s6")).toBeLessThan(place("l4"));
    expect(place("s5")).toBeLessThan(place("l3"));
    expect(place("s4")).toBeLessThan(place("l2"));
    expect(place("s3")).toBeLessThan(place("l1"));
    // Within a judge, the order is the judge's own.
    expect(place("l6")).toBeLessThan(place("l5"));
    expect(place("s2")).toBeLessThan(place("s1"));
  });

  it("keeps the plain mean beside the calibrated score", () => {
    const placements = twoJudges();
    const byEntry = new Map(
      placements
        .filter((p) => p.scope === "overall")
        .map((p) => [p.entryId, p]),
    );
    expect(byEntry.get("s6")?.rawScore).toBeCloseTo(4.0, 10);
    expect(byEntry.get("l1")?.rawScore).toBeCloseTo(3.8, 10);
    // The strict judge's score moves up, the lenient judge's down.
    expect(byEntry.get("s6")!.score).toBeGreaterThan(4.0);
    expect(byEntry.get("l6")!.score).toBeLessThan(4.8);
  });

  it("scores a project the same in a challenge as overall when it has one evaluation", () => {
    const placements = twoJudges();
    const pick = (scope: string, entryId: string) =>
      placements.find((p) => p.scope === scope && p.entryId === entryId);
    expect(pick("general", "s3")?.score).toBe(pick("overall", "s3")?.score);
    expect(pick("general", "s3")?.rawScore).toBe(
      pick("overall", "s3")?.rawScore,
    );
  });

  it("calibrates once, over the live entries' complete evaluations only", () => {
    const evaluations = [
      evaluation("a", "general", [4], true, { judgeId: "one" }),
      evaluation("b", "sponsor", [3], true, { judgeId: "two" }),
      evaluation("a", "general", [2], false, { judgeId: "one" }),
      // Pulled from prizes: judges scored it, it must not shift anyone else.
      evaluation("pulled", "general", [5], true, { judgeId: "two" }),
    ];
    computePlacements({
      entryIds: ["a", "b"],
      memberships: [
        { entryId: "a", challengeId: "general" },
        { entryId: "b", challengeId: "sponsor" },
      ],
      challenges,
      evaluations,
    });

    expect(calibrate).toHaveBeenCalledTimes(1);
    const given = vi.mocked(calibrate).mock.calls[0]![0];
    expect(given.map((e) => e.entryId).sort()).toEqual(["a", "a", "b"]);
  });

  it("does not let a pulled project's grades move anyone else's score", () => {
    const base = [
      evaluation("a", "general", [4], true, { judgeId: "one" }),
      evaluation("b", "general", [3], true, { judgeId: "one" }),
      evaluation("c", "general", [3.5], true, { judgeId: "two" }),
    ];
    const run = (extra: PlacementEvaluation[]) =>
      computePlacements({
        entryIds: ["a", "b", "c"],
        memberships: ["a", "b", "c"].map((entryId) => ({
          entryId,
          challengeId: "general",
        })),
        challenges,
        evaluations: [...base, ...extra],
      }).map((p) => [p.scope, p.entryId, p.score]);

    expect(
      run([evaluation("pulled", "general", [5], true, { judgeId: "two" })]),
    ).toEqual(run([]));
  });

  it("does not compare a sponsor's judges with the table judges", () => {
    // The sponsor's two guests both mark high; that must not drag the tables.
    const tables = [
      evaluation("a", "general", [3], true, { judgeId: "t1" }),
      evaluation("b", "general", [4], true, { judgeId: "t2" }),
    ];
    const sponsor = [
      evaluation("c", "sponsor", [5], true, { judgeId: "g1" }),
      evaluation("d", "sponsor", [5], true, { judgeId: "g2" }),
    ];
    const input = {
      entryIds: ["a", "b", "c", "d"],
      memberships: [
        { entryId: "a", challengeId: "general" },
        { entryId: "b", challengeId: "general" },
        { entryId: "c", challengeId: "sponsor" },
        { entryId: "d", challengeId: "sponsor" },
      ],
      challenges,
    };
    const general = (evaluations: PlacementEvaluation[]) =>
      computePlacements({ ...input, evaluations })
        .filter((p) => p.scope === "general")
        .map((p) => [p.entryId, p.score]);

    expect(general([...tables, ...sponsor])).toEqual(general(tables));
  });
});

describe("formatScore", () => {
  it("writes two decimal places for numeric(4,2)", () => {
    expect(formatScore(4)).toBe("4.00");
    expect(formatScore(10 / 3)).toBe("3.33");
  });
});
