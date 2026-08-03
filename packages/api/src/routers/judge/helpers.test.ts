import { describe, it, expect } from "vitest";
import {
  shuffleArray,
  zNormalize,
  buildCoverageQueues,
} from "./helpers";

describe("shuffleArray", () => {
  it("preserves length and elements", () => {
    const input = [1, 2, 3, 4, 5];
    const output = shuffleArray(input);
    expect(output).toHaveLength(input.length);
    expect(output.sort()).toEqual(input.sort());
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("zNormalize", () => {
  it("returns global mean when fewer than two scores", () => {
    expect(zNormalize([8], 5, 2)).toEqual([5]);
    expect(zNormalize([], 5, 2)).toEqual([]);
  });

  it("returns global mean when judge gave identical scores", () => {
    expect(zNormalize([7, 7, 7], 5, 2)).toEqual([5, 5, 5]);
  });

  it("spreads scores around the global mean", () => {
    const normalized = zNormalize([2, 5, 8], 5, 2);
    expect(normalized[0]).toBeLessThan(5);
    expect(normalized[1]).toBeCloseTo(5, 1);
    expect(normalized[2]).toBeGreaterThan(5);
  });
});

describe("buildCoverageQueues", () => {
  const projects = [
    { id: "p1", tracks: ["AI"], challenges: null, tableNumber: 1 },
    { id: "p2", tracks: ["AI"], challenges: null, tableNumber: 2 },
    { id: "p3", tracks: ["Web"], challenges: null, tableNumber: 3 },
  ];

  it("assigns every project before doubling coverage", () => {
    const judges = [
      { judgeId: "j1", track: "AI" },
      { judgeId: "j2", track: "AI" },
    ];
    const queues = buildCoverageQueues(judges, projects, new Set(["AI", "Web"]), {
      minProjects: 1,
      maxProjects: 3,
      shuffle: false,
      groupSpecial: true,
    });

    const assigned = new Set<string>();
    for (const q of queues.values()) q.forEach((id) => assigned.add(id));
    expect(assigned.has("p1")).toBe(true);
    expect(assigned.has("p2")).toBe(true);
  });

  it("respects maxProjects per judge", () => {
    const judges = [{ judgeId: "j1", track: null }];
    const queues = buildCoverageQueues(judges, projects, new Set(["AI", "Web"]), {
      minProjects: 1,
      maxProjects: 2,
      shuffle: false,
      groupSpecial: true,
    });
    expect(queues.get("j1")!.length).toBeLessThanOrEqual(2);
  });

  it("filters special-track judges to their track pool", () => {
    const judges = [{ judgeId: "j-web", track: "Web" }];
    const queues = buildCoverageQueues(judges, projects, new Set(["AI", "Web"]), {
      minProjects: 1,
      maxProjects: 5,
      shuffle: false,
      groupSpecial: true,
    });
    const queue = queues.get("j-web")!;
    expect(queue.every((id) => id === "p3")).toBe(true);
  });
});
