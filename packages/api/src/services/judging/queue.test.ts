import { describe, expect, it } from "vitest";
import { nextToGrade, queueOrder } from "./queue";
import type { GradingState } from "./grading-hold";

const CHALLENGE = "c0000000-0000-4000-8000-000000000001";
const entries = Array.from(
  { length: 30 },
  (_, i) => `e${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`,
);
const judges = Array.from(
  { length: 40 },
  (_, i) => `j${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`,
);

const open = (entryId: string) => ({ entryId, grading: "open" as const });
const state = (entryId: string, grading: GradingState) => ({
  entryId,
  grading,
});

describe("queueOrder", () => {
  it("is the same every time for a judge", () => {
    expect(queueOrder(judges[0], CHALLENGE, entries)).toEqual(
      queueOrder(judges[0], CHALLENGE, entries),
    );
  });

  it("does not depend on the order the projects arrive in", () => {
    expect(queueOrder(judges[0], CHALLENGE, [...entries].reverse())).toEqual(
      queueOrder(judges[0], CHALLENGE, entries),
    );
  });

  it("holds every project exactly once", () => {
    const order = queueOrder(judges[0], CHALLENGE, entries);
    expect(order).toHaveLength(entries.length);
    expect(new Set(order)).toEqual(new Set(entries));
  });

  it("gives a different judge a different order", () => {
    expect(queueOrder(judges[0], CHALLENGE, entries)).not.toEqual(
      queueOrder(judges[1], CHALLENGE, entries),
    );
  });

  it("gives the same judge a different order in another challenge", () => {
    expect(queueOrder(judges[0], CHALLENGE, entries)).not.toEqual(
      queueOrder(judges[0], "c0000000-0000-4000-8000-000000000002", entries),
    );
  });

  it("spreads the first pick across judges", () => {
    const firsts = new Map<string, number>();
    for (const judge of judges) {
      const [first] = queueOrder(judge, CHALLENGE, entries);
      firsts.set(first, (firsts.get(first) ?? 0) + 1);
    }
    // 40 judges over 30 projects: no one project is everyone's first.
    expect(firsts.size).toBeGreaterThanOrEqual(15);
    expect(Math.max(...firsts.values())).toBeLessThanOrEqual(6);
  });

  it("rarely sends two judges to the same project first", () => {
    const firsts = judges.map(
      (judge) => queueOrder(judge, CHALLENGE, entries)[0],
    );
    let pairs = 0;
    let collisions = 0;
    for (let a = 0; a < firsts.length; a++) {
      for (let b = a + 1; b < firsts.length; b++) {
        pairs += 1;
        if (firsts[a] === firsts[b]) collisions += 1;
      }
    }
    // One in 30 if the order is random.
    expect(collisions / pairs).toBeLessThan(0.1);
  });

  it("puts a project in no fixed place from one judge to the next", () => {
    const places = judges.map((judge) =>
      queueOrder(judge, CHALLENGE, entries).indexOf(entries[0]),
    );
    expect(new Set(places).size).toBeGreaterThanOrEqual(10);
  });

  it("is empty for no projects", () => {
    expect(queueOrder(judges[0], CHALLENGE, [])).toEqual([]);
  });
});

describe("nextToGrade", () => {
  it("is the judge's first project in their own order", () => {
    expect(nextToGrade(judges[0], CHALLENGE, entries.map(open))).toBe(
      queueOrder(judges[0], CHALLENGE, entries)[0],
    );
  });

  it("is the same on every call", () => {
    const candidates = entries.map(open);
    expect(nextToGrade(judges[3], CHALLENGE, candidates)).toBe(
      nextToGrade(judges[3], CHALLENGE, candidates),
    );
  });

  it("passes over projects that are not open", () => {
    const order = queueOrder(judges[0], CHALLENGE, entries);
    const candidates = entries.map((entryId) => {
      if (entryId === order[0]) return state(entryId, "graded");
      if (entryId === order[1]) return state(entryId, "in_progress");
      if (entryId === order[2]) return state(entryId, "mine");
      return open(entryId);
    });
    expect(nextToGrade(judges[0], CHALLENGE, candidates)).toBe(order[3]);
  });

  it("never returns a project that is not open", () => {
    const candidates = entries.map((entryId, i) =>
      state(entryId, (["graded", "in_progress", "mine"] as const)[i % 3]),
    );
    expect(nextToGrade(judges[0], CHALLENGE, candidates)).toBeNull();
  });

  it("is null when there is nothing to grade", () => {
    expect(nextToGrade(judges[0], CHALLENGE, [])).toBeNull();
  });

  it("only picks from the projects it is given", () => {
    const scope = entries.slice(0, 3);
    const picked = judges.map((judge) =>
      nextToGrade(judge, CHALLENGE, scope.map(open)),
    );
    for (const entryId of picked) expect(scope).toContain(entryId);
    expect(new Set(picked).size).toBeGreaterThan(1);
  });
});
