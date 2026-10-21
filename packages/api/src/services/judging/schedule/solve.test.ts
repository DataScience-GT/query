import { describe, expect, it } from "vitest";
import { capacityProblems, solvePlan } from "./solve";
import { compareScores, scoreSchedule, validateSchedule } from "./rules";
import type { PlanScore } from "./rules";
import type { Placement, PlanInputs, PlanRoom, PlanTask } from "./inputs";

const general = (entryId: string): PlanTask => ({
  entryId,
  challengeId: "general",
  sponsor: false,
});
const sponsor = (entryId: string, challengeId = "sponsor"): PlanTask => ({
  entryId,
  challengeId,
  sponsor: true,
});
const room = (id: string, challengeId: string, buildingId: string): PlanRoom => ({
  id,
  challengeId,
  buildingId,
});

// Two buildings. "a" presents to General in ENG and to the sponsor in HEC.
const small: PlanInputs = {
  rooms: [room("g1", "general", "ENG"), room("s1", "sponsor", "HEC")],
  tasks: [general("a"), sponsor("a"), general("b")],
  slots: 4,
  sameGap: 1,
  crossGap: 2,
};

/** Every assignment of every task to every (room, slot): the true optimum. */
function bruteForce(inputs: PlanInputs, relaxed: boolean): PlanScore | null {
  let best: PlanScore | null = null;
  const chosen: Placement[] = [];
  const visit = (i: number) => {
    if (i === inputs.tasks.length) {
      if (!validateSchedule(inputs, chosen, { relaxed }).valid) return;
      const score = scoreSchedule(inputs, chosen);
      if (!best || compareScores(score, best) < 0) best = score;
      return;
    }
    const task = inputs.tasks[i]!;
    for (const r of inputs.rooms) {
      if (r.challengeId !== task.challengeId) continue;
      for (let slot = 0; slot < inputs.slots; slot += 1) {
        chosen.push({ ...task, roomId: r.id, slot });
        visit(i + 1);
        chosen.pop();
      }
    }
  };
  visit(0);
  return best;
}

function solved(inputs: PlanInputs) {
  const result = solvePlan(inputs);
  if (!result.ok) {
    throw new Error(`expected a schedule: ${JSON.stringify(result.diagnostics)}`);
  }
  return result;
}

describe("capacityProblems", () => {
  it("flags a challenge with more presentations than its rooms hold", () => {
    expect(
      capacityProblems({
        ...small,
        slots: 1,
        tasks: [general("a"), general("b")],
      }),
    ).toEqual([
      {
        kind: "capacity",
        challengeId: "general",
        presentations: 2,
        rooms: 1,
        capacity: 1,
      },
    ]);
  });

  it("flags a challenge with no room at all", () => {
    const [problem] = capacityProblems({
      ...small,
      tasks: [sponsor("a", "mlh")],
    });
    expect(problem).toMatchObject({ kind: "capacity", rooms: 0, capacity: 0 });
  });

  it("flags a project whose presentations cannot fit with breaks", () => {
    expect(
      capacityProblems({
        rooms: [room("x", "x", "ENG"), room("y", "y", "ENG")],
        tasks: [sponsor("a", "x"), sponsor("a", "y")],
        slots: 2,
        sameGap: 1,
        crossGap: 1,
      }),
    ).toEqual([
      {
        kind: "overload",
        entryId: "a",
        presentations: 2,
        slotsNeeded: 3,
        slots: 2,
      },
    ]);
  });
});

