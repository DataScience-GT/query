import { describe, expect, it } from "vitest";
import { aamoghCPSolver } from "./aamogh-cp-solver";
import { cpsatProblem, readCpsatSolution } from "./cpsat-bridge";
import type { PlanInputs } from "./inputs";

const inputs: PlanInputs = {
  rooms: [
    { id: "g1", challengeId: "general", buildingId: "ENG" },
    { id: "g2", challengeId: "general", buildingId: "HEC" },
    { id: "s1", challengeId: "sp1", buildingId: "HEC" },
  ],
  tasks: [
    { entryId: "a", challengeId: "general", sponsor: false },
    { entryId: "a", challengeId: "sp1", sponsor: true },
    { entryId: "b", challengeId: "general", sponsor: false },
    { entryId: "b", challengeId: "sp1", sponsor: true },
    { entryId: "c", challengeId: "general", sponsor: false },
  ],
  slots: 4,
  sameGap: 1,
  crossGap: 2,
};

// What `uv run cpsat.py problem.json --workers 1` wrote for cpsatProblem(inputs,
// "fp-test"), verbatim apart from the timing.
const solution = {
  format: "query-judging-schedule-solution",
  version: 1,
  fingerprint: "fp-test",
  status: "optimal",
  relaxed: false,
  objective: { sponsorFinish: 2, sponsorIdle: 0, finish: 4, buildingChanges: 0, breakSlots: 2 },
  placements: [
    { entryId: "a", challengeId: "general", roomId: "g2", slot: 2 },
    { entryId: "a", challengeId: "sp1", roomId: "s1", slot: 0 },
    { entryId: "b", challengeId: "general", roomId: "g2", slot: 3 },
    { entryId: "b", challengeId: "sp1", roomId: "s1", slot: 1 },
    { entryId: "c", challengeId: "general", roomId: "g2", slot: 0 },
  ],
  reasons: [],
  solver: { name: "cp-sat", ortools: "9.15.6755", seconds: 0 },
};

const read = (value: unknown, fingerprint = "fp-test") =>
  readCpsatSolution(inputs, fingerprint, JSON.stringify(value));

describe("cpsatProblem", () => {
  it("writes the file cpsat.py reads, rooms marked by their challenge", () => {
    const problem = cpsatProblem(inputs, "fp-test");
    expect(problem).toMatchObject({
      format: "query-judging-schedule-problem",
      version: 1,
      fingerprint: "fp-test",
      slotCount: 4,
      sameGap: 1,
      crossGap: 2,
    });
    expect(problem.rooms.map((r) => r.sponsor)).toEqual([false, false, true]);
    expect(problem.tasks).toHaveLength(5);
    expect("hint" in problem).toBe(false);
  });

  it("passes a starting schedule along as the hint", () => {
    const problem = cpsatProblem(inputs, "fp-test", solution.placements);
    expect(problem.hint).toEqual(solution.placements);
  });
});

describe("readCpsatSolution", () => {
  it("accepts what the script wrote and scores it by the portal's rules", () => {
    const result = read(solution);
    expect(result).toMatchObject({
      ok: true,
      status: "optimal",
      relaxed: false,
      score: [2, 0, 4, 0, -2],
    });
  });

  it("agrees with aamoghCPSolver on the optimum", () => {
    const ours = aamoghCPSolver(inputs);
    const theirs = read(solution);
    if (!ours.ok || !theirs.ok) throw new Error("both should solve this");
    expect(ours.score).toEqual(theirs.score);
  });

  it("refuses a solution to a problem that has since changed", () => {
    expect(read(solution, "fp-now")).toMatchObject({ ok: false });
  });

  it("refuses files that are not a solution", () => {
    expect(readCpsatSolution(inputs, "fp-test", "not json")).toMatchObject({ ok: false });
    expect(read({ hello: "world" })).toMatchObject({ ok: false });
  });

  it("explains a proof of infeasibility and a timeout", () => {
    const infeasible = read({ ...solution, status: "infeasible", placements: [], reasons: ["sp1: 3 presentations but only 2 room slots"] });
    expect(infeasible.ok).toBe(false);
    if (!infeasible.ok) expect(infeasible.reason).toContain("sp1: 3 presentations");
    const unknown = read({ ...solution, status: "unknown", placements: [] });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toContain("--time-limit");
  });

  it("re-checks the rules instead of trusting the file", () => {
    const doubleBooked = {
      ...solution,
      placements: solution.placements.map((p) =>
        p.entryId === "c" ? { ...p, slot: 2 } : p,
      ),
    };
    const result = read(doubleBooked);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("double-booked");
  });

  it("flags a schedule that only works with shortened breaks", () => {
    // a walks from HEC at slot 0 to ENG at slot 2: one empty slot, needs two.
    const shortened = {
      ...solution,
      placements: solution.placements.map((p) =>
        p.entryId === "a" && p.challengeId === "general" ? { ...p, roomId: "g1" } : p,
      ),
    };
    const result = read(shortened);
    expect(result).toMatchObject({ ok: true, relaxed: true });
    if (result.ok) expect(result.reducedBreaks).toHaveLength(1);
  });
});
