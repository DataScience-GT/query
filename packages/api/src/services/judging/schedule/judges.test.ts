import { describe, expect, it } from "vitest";
import {
  MAX_CONSECUTIVE,
  assignJudges,
  compareJudgeMetrics,
  describeShortfall,
  judgeShortfalls,
  mayGrade,
  scoreJudgeAssignment,
  validateJudgeAssignment,
} from "./judges";
import type { JudgeAssignment, JudgeInput } from "./judges";
import type { Placement, PlanInputs } from "./inputs";

const inputs: PlanInputs = {
  rooms: [
    { id: "g1", challengeId: "general", buildingId: "ENG" },
    { id: "g2", challengeId: "general", buildingId: "ENG" },
    { id: "g3", challengeId: "general", buildingId: "HEC" },
    { id: "s1", challengeId: "sponsor", buildingId: "HEC" },
  ],
  tasks: [
    { entryId: "a", challengeId: "general", sponsor: false },
    { entryId: "b", challengeId: "general", sponsor: false },
    { entryId: "c", challengeId: "general", sponsor: false },
    { entryId: "d", challengeId: "general", sponsor: false },
    { entryId: "a", challengeId: "sponsor", sponsor: true },
    { entryId: "b", challengeId: "sponsor", sponsor: true },
  ],
  slots: 12,
  sameGap: 1,
  crossGap: 2,
};

const placed = (
  entryId: string,
  challengeId: string,
  roomId: string,
  slot: number,
): Placement => ({ entryId, challengeId, roomId, slot });

const member = (id: string, extra: Partial<JudgeInput> = {}): JudgeInput => ({
  id,
  kind: "member",
  challengeIds: ["general", "sponsor"],
  roomId: null,
  ...extra,
});

const guest = (
  id: string,
  roomId: string | null,
  challengeIds = ["sponsor"],
): JudgeInput => ({ id, kind: "guest", challengeIds, roomId });

const row = (
  entryId: string,
  challengeId: string,
  judgeId: string,
): JudgeAssignment => ({ entryId, challengeId, judgeId });

const placements: Placement[] = [
  placed("a", "general", "g1", 0),
  placed("b", "general", "g2", 0),
  placed("c", "general", "g1", 3),
  placed("d", "general", "g3", 3),
  placed("a", "sponsor", "s1", 6),
  placed("b", "sponsor", "s1", 7),
];

describe("mayGrade", () => {
  it("lets a member grade the challenges they are given, in any room", () => {
    const judge = member("m", { challengeIds: ["general"] });
    expect(mayGrade(judge, { challengeId: "general", roomId: "g2" })).toBe(
      true,
    );
    expect(mayGrade(judge, { challengeId: "sponsor", roomId: "s1" })).toBe(
      false,
    );
  });

  it("keeps a guest to their own room, and a guest with no room out", () => {
    expect(
      mayGrade(guest("x", "s1"), { challengeId: "sponsor", roomId: "s1" }),
    ).toBe(true);
    expect(
      mayGrade(guest("x", "s1"), { challengeId: "sponsor", roomId: "s2" }),
    ).toBe(false);
    expect(
      mayGrade(guest("x", null), { challengeId: "sponsor", roomId: "s1" }),
    ).toBe(false);
  });
});