describe("solvePlan", () => {
  it("returns an empty schedule when there is nothing to place", () => {
    const result = solved({ ...small, tasks: [] });
    expect(result.placements).toEqual([]);
    expect(result.score).toEqual([0, 0, 0, 0, 0]);
  });

  it("finishes sponsors first, then keeps the cross-building walk", () => {
    const result = solved(small);
    const at = (entryId: string, challengeId: string) =>
      result.placements.find(
        (p) => p.entryId === entryId && p.challengeId === challengeId,
      )!;
    expect(at("a", "sponsor").slot).toBe(0);
    // Two empty slots for the walk from HEC to ENG.
    expect(at("a", "general").slot).toBeGreaterThanOrEqual(3);
    expect(result.relaxed).toBe(false);
    expect(result.score).toEqual(bruteForce(small, false));
  });

  it("matches the exhaustive optimum on small problems", () => {
    for (const crossGap of [1, 2, 3]) {
      for (const extraRoom of [false, true]) {
        const inputs: PlanInputs = {
          ...small,
          crossGap,
          slots: 5,
          rooms: extraRoom
            ? [...small.rooms, room("s2", "sponsor", "ENG")]
            : small.rooms,
          tasks: [...small.tasks, sponsor("b")],
        };
        const result = solved(inputs);
        const best =
          bruteForce(inputs, false) ?? bruteForce(inputs, true);
        expect(result.score, `crossGap ${crossGap}`).toEqual(best);
      }
    }
  });

  it("keeps the same-building break between one project's presentations", () => {
    const inputs: PlanInputs = {
      rooms: [room("x", "x", "ENG"), room("y", "y", "ENG"), room("z", "z", "ENG")],
      tasks: [sponsor("a", "x"), sponsor("a", "y"), sponsor("a", "z")],
      slots: 5,
      sameGap: 1,
      crossGap: 3,
    };
    const slots = solved(inputs)
      .placements.map((p) => p.slot)
      .sort((a, b) => a - b);
    expect(slots).toEqual([0, 2, 4]);
  });

  it("needs the longer break only when the project changes building", () => {
    const inputs: PlanInputs = {
      rooms: [room("x", "x", "ENG"), room("y", "y", "HEC")],
      tasks: [sponsor("a", "x"), sponsor("a", "y")],
      slots: 6,
      sameGap: 0,
      crossGap: 3,
    };
    const result = solved(inputs);
    const [first, second] = [...result.placements].sort((a, b) => a.slot - b.slot);
    expect(second!.slot - first!.slot - 1).toBeGreaterThanOrEqual(3);

    const sameBuilding = solved({
      ...inputs,
      rooms: [room("x", "x", "ENG"), room("y", "y", "ENG")],
    });
    // Sponsors finish as early as possible: back to back is allowed.
    expect(sameBuilding.score[0]).toBe(2);
  });

  it("falls back to the same-building break and says so", () => {
    // Four slots cannot hold two presentations three slots apart.
    const inputs: PlanInputs = {
      rooms: [room("x", "x", "ENG"), room("y", "y", "HEC")],
      tasks: [sponsor("a", "x"), sponsor("a", "y")],
      slots: 4,
      sameGap: 1,
      crossGap: 3,
    };
    expect(bruteForce(inputs, false)).toBeNull();
    const result = solved(inputs);
    expect(result.relaxed).toBe(true);
    expect(result.reducedBreaks).toHaveLength(1);
    expect(result.reducedBreaks[0]).toMatchObject({ entryId: "a" });
    expect(validateSchedule(inputs, result.placements, { relaxed: false }).valid).toBe(false);
    expect(validateSchedule(inputs, result.placements, { relaxed: true }).valid).toBe(true);
  });

  it("does not flag a relaxed solve that shortened nothing", () => {
    expect(solved(small).relaxed).toBe(false);
  });

  it("reports what could not be placed when even short breaks do not fit", () => {
    // Capacity is fine (two rooms, two slots each), but "a" and "b" both
    // present twice and need a slot between, which two slots cannot give.
    const inputs: PlanInputs = {
      rooms: [room("x", "x", "ENG"), room("y", "y", "ENG")],
      tasks: [
        sponsor("a", "x"),
        sponsor("a", "y"),
        sponsor("b", "x"),
      ],
      slots: 2,
      sameGap: 1,
      crossGap: 1,
    };
    const result = solvePlan(inputs);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((d) => d.kind)).toEqual(["overload"]);

    const tight = solvePlan({
      rooms: [room("x", "x", "ENG"), room("y", "y", "ENG")],
      tasks: [
        sponsor("a", "x"),
        sponsor("a", "y"),
        sponsor("b", "x"),
        sponsor("b", "y"),
        sponsor("c", "x"),
        sponsor("c", "y"),
      ],
      slots: 3,
      sameGap: 1,
      crossGap: 1,
    });
    // Each challenge has three presentations for three slots, and each
    // project needs slots 0 and 2, so only two projects fit.
    expect(tight.ok).toBe(false);
    if (tight.ok) return;
    expect(tight.diagnostics.length).toBeGreaterThan(0);
    expect(tight.diagnostics.every((d) => d.kind === "unplaced")).toBe(true);
  });

  it("gives the same schedule for the same inputs in any order", () => {
    const inputs = scaleInputs(60, 4);
    const first = solved(inputs);
    const again = solved(inputs);
    const shuffled = solved({
      ...inputs,
      rooms: [...inputs.rooms].reverse(),
      tasks: [...inputs.tasks].reverse(),
    });
    expect(again.placements).toEqual(first.placements);
    expect(shuffled.placements).toEqual(first.placements);
  });

  it("prefers keeping a project in one building", () => {
    const inputs: PlanInputs = {
      rooms: [
        room("ga", "general", "ENG"),
        room("gb", "general", "HEC"),
        room("s1", "sponsor", "HEC"),
      ],
      tasks: [general("a"), sponsor("a")],
      slots: 6,
      sameGap: 1,
      crossGap: 2,
    };
    const result = solved(inputs);
    expect(result.score[3]).toBe(0);
    expect(
      result.placements.find((p) => p.challengeId === "general")!.roomId,
    ).toBe("gb");
  });

  it("returns only valid schedules, at or above the sponsor lower bound, across varied inputs", () => {
    // A fixed-seed generator, so the cases are the same on every run.
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let solvedCount = 0;
    for (let round = 0; round < 40; round += 1) {
      const buildings = ["ENG", "HEC", "CUL"].slice(0, 1 + next(3));
      const challenges = ["general", "x", "y", "z"].slice(0, 1 + next(4));
      const rooms: PlanRoom[] = [];
      challenges.forEach((c) => {
        for (let k = 0, n = 1 + next(3); k < n; k += 1) {
          rooms.push(room(`${c}-${k}`, c, buildings[next(buildings.length)]!));
        }
      });
      const tasks: PlanTask[] = [];
      for (let e = 0, n = 3 + next(25); e < n; e += 1) {
        for (const c of challenges) {
          if (c === "general" || next(3) === 0) {
            tasks.push({ entryId: `e${e}`, challengeId: c, sponsor: c !== "general" });
          }
        }
      }
      const sameGap = next(2);
      const inputs: PlanInputs = {
        rooms,
        tasks,
        slots: 4 + next(20),
        sameGap,
        crossGap: sameGap + next(3),
      };

      const result = solvePlan(inputs);
      if (!result.ok) continue;
      solvedCount += 1;
      const check = validateSchedule(inputs, result.placements, {
        relaxed: result.relaxed,
      });
      expect(check.valid, `round ${round}`).toBe(true);
      expect(result.score).toEqual(scoreSchedule(inputs, result.placements));
      for (const c of challenges.filter((c) => c !== "general")) {
        const count = tasks.filter((t) => t.challengeId === c).length;
        const roomCount = rooms.filter((r) => r.challengeId === c).length;
        expect(result.score[0]).toBeGreaterThanOrEqual(Math.ceil(count / roomCount));
      }
    }
    expect(solvedCount).toBeGreaterThan(20);
  });

  it("solves 300 projects in 12 rooms quickly and validly", () => {
    const inputs = scaleInputs(300, 3);
    const started = performance.now();
    const result = solved(inputs);
    const elapsed = performance.now() - started;

    expect(validateSchedule(inputs, result.placements, { relaxed: false }).valid).toBe(true);
    expect(result.relaxed).toBe(false);
    // Each sponsor room has 60 presentations; General needs 300 / 9 slots.
    expect(result.score[0]).toBe(60);
    expect(result.score[1]).toBe(0);
    expect(result.score[2]).toBeLessThanOrEqual(62);
    expect(elapsed).toBeLessThan(8000);
  }, 20_000);
});

/**
 * `projects` teams, all in General (nine rooms in ENG); every fifth also in
 * each of `sponsors` sponsor challenges, one room each in HEC.
 */
function scaleInputs(projects: number, sponsors: number): PlanInputs {
  const rooms: PlanRoom[] = [];
  for (let i = 0; i < 9; i += 1) rooms.push(room(`g${i}`, "general", "ENG"));
  for (let s = 0; s < sponsors; s += 1) {
    rooms.push(room(`s${s}`, `sponsor${s}`, "HEC"));
  }
  const tasks: PlanTask[] = [];
  for (let i = 0; i < projects; i += 1) {
    const id = `p${String(i).padStart(3, "0")}`;
    tasks.push(general(id));
    for (let s = 0; s < sponsors; s += 1) {
      if ((i + s) % 5 === 0) tasks.push(sponsor(id, `sponsor${s}`));
    }
  }
  return { rooms, tasks, slots: 72, sameGap: 1, crossGap: 2 };
}
