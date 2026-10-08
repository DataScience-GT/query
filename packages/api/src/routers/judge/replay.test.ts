import { describe, expect, it } from "vitest";
import { rank } from "../../../../../judging/core/src/index";
import { weightProjects } from "./weight";

const projects = [
  {
    id: "A",
    votes: [
      { judgeId: "j1", score: 8 },
      { judgeId: "j2", score: 9 },
    ],
  },
  {
    id: "B",
    votes: [
      { judgeId: "j1", score: 5 },
      { judgeId: "j2", score: 9 },
    ],
  },
  {
    id: "C",
    votes: [
      { judgeId: "j1", score: 2 },
      { judgeId: "j2", score: 6 },
    ],
  },
];

describe("legacy rankings and panel rank", () => {
  it("places the published fixture the same way at pairwise weight 0", () => {
    const legacy = weightProjects(projects)
      .filter((row) => row.voteCount > 0)
      .sort((a, b) => b.weightedScore - a.weightedScore || a.id.localeCompare(b.id));
    const panel = rank(
      projects.map((project) => ({ id: project.id, trackIds: ["overall"] })),
      projects.flatMap((project) =>
        project.votes.map((vote) => ({
          judgeId: vote.judgeId,
          projectId: project.id,
          judgeGroup: "main",
          total: vote.score,
        })),
      ),
      [],
      { bayesianC: 2, pairwiseWeight: 0, calibrationWeight: 1 },
    )
      .filter((row) => row.placement !== null)
      .sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0));

    expect(panel.map((row) => [row.projectId, row.score])).toEqual(
      legacy.map((row) => [row.id, row.weightedScore]),
    );
    expect(panel.map((row) => row.score)).toEqual([7.71, 6.94, 4.85]);
  });
});