describe("validateJudgeAssignment", () => {
  const check = (
    judges: JudgeInput[],
    assignment: JudgeAssignment[],
    spots = placements,
  ) => validateJudgeAssignment(inputs, spots, judges, assignment);

  it("accepts a judge who keeps every rule, and does not mind presentations left out", () => {
    const judges = [member("m1"), guest("g", "s1")];
    const result = check(judges, [
      row("a", "general", "m1"),
      row("c", "general", "m1"),
      row("a", "sponsor", "g"),
    ]);
    expect(result).toEqual({ valid: true, problems: [] });
  });

  it("refuses a challenge or a room the judge may not grade", () => {
    const judges = [
      member("m1", { challengeIds: ["general"] }),
      guest("g", "s1"),
    ];
    const problems = check(judges, [
      row("a", "sponsor", "m1"),
      row("a", "general", "g"),
    ]).problems.join(" ");
    expect(problems).toContain(
      "Judge m1 may not grade a:sponsor: wrong challenge.",
    );
    expect(problems).toContain(
      "Judge g may not grade a:general: wrong challenge.",
    );
    const wrongRoom = check(
      [guest("g", "s1", ["general", "sponsor"])],
      [row("a", "general", "g")],
    );
    expect(wrongRoom.problems).toEqual([
      "Judge g may not grade a:general: wrong room.",
    ]);
  });

  it("refuses unknown presentations and judges, and two judges for one presentation", () => {
    const { problems } = check(
      [member("m1"), member("m2")],
      [
        row("zz", "general", "m1"),
        row("a", "general", "nobody"),
        row("c", "general", "m1"),
        row("c", "general", "m2"),
      ],
    );
    expect(problems).toContain("No such presentation: zz:general.");
    expect(problems).toContain("No such judge: nobody.");
    expect(problems).toContain("c:general has more than one judge.");
  });

  it("refuses a judge in two rooms at once", () => {
    const { problems } = check(
      [member("m1")],
      [row("a", "general", "m1"), row("b", "general", "m1")],
    );
    expect(problems).toEqual(["Judge m1 is booked twice in slot 1."]);
  });

  it("needs the same-building break to change rooms and the longer one to change buildings", () => {
    const both = (second: Placement) =>
      validateJudgeAssignment(
        inputs,
        [placed("a", "general", "g1", 0), second],
        [member("m1")],
        [
          row("a", "general", "m1"),
          row(second.entryId, second.challengeId, "m1"),
        ],
      );

    // g1 to g2 is one building: one free slot between (slots 0 and 2).
    expect(both(placed("b", "general", "g2", 1)).problems).toHaveLength(1);
    expect(both(placed("b", "general", "g2", 2)).valid).toBe(true);
    // g1 to g3 is another building: two free slots between.
    expect(both(placed("b", "general", "g3", 2)).problems).toHaveLength(1);
    expect(both(placed("b", "general", "g3", 3)).valid).toBe(true);
  });

  it("lets a judge stay in one room without a break, up to the run limit", () => {
    const wide: PlanInputs = {
      ...inputs,
      tasks: ["a", "b", "c", "d", "e", "f"].map((entryId) => ({
        entryId,
        challengeId: "general",
        sponsor: false,
      })),
    };
    const run = (count: number, judge: JudgeInput) => {
      const spots = ["a", "b", "c", "d", "e", "f"]
        .slice(0, count)
        .map((entryId, slot) => placed(entryId, "general", "g1", slot));
      return validateJudgeAssignment(
        wide,
        spots,
        [judge],
        spots.map((p) => row(p.entryId, "general", judge.id)),
      );
    };
    expect(MAX_CONSECUTIVE).toBe(4);
    expect(run(4, member("m1")).valid).toBe(true);
    expect(run(5, member("m1")).problems).toEqual([
      "Judge m1 grades more than 4 slots in a row.",
    ]);
    expect(run(5, member("m1", { maxConsecutive: 5 })).valid).toBe(true);
    expect(run(6, member("m1", { maxConsecutive: 2 })).valid).toBe(false);
  });

  it("allows a free slot to end a run", () => {
    const spots = [0, 1, 2, 3, 5].map((slot, i) =>
      placed(["a", "b", "c", "d", "e"][i]!, "general", "g1", slot),
    );
    const wide: PlanInputs = {
      ...inputs,
      tasks: spots.map((p) => ({
        entryId: p.entryId,
        challengeId: "general",
        sponsor: false,
      })),
    };
    const result = validateJudgeAssignment(
      wide,
      spots,
      [member("m1")],
      spots.map((p) => row(p.entryId, "general", "m1")),
    );
    expect(result.valid).toBe(true);
  });
});

describe("scoreJudgeAssignment", () => {
  it("counts what is left out, the loads, the rooms and the parts of the day", () => {
    const judges = [member("m1"), member("m2"), guest("g", "s1")];
    const metrics = scoreJudgeAssignment(inputs, placements, judges, [
      row("a", "general", "m1"),
      row("c", "general", "m1"),
      row("b", "general", "m2"),
      row("a", "sponsor", "g"),
      row("b", "sponsor", "m2"),
    ]);
    expect(metrics).toMatchObject({
      unassigned: 1,
      memberOnSponsor: 1,
      maxLoad: 2,
      // Members: 2 against 2; the guest is a pool of one.
      loadSpread: 0,
      // m1 is in g1 twice.
      repeats: 1,
      loads: { m1: 2, m2: 2, g: 1 },
    });
    // m1: g1; m2: g2, s1; g: s1.
    expect(metrics.avgDistinctRooms).toBeCloseTo(4 / 3);
  });

  it("ranks fewer left out ahead of everything else", () => {
    const judges = [member("m1"), member("m2")];
    const some = scoreJudgeAssignment(inputs, placements, judges, [
      row("a", "general", "m1"),
    ]);
    const more = scoreJudgeAssignment(inputs, placements, judges, [
      row("a", "general", "m1"),
      row("c", "general", "m1"),
    ]);
    expect(compareJudgeMetrics(more, some)).toBeLessThan(0);
    expect(compareJudgeMetrics(some, some)).toBe(0);
  });
});

