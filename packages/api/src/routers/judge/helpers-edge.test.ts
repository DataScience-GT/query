import { describe, it, expect } from "vitest";
import { shuffleArray, zNormalize, buildCoverageQueues } from "./helpers";

/**
 * The maths and the assignment that decide who wins.
 *
 * These are the invariants a result has to satisfy to be defensible: a judge's
 * own ordering must survive normalization, two judges who rank the same order
 * must agree after it whatever their personal harshness, and no judge may be
 * handed the same project twice.
 */

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stddev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

describe("zNormalize — properties", () => {
  it("preserves a judge's own ordering", () => {
    const normalized = zNormalize([1, 4, 9, 10], 5, 2);

    for (let i = 1; i < normalized.length; i++) {
      expect(normalized[i]!).toBeGreaterThan(normalized[i - 1]!);
    }
  });

  /**
   * The entire point of normalizing: a harsh judge and a lenient one who put
   * the same projects in the same order must produce the same numbers, so
   * neither one's temperament decides the result.
   */
  it("makes a harsh judge and a lenient judge agree", () => {
    const harsh = zNormalize([1, 2, 3], 5, 2);
    const lenient = zNormalize([8, 9, 10], 5, 2);

    expect(harsh[0]).toBeCloseTo(lenient[0]!, 10);
    expect(harsh[1]).toBeCloseTo(lenient[1]!, 10);
    expect(harsh[2]).toBeCloseTo(lenient[2]!, 10);
  });

  it("makes a wide-spread judge and a narrow-spread judge agree on ordering", () => {
    const wide = zNormalize([0, 5, 10], 5, 2);
    const narrow = zNormalize([4, 5, 6], 5, 2);

    expect(wide[0]).toBeCloseTo(narrow[0]!, 10);
    expect(wide[2]).toBeCloseTo(narrow[2]!, 10);
  });

  it("centres the normalized scores on the global mean", () => {
    expect(mean(zNormalize([1, 4, 9, 10], 7, 2))).toBeCloseTo(7, 10);
  });

  it("gives the normalized scores the global spread", () => {
    expect(stddev(zNormalize([1, 4, 9, 10], 5, 3))).toBeCloseTo(3, 10);
  });

  it("returns the global mean when a judge scored everything the same", () => {
    expect(zNormalize([7, 7, 7], 5, 2)).toEqual([5, 5, 5]);
  });

  it("returns the global mean for a judge with a single score", () => {
    expect(zNormalize([9], 5, 2)).toEqual([5]);
  });

  it("returns nothing for a judge with no scores", () => {
    expect(zNormalize([], 5, 2)).toEqual([]);
  });

  it("never produces NaN or Infinity for degenerate input", () => {
    const cases = [
      zNormalize([7, 7], 5, 2),
      zNormalize([0, 0, 0], 5, 2),
      zNormalize([5], 5, 0),
      zNormalize([1, 2], 0, 0),
    ];

    for (const result of cases) {
      for (const value of result) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("handles negative and zero scores", () => {
    const normalized = zNormalize([-5, 0, 5], 5, 2);
    expect(normalized.every((v) => Number.isFinite(v))).toBe(true);
    expect(normalized[0]!).toBeLessThan(normalized[2]!);
  });

  it("collapses to the global mean when the global spread is zero", () => {
    expect(zNormalize([1, 5, 9], 6, 0)).toEqual([6, 6, 6]);
  });

  it("keeps two equal scores equal after normalizing", () => {
    const normalized = zNormalize([3, 3, 9], 5, 2);
    expect(normalized[0]).toBeCloseTo(normalized[1]!, 10);
  });
});

describe("shuffleArray — invariants", () => {
  it("returns the same multiset", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const output = shuffleArray(input);
    expect([...output].sort()).toEqual([...input].sort());
  });

  it("does not mutate its input", () => {
    const input = [1, 2, 3];
    shuffleArray(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it("handles an empty array", () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it("handles a single element", () => {
    expect(shuffleArray(["only"])).toEqual(["only"]);
  });

  it("keeps duplicates rather than deduping", () => {
    expect(shuffleArray([1, 1, 2]).sort()).toEqual([1, 1, 2]);
  });

  it("eventually produces a different order for a large array", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const orders = new Set(
      Array.from({ length: 10 }, () => shuffleArray(input).join(",")),
    );
    // A CSPRNG shuffle of 30 items repeating 10 times is effectively
    // impossible; a stuck shuffle would show up here.
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("buildCoverageQueues — invariants", () => {
  const mainTracks = new Set(["AI", "Web"]);
  const project = (id: string, track: string) => ({
    id,
    tracks: [track],
    challenges: null,
    tableNumber: Number(id.slice(1)),
  });

  const projects = [
    project("p1", "AI"),
    project("p2", "AI"),
    project("p3", "Web"),
    project("p4", "Web"),
  ];

  const opts = {
    minProjects: 2,
    maxProjects: 4,
    shuffle: false,
    groupSpecial: true,
  };

  it("never hands one judge the same project twice", () => {
    const judges = [
      { judgeId: "j1", track: null },
      { judgeId: "j2", track: null },
      { judgeId: "j3", track: "AI" },
    ];

    const queues = buildCoverageQueues(judges, projects, mainTracks, opts);

    for (const [judgeId, queue] of queues) {
      expect(new Set(queue).size, `duplicate in ${judgeId}'s queue`).toBe(
        queue.length,
      );
    }
  });

  it("covers every project at least once when there is capacity", () => {
    const judges = [
      { judgeId: "j1", track: null },
      { judgeId: "j2", track: null },
    ];

    const queues = buildCoverageQueues(judges, projects, mainTracks, opts);

    const covered = new Set([...queues.values()].flat());
    for (const p of projects) expect(covered.has(p.id)).toBe(true);
  });

  it("respects maxProjects for every judge", () => {
    const judges = [
      { judgeId: "j1", track: null },
      { judgeId: "j2", track: null },
    ];

    const queues = buildCoverageQueues(judges, projects, mainTracks, {
      ...opts,
      maxProjects: 2,
    });

    for (const queue of queues.values()) {
      expect(queue.length).toBeLessThanOrEqual(2);
    }
  });

  it("gives every judge a queue entry even when nothing matches", () => {
    const judges = [{ judgeId: "j-ghost", track: "Robotics" }];

    const queues = buildCoverageQueues(judges, projects, mainTracks, opts);

    expect(queues.has("j-ghost")).toBe(true);
    expect(queues.get("j-ghost")).toEqual([]);
  });

  it("returns an empty map for no judges", () => {
    expect(buildCoverageQueues([], projects, mainTracks, opts).size).toBe(0);
  });

  it("gives empty queues when there are no projects", () => {
    const judges = [{ judgeId: "j1", track: null }];

    const queues = buildCoverageQueues(judges, [], mainTracks, opts);

    expect(queues.get("j1")).toEqual([]);
  });

  it("restricts a track judge to that track's projects", () => {
    const judges = [{ judgeId: "j-ai", track: "AI" }];

    const queues = buildCoverageQueues(judges, projects, mainTracks, opts);

    for (const id of queues.get("j-ai")!) {
      expect(["p1", "p2"]).toContain(id);
    }
  });

  /** A track outside mainTracks is a special award: that judge sees everything
   *  eligible, not a coverage-balanced slice. */
  it("gives a special-track judge their whole eligible pool", () => {
    const withSpecial = [
      ...projects,
      {
        id: "p5",
        tracks: ["Sustainability"],
        challenges: null,
        tableNumber: 5,
      },
    ];
    const judges = [{ judgeId: "j-special", track: "Sustainability" }];

    const queues = buildCoverageQueues(judges, withSpecial, mainTracks, opts);

    expect(queues.get("j-special")).toEqual(["p5"]);
  });

  it("matches a project by its challenges as well as its tracks", () => {
    const challengeProject = {
      id: "p6",
      tracks: [],
      challenges: ["Sustainability"],
      tableNumber: 6,
    };
    const judges = [{ judgeId: "j-special", track: "Sustainability" }];

    const queues = buildCoverageQueues(
      judges,
      [challengeProject],
      mainTracks,
      opts,
    );

    expect(queues.get("j-special")).toEqual(["p6"]);
  });

  it("only assigns ids that exist in the project list", () => {
    const judges = [
      { judgeId: "j1", track: null },
      { judgeId: "j2", track: "Web" },
    ];
    const ids = new Set(projects.map((p) => p.id));

    const queues = buildCoverageQueues(judges, projects, mainTracks, opts);

    for (const queue of queues.values()) {
      for (const id of queue) expect(ids.has(id)).toBe(true);
    }
  });

  it("spreads a second pass evenly rather than piling onto one project", () => {
    // Four judges, four projects, room for everyone to see everything.
    const judges = [
      { judgeId: "j1", track: null },
      { judgeId: "j2", track: null },
      { judgeId: "j3", track: null },
      { judgeId: "j4", track: null },
    ];

    const queues = buildCoverageQueues(judges, projects, mainTracks, {
      ...opts,
      minProjects: 4,
      maxProjects: 4,
    });

    const counts = new Map<string, number>();
    for (const queue of queues.values()) {
      for (const id of queue) counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const seen = [...counts.values()];
    expect(Math.max(...seen) - Math.min(...seen)).toBeLessThanOrEqual(1);
  });
});
