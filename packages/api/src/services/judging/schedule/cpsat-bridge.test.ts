import { describe, expect, it } from "vitest";
import { aamoghCPSolver } from "./aamogh-cp-solver";
import {
  cpsatAssignmentProblem,
  cpsatProblem,
  readCpsatAssignments,
  readCpsatSolution,
} from "./cpsat-bridge";
import type { Placement, PlanInputs } from "./inputs";
import type { JudgeAssignment, JudgeInput } from "./judges";

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
    // A file without judges is still the version-1 file it always was.
    expect("judges" in problem).toBe(false);
    expect("assignmentHint" in problem).toBe(false);
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

  it("still reads a version-1 file written before judges", () => {
    expect(read(solution)).toMatchObject({
      ok: true,
      judging: { source: "in-app", assignments: [] },
    });
  });
});

const judges: JudgeInput[] = [
  { id: "m1", kind: "member", challengeIds: ["general", "sp1"], roomId: null },
  { id: "m2", kind: "member", challengeIds: ["general", "sp1"], roomId: null },
  { id: "gs", kind: "guest", challengeIds: ["sp1"], roomId: "s1" },
];

// What `uv run cpsat.py problem.json --workers 1` wrote for cpsatProblem(inputs,
// "fp-test", undefined, judges), verbatim apart from the timing.
const judged = {
  format: "query-judging-schedule-solution",
  version: 1,
  fingerprint: "fp-test",
  status: "optimal",
  relaxed: false,
  objective: {
    judgeShortfall: 0,
    sponsorFinish: 2,
    sponsorIdle: 0,
    finish: 4,
    buildingChanges: 0,
    breakSlots: 2,
  },
  placements: [
    { entryId: "a", challengeId: "general", roomId: "g2", slot: 2 },
    { entryId: "a", challengeId: "sp1", roomId: "s1", slot: 0 },
    { entryId: "b", challengeId: "general", roomId: "g2", slot: 3 },
    { entryId: "b", challengeId: "sp1", roomId: "s1", slot: 1 },
    { entryId: "c", challengeId: "general", roomId: "g2", slot: 1 },
  ],
  reasons: [],
  solver: { name: "cp-sat", ortools: "9.15.6755", seconds: 0 },
  assignmentStatus: "optimal",
  judging: {
    unassigned: 0,
    memberOnSponsor: 0,
    maxLoad: 2,
    loadSpread: 1,
    repeats: 2,
    dayPartsCovered: 5,
    avgDistinctRooms: 1.0,
  },
  assignments: [
    { entryId: "a", challengeId: "general", judgeId: "m1" },
    { entryId: "a", challengeId: "sp1", judgeId: "gs" },
    { entryId: "b", challengeId: "general", judgeId: "m2" },
    { entryId: "b", challengeId: "sp1", judgeId: "gs" },
    { entryId: "c", challengeId: "general", judgeId: "m2" },
  ],
};

const readJudged = (value: unknown, now: JudgeInput[] = judges) =>
  readCpsatSolution(inputs, "fp-test", JSON.stringify(value), now);

describe("cpsatProblem with judges", () => {
  it("lists the judges with their run limit", () => {
    const problem = cpsatProblem(inputs, "fp-test", undefined, judges);
    expect(problem.judges).toEqual([
      { id: "m1", kind: "member", challengeIds: ["general", "sp1"], roomId: null, maxConsecutive: 4 },
      { id: "m2", kind: "member", challengeIds: ["general", "sp1"], roomId: null, maxConsecutive: 4 },
      { id: "gs", kind: "guest", challengeIds: ["sp1"], roomId: "s1", maxConsecutive: 4 },
    ]);
    expect("assignmentHint" in problem).toBe(false);
    expect("judges" in cpsatProblem(inputs, "fp-test", undefined, [])).toBe(false);
  });

  it("sends where the in-app assignment would put the judges for a hint", () => {
    const problem = cpsatProblem(inputs, "fp-test", judged.placements, [
      { ...judges[0]!, maxConsecutive: 2 },
      ...judges.slice(1),
    ]);
    expect(problem.judges![0]!.maxConsecutive).toBe(2);
    const hint = (problem as { assignmentHint?: JudgeAssignment[] }).assignmentHint!;
    expect(hint).toHaveLength(5);
    expect(new Set(hint.map((h) => h.judgeId))).toEqual(new Set(["m1", "m2", "gs"]));
  });
});