describe("assignJudges", () => {
  it("gives every presentation a judge who may grade it, keeping the rules", () => {
    const judges = [member("m1"), member("m2"), guest("g", "s1")];
    const { assignment, metrics } = assignJudges(inputs, placements, judges);
    expect(assignment).toHaveLength(placements.length);
    expect(metrics.unassigned).toBe(0);
    expect(
      validateJudgeAssignment(inputs, placements, judges, assignment),
    ).toEqual({
      valid: true,
      problems: [],
    });
  });

  it("leaves sponsor presentations to the sponsor's judge while that judge can take them", () => {
    const judges = [member("m1"), member("m2"), guest("g", "s1")];
    const { assignment, metrics } = assignJudges(inputs, placements, judges);
    const sponsor = assignment.filter((r) => r.challengeId === "sponsor");
    expect(sponsor.map((r) => r.judgeId)).toEqual(["g", "g"]);
    expect(metrics.memberOnSponsor).toBe(0);
  });

  it("asks a table judge to cover the sponsor when no sponsor judge can", () => {
    // Both sponsor presentations at once: the one guest can take only one.
    const clash = [
      placed("a", "sponsor", "s1", 6),
      placed("b", "sponsor", "s1", 7),
      placed("a", "general", "g1", 0),
    ];
    const tight = { ...inputs, sameGap: 1 };
    const judges = [member("m1"), guest("g", "s1")];
    const { assignment, metrics } = assignJudges(tight, clash, judges);
    // Back to back in one room needs no break: the guest takes both.
    expect(assignment.filter((r) => r.judgeId === "g")).toHaveLength(2);
    expect(metrics.memberOnSponsor).toBe(0);

    const together = [
      placed("a", "sponsor", "s1", 6),
      placed("b", "sponsor", "s2", 6),
    ];
    const withTwoRooms: PlanInputs = {
      ...tight,
      rooms: [
        ...tight.rooms,
        { id: "s2", challengeId: "sponsor", buildingId: "HEC" },
      ],
    };
    const result = assignJudges(withTwoRooms, together, [
      member("m1"),
      guest("g", "s1"),
    ]);
    expect(result.metrics.unassigned).toBe(0);
    expect(result.metrics.memberOnSponsor).toBe(1);
    expect(result.assignment.find((r) => r.entryId === "b")!.judgeId).toBe(
      "m1",
    );
  });

  it("evens the load between judges of one pool", () => {
    const only = placements.filter((p) => p.challengeId === "general");
    const judges = [member("m1"), member("m2")];
    const { metrics } = assignJudges(inputs, only, judges);
    expect(metrics.loads).toEqual({ m1: 2, m2: 2 });
    expect(metrics.maxLoad).toBe(2);
    expect(metrics.loadSpread).toBe(0);
  });

  it("spreads one judge over rooms and over the day", () => {
    const wide: PlanInputs = {
      ...inputs,
      sameGap: 0,
      crossGap: 0,
      slots: 8,
      tasks: ["a", "b", "c", "d"].map((entryId) => ({
        entryId,
        challengeId: "general",
        sponsor: false,
      })),
    };
    // Two presentations in each of two rooms, early then late.
    const spots = [
      placed("a", "general", "g1", 0),
      placed("b", "general", "g2", 1),
      placed("c", "general", "g1", 6),
      placed("d", "general", "g2", 7),
    ];
    const { metrics, assignment } = assignJudges(wide, spots, [
      member("m1"),
      member("m2"),
    ]);
    expect(metrics.loads).toEqual({ m1: 2, m2: 2 });
    // Each judge sees both rooms and both ends of the day.
    expect(metrics.repeats).toBe(0);
    expect(metrics.avgDistinctRooms).toBe(2);
    expect(metrics.dayPartsCovered).toBe(4);
    expect(new Set(assignment.map((r) => r.judgeId)).size).toBe(2);
  });

  it("reports the slot where judges run out", () => {
    const rush = [
      placed("a", "general", "g1", 0),
      placed("b", "general", "g2", 0),
      placed("c", "general", "g3", 0),
    ];
    const judges = [member("m1"), member("m2")];
    const { assignment, metrics } = assignJudges(inputs, rush, judges);
    expect(metrics.unassigned).toBe(1);
    const shortfalls = judgeShortfalls(inputs, rush, judges, assignment);
    expect(shortfalls).toEqual([
      { slot: 0, challengeId: "general", presentations: 3, judgesFree: 2 },
    ]);
    expect(describeShortfall(shortfalls[0]!, "General")).toBe(
      "Slot 1: 3 presentations in General, only 2 judges free",
    );
    expect(
      describeShortfall(
        { slot: 4, challengeId: "x", presentations: 1, judgesFree: 1 },
        "Acme",
      ),
    ).toBe("Slot 5: 1 presentation in Acme, only 1 judge free");
  });

  it("does not count a judge who cannot walk there as free", () => {
    // m1 grades in ENG at slot 0; slot 1 is HEC and needs two free slots.
    const spots = [
      placed("a", "general", "g1", 0),
      placed("b", "general", "g3", 1),
    ];
    const judges = [member("m1")];
    const { assignment } = assignJudges(inputs, spots, judges);
    expect(assignment).toHaveLength(1);
    const shortfalls = judgeShortfalls(inputs, spots, judges, assignment);
    expect(shortfalls).toEqual([
      {
        slot: assignment[0]!.entryId === "a" ? 1 : 0,
        challengeId: "general",
        presentations: 1,
        judgesFree: 0,
      },
    ]);
  });

  it("keeps assignments it is told to keep, and plans around them", () => {
    const only = placements.filter((p) => p.challengeId === "general");
    const judges = [member("m1"), member("m2")];
    const keep = [row("a", "general", "m1"), row("c", "general", "m1")];
    const { assignment } = assignJudges(inputs, only, judges, { keep });
    expect(assignment).toHaveLength(4);
    expect(assignment).toEqual(expect.arrayContaining(keep));
    // b and d share a slot with the kept ones, so only m2 is free for them.
    const rest = assignment.filter(
      (r) => r.entryId === "b" || r.entryId === "d",
    );
    expect(rest.map((r) => r.judgeId)).toEqual(["m2", "m2"]);
  });

  it("gives the same answer however its inputs are ordered", () => {
    const judges = [member("m1"), member("m2"), member("m3"), guest("g", "s1")];
    const first = assignJudges(inputs, placements, judges);
    const second = assignJudges(
      inputs,
      [...placements].reverse(),
      [...judges].reverse(),
    );
    expect(second.assignment).toEqual(first.assignment);
    expect(second.metrics).toEqual(first.metrics);
  });

  it("assigns nothing without judges", () => {
    const result = assignJudges(inputs, placements, []);
    expect(result.assignment).toEqual([]);
    expect(result.metrics.unassigned).toBe(placements.length);
    expect(result.metrics.avgDistinctRooms).toBe(0);
  });
});

