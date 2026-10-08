import { describe, expect, it } from "vitest";
import { diffPlacements } from "./results";

const quiet = { rubricComponent: 8, pairwiseComponent: 0 };

describe("diffPlacements", () => {
  it("reports a place move with both blend components", () => {
    const left = [
      { projectId: "a", trackId: "t", placement: 1, score: 9, ...quiet },
      { projectId: "b", trackId: "t", placement: 2, score: 8, ...quiet },
    ];
    const right = [
      { projectId: "a", trackId: "t", placement: 2, score: 7, rubricComponent: 7, pairwiseComponent: 1 },
      { projectId: "b", trackId: "t", placement: 1, score: 9, ...quiet },
    ];
    expect(diffPlacements(left, right)).toEqual([
      {
        projectId: "a",
        trackId: "t",
        from: 1,
        to: 2,
        score: 7,
        rubricFrom: 8,
        rubricTo: 7,
        pairwiseFrom: 0,
        pairwiseTo: 1,
      },
      {
        projectId: "b",
        trackId: "t",
        from: 2,
        to: 1,
        score: 9,
        rubricFrom: 8,
        rubricTo: 8,
        pairwiseFrom: 0,
        pairwiseTo: 0,
      },
    ]);
  });

  it("reports a pairwise change when the place stays put", () => {
    const left = [{ projectId: "a", trackId: "t", placement: 1, score: 8, ...quiet }];
    const right = [
      { projectId: "a", trackId: "t", placement: 1, score: 8.4, rubricComponent: 8, pairwiseComponent: 2 },
    ];
    expect(diffPlacements(left, right)).toEqual([
      {
        projectId: "a",
        trackId: "t",
        from: 1,
        to: 1,
        score: 8.4,
        rubricFrom: 8,
        rubricTo: 8,
        pairwiseFrom: 0,
        pairwiseTo: 2,
      },
    ]);
  });
});