describe("readCpsatSolution with judges", () => {
  it("takes the judges the script chose, once they pass the rules", () => {
    const result = readJudged(judged);
    expect(result).toMatchObject({
      ok: true,
      judging: {
        source: "cp-sat",
        assignments: judged.assignments,
        metrics: { unassigned: 0, maxLoad: 2, loadSpread: 1, repeats: 2 },
      },
    });
  });

  it("assigns the judges itself when the file has none", () => {
    const { assignments: _dropped, ...without } = judged;
    const result = readJudged(without);
    if (!result.ok) throw new Error("the schedule is fine");
    expect(result.judging.source).toBe("in-app");
    expect(result.judging.metrics.unassigned).toBe(0);
    expect(result.judging.assignments).toHaveLength(5);
  });

  it("assigns the judges itself when the file's break the rules for the judges now", () => {
    // The guest has since gone: gs is not among the judges any more.
    const result = readJudged(judged, judges.slice(0, 2));
    if (!result.ok) throw new Error("the placements are still fine");
    expect(result.judging.source).toBe("in-app");
    expect(result.judging.assignments.every((a) => a.judgeId !== "gs")).toBe(true);
  });

  it("assigns the judges itself when the file puts one judge in two places", () => {
    const clashing = {
      ...judged,
      assignments: judged.assignments.map((a) =>
        a.entryId === "c" ? { ...a, judgeId: "gs" } : a,
      ),
    };
    const result = readJudged(clashing);
    if (!result.ok) throw new Error("the placements are fine");
    expect(result.judging.source).toBe("in-app");
  });

  it("leaves presentations without a judge rather than refuse the schedule", () => {
    const result = readJudged(judged, []);
    if (!result.ok) throw new Error("the placements are fine");
    expect(result.judging.assignments).toEqual([]);
    expect(result.judging.metrics.unassigned).toBe(5);
  });
});

describe("assigning judges to a schedule already made", () => {
  const placements: Placement[] = judged.placements;
  const keep: JudgeAssignment[] = [{ entryId: "c", challengeId: "general", judgeId: "m1" }];
  const problem = cpsatAssignmentProblem(inputs, placements, judges, keep);
  const answer = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      ...judged,
      fingerprint: problem.fingerprint,
      assignments: [
        { entryId: "c", challengeId: "general", judgeId: "m1" },
        { entryId: "a", challengeId: "general", judgeId: "m2" },
        { entryId: "a", challengeId: "sp1", judgeId: "gs" },
        { entryId: "b", challengeId: "general", judgeId: "m2" },
        { entryId: "b", challengeId: "sp1", judgeId: "gs" },
      ],
      ...over,
    });
  const readAnswer = (text: string, kept = keep) =>
    readCpsatAssignments(inputs, placements, judges, kept, text);

  it("writes the schedule, the judges and what to keep into the problem", () => {
    expect(problem.placements).toEqual(placements);
    expect(problem.locked).toEqual(keep);
    expect(problem.judges).toHaveLength(3);
    expect(problem.assignmentHint).toHaveLength(5);
    expect("locked" in cpsatAssignmentProblem(inputs, placements, judges)).toBe(false);
  });

  it("reads the assignments, scored", () => {
    expect(readAnswer(answer())).toMatchObject({
      ok: true,
      status: "optimal",
      metrics: { unassigned: 0, memberOnSponsor: 0 },
    });
  });

  it("refuses an answer for another schedule", () => {
    expect(readAnswer(answer({ fingerprint: "fp-test" }))).toMatchObject({ ok: false });
  });

  it("refuses a proof that nothing fits and a timeout", () => {
    expect(readAnswer(answer({ status: "infeasible" }))).toMatchObject({ ok: false });
    expect(readAnswer(answer({ status: "unknown" }))).toMatchObject({ ok: false });
  });

  it("refuses an answer with no assignments or no JSON", () => {
    const { assignments: _dropped, ...without } = JSON.parse(answer());
    expect(readAnswer(JSON.stringify(without))).toMatchObject({ ok: false });
    expect(readAnswer("nope")).toMatchObject({ ok: false });
    expect(readAnswer("{}")).toMatchObject({ ok: false });
  });

  it("refuses assignments that break a rule", () => {
    // m2 at a:sp1 (slot 0) and c:general (slot 1) in different buildings.
    const result = readAnswer(
      answer({
        assignments: [
          { entryId: "c", challengeId: "general", judgeId: "m1" },
          { entryId: "a", challengeId: "sp1", judgeId: "m1" },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("against the rules");
  });

  it("refuses an answer that moves what it was told to keep", () => {
    const result = readAnswer(
      answer({
        assignments: [
          { entryId: "c", challengeId: "general", judgeId: "m2" },
          { entryId: "a", challengeId: "general", judgeId: "m1" },
        ],
      }),
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("keep");
  });

  it("does not blame the script for a rule the kept assignments already broke", () => {
    // m1 kept at b:sp1 (slot 1, HEC) and c:general (slot 1, HEC): two places
    // at once, so before CP-SAT ran.
    const hasty: JudgeAssignment[] = [
      { entryId: "b", challengeId: "sp1", judgeId: "m1" },
      { entryId: "c", challengeId: "general", judgeId: "m1" },
    ];
    const text = answer({
      assignments: [
        ...hasty,
        { entryId: "a", challengeId: "general", judgeId: "m2" },
        { entryId: "a", challengeId: "sp1", judgeId: "gs" },
        { entryId: "b", challengeId: "general", judgeId: "m2" },
      ],
    });
    expect(readAnswer(text, hasty)).toMatchObject({ ok: true });
  });
});