// A small deterministic generator, so these cases never change between runs.
function lcg(seed: number) {
  let state = seed >>> 0;
  return (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
}

function randomCase(seed: number) {
  const next = lcg(seed);
  const rooms = [
    { id: "r1", challengeId: "c1", buildingId: "A" },
    { id: "r2", challengeId: "c1", buildingId: "A" },
    { id: "r3", challengeId: "c1", buildingId: "B" },
    { id: "r4", challengeId: "c2", buildingId: "B" },
  ];
  const slots = 8;
  const taken = new Set<string>();
  const spots: Placement[] = [];
  for (let n = 0; n < 7; n += 1) {
    const room = rooms[next(rooms.length)]!;
    const slot = next(slots);
    if (taken.has(`${room.id}@${slot}`)) continue;
    taken.add(`${room.id}@${slot}`);
    spots.push(placed(`e${n}`, room.challengeId, room.id, slot));
  }
  const judges: JudgeInput[] = [
    { id: "m1", kind: "member", challengeIds: ["c1", "c2"], roomId: null },
    { id: "m2", kind: "member", challengeIds: ["c1", "c2"], roomId: null },
    { id: "g4", kind: "guest", challengeIds: ["c2"], roomId: "r4" },
  ];
  const plan: PlanInputs = {
    rooms,
    tasks: spots.map((p) => ({
      entryId: p.entryId,
      challengeId: p.challengeId,
      sponsor: p.challengeId === "c2",
    })),
    slots,
    sameGap: next(2),
    crossGap: 1 + next(2),
  };
  plan.crossGap = Math.max(plan.crossGap, plan.sameGap);
  return { plan, spots, judges };
}

/** The fewest presentations any valid assignment leaves without a judge. */
function fewestLeftOut(
  plan: PlanInputs,
  spots: Placement[],
  judges: JudgeInput[],
): number {
  let best = spots.length;
  const rows: JudgeAssignment[] = [];
  const go = (i: number) => {
    if (i === spots.length) {
      best = Math.min(best, spots.length - rows.length);
      return;
    }
    go(i + 1);
    const p = spots[i]!;
    for (const judge of judges) {
      if (!mayGrade(judge, p)) continue;
      rows.push(row(p.entryId, p.challengeId, judge.id));
      if (validateJudgeAssignment(plan, spots, judges, rows).valid) go(i + 1);
      rows.pop();
    }
  };
  go(0);
  return best;
}

describe("assignJudges against every possibility", () => {
  it("keeps the rules and leaves out no more than it must", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { plan, spots, judges } = randomCase(seed);
      const result = assignJudges(plan, spots, judges);
      expect(
        validateJudgeAssignment(plan, spots, judges, result.assignment)
          .problems,
        `seed ${seed}`,
      ).toEqual([]);
      expect(result.metrics.unassigned, `seed ${seed}`).toBe(
        fewestLeftOut(plan, spots, judges),
      );
    }
  });
});
