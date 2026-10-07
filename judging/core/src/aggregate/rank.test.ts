import { describe, expect, it } from "vitest";
import { zNormalize } from "./zscore";
import { bayesianShrink, round2 } from "./bayes";
import { rank } from "./rank";
import type { ProjectInput, RankConfig, VoteInput } from "./rank";

/**
 * The ranking the current event publishes: z-score per judge against the
 * population mean and spread, round the project mean, shrink toward the mean
 * of those means with c = 2, round again. Same raw score maps to one
 * normalised value because the z-score is linear, so a value-keyed lookup
 * and an index-aligned one agree.
 */
function legacyRank(
  projects: readonly { id: string }[],
  votes: readonly { judgeId: string; projectId: string; score: number }[],
) {
  const byJudge = new Map<string, number[]>();
  for (const vote of votes) {
    const list = byJudge.get(vote.judgeId) ?? [];
    list.push(vote.score);
    byJudge.set(vote.judgeId, list);
  }
  const raw = [...byJudge.values()].flat();
  const globalMean = raw.length > 0 ? raw.reduce((a, b) => a + b, 0) / raw.length : 0;
  const globalVariance =
    raw.length > 0
      ? raw.reduce((sum, value) => sum + (value - globalMean) ** 2, 0) / raw.length
      : 1;
  const globalStd = Math.sqrt(globalVariance) || 1;

  const normalizedByJudge = new Map<string, Map<number, number>>();
  for (const [judgeId, scores] of byJudge) {
    const normalized = zNormalize(scores, globalMean, globalStd);
    const lookup = new Map<number, number>();
    scores.forEach((score, index) => {
      const existing = lookup.get(score);
      const value = normalized[index] ?? globalMean;
      lookup.set(score, existing !== undefined ? (existing + value) / 2 : value);
    });
    normalizedByJudge.set(judgeId, lookup);
  }

  const rows = projects.map((project) => {
    const mine = votes.filter((vote) => vote.projectId === project.id);
    const normalizedScores = mine.map(
      (vote) => normalizedByJudge.get(vote.judgeId)?.get(vote.score) ?? vote.score,
    );
    const normalizedAvg =
      mine.length > 0
        ? round2(normalizedScores.reduce((a, b) => a + b, 0) / mine.length)
        : 0;
    return { id: project.id, voteCount: mine.length, normalizedAvg };
  });

  const voted = rows.filter((row) => row.voteCount > 0);
  const globalAvg =
    voted.length > 0
      ? round2(voted.reduce((sum, row) => sum + row.normalizedAvg, 0) / voted.length)
      : 0;

  return rows
    .map((row) => ({
      id: row.id,
      voteCount: row.voteCount,
      score:
        row.voteCount > 0
          ? round2(bayesianShrink(row.normalizedAvg, row.voteCount, globalAvg, 2))
          : 0,
    }))
    .filter((row) => row.voteCount > 0)
    .sort((a, b) => b.score - a.score || projects.findIndex((p) => p.id === a.id) - projects.findIndex((p) => p.id === b.id));
}

const config: RankConfig = {
  bayesianC: 2,
  pairwiseWeight: 0,
  calibrationWeight: 1,
};

const projects: ProjectInput[] = [
  { id: "A", trackIds: ["overall"] },
  { id: "B", trackIds: ["overall"] },
  { id: "C", trackIds: ["overall"] },
];

function vote(judgeId: string, projectId: string, total: number): VoteInput {
  return { judgeId, projectId, judgeGroup: "main", total };
}

describe("rank matches the current event's pipeline at pairwise weight 0", () => {
  const votes = [
    vote("j1", "A", 8),
    vote("j1", "B", 5),
    vote("j1", "C", 2),
    vote("j2", "A", 9),
    vote("j2", "B", 9),
    vote("j2", "C", 6),
  ];

  it("places the same projects at the same hundredths", () => {
    const legacy = legacyRank(projects, votes.map((item) => ({
      judgeId: item.judgeId,
      projectId: item.projectId,
      score: item.total,
    })));
    const ranked = rank(projects, votes, [], config)
      .filter((row) => row.placement !== null)
      .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0));

    expect(ranked.map((row) => [row.projectId, row.score])).toEqual(
      legacy.map((row) => [row.id, row.score]),
    );
    expect(ranked.map((row) => row.score)).toEqual([7.71, 6.94, 4.85]);
  });

  it("ignores comparisons when the pairwise weight is zero", () => {
    const withPairs = rank(
      projects,
      votes,
      [
        {
          judgeId: "j1",
          judgeGroup: "main",
          a: "C",
          b: "A",
          outcome: "a",
        },
      ],
      config,
    );
    const without = rank(projects, votes, [], config);
    expect(withPairs.map((row) => row.score)).toEqual(without.map((row) => row.score));
  });
});

describe("rank", () => {
  it("does not place a project nobody scored", () => {
    const rows = rank(
      [
        { id: "seen", trackIds: ["overall"] },
        { id: "missed", trackIds: ["overall"] },
      ],
      [vote("j1", "seen", 8), vote("j2", "seen", 6)],
      [],
      config,
    );
    const seen = rows.find((row) => row.projectId === "seen");
    const missed = rows.find((row) => row.projectId === "missed");
    expect(seen?.placement).toBe(1);
    expect(missed?.placement).toBeNull();
  });

  it("keeps judge groups apart", () => {
    const rows = rank(
      [{ id: "A", trackIds: ["overall"] }],
      [
        { judgeId: "j1", projectId: "A", judgeGroup: "main", total: 10 },
        { judgeId: "j2", projectId: "A", judgeGroup: "sponsor", total: 1 },
      ],
      [],
      config,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.judgeGroup === "main")?.voteCount).toBe(1);
    expect(rows.find((row) => row.judgeGroup === "sponsor")?.voteCount).toBe(1);
  });

  it("drops a calibration vote whose weight is zero", () => {
    const base = rank(projects, [vote("j1", "A", 8), vote("j1", "B", 4)], [], config);
    const extra = rank(
      projects,
      [
        vote("j1", "A", 8),
        vote("j1", "B", 4),
        { ...vote("j1", "C", 1), isCalibration: true },
      ],
      [],
      { ...config, calibrationWeight: 0 },
    );
    const score = (rows: typeof base, id: string) =>
      rows.find((row) => row.projectId === id)?.score;
    expect(score(extra, "A")).toBe(score(base, "A"));
    expect(score(extra, "B")).toBe(score(base, "B"));
    expect(extra.find((row) => row.projectId === "C")?.voteCount).toBe(0);
  });

  it("orders a pairwise-only field by who won, at weight 1", () => {
    const rows = rank(
      projects,
      [],
      [
        { judgeId: "j1", judgeGroup: "main", a: "A", b: "B", outcome: "a" },
        { judgeId: "j1", judgeGroup: "main", a: "B", b: "C", outcome: "a" },
        { judgeId: "j1", judgeGroup: "main", a: "A", b: "C", outcome: "a" },
      ],
      { ...config, pairwiseWeight: 1 },
    );
    const placed = rows
      .filter((row) => row.placement !== null)
      .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0));
    expect(placed.map((row) => row.projectId)).toEqual(["A", "B", "C"]);
  });
});
