import { describe, expect, it } from "vitest";
import { aamoghCPSolver } from "./aamogh-cp-solver";
import { compareScores, scoreSchedule, validateSchedule } from "./rules";
import type { PlanScore } from "./rules";
import { solvePlan } from "./solve";
import type { Placement, PlanInputs, PlanRoom, PlanTask } from "./inputs";

const task = (entryId: string, challengeId: string): PlanTask => ({
  entryId,
  challengeId,
  sponsor: challengeId !== "general",
});
const room = (id: string, challengeId: string, buildingId: string): PlanRoom => ({
  id,
  challengeId,
  buildingId,
});

/** Every assignment of every task to every (room, slot): the true optimum. */
function bruteForce(inputs: PlanInputs, relaxed: boolean): PlanScore | null {
  let best: PlanScore | null = null;
  const chosen: Placement[] = [];
  const cells = new Set<string>();
  const visit = (i: number) => {
    if (i === inputs.tasks.length) {
      if (!validateSchedule(inputs, chosen, { relaxed }).valid) return;
      const score = scoreSchedule(inputs, chosen);
      if (!best || compareScores(score, best) < 0) best = score;
      return;
    }
    const t = inputs.tasks[i]!;
    for (const r of inputs.rooms) {
      if (r.challengeId !== t.challengeId) continue;
      for (let slot = 0; slot < inputs.slots; slot += 1) {
        const cell = `${r.id}@${slot}`;
        if (cells.has(cell)) continue;
        cells.add(cell);
        chosen.push({ ...t, roomId: r.id, slot });
        visit(i + 1);
        chosen.pop();
        cells.delete(cell);
      }
    }
  };
  visit(0);
  return best;
}

/** A small seeded generator, so the random instances are the same every run. */
function lcg(seed: number) {
  let state = seed;
  return (n: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % n;
  };
}

function smallInstance(seed: number): PlanInputs {
  const pick = lcg(seed);
  const buildings = ["ENG", "HEC"];
  const rooms: PlanRoom[] = [room("g1", "general", buildings[pick(2)]!)];
  if (pick(2)) rooms.push(room("g2", "general", buildings[pick(2)]!));
  rooms.push(room("s1", "sp1", buildings[pick(2)]!));
  const tasks: PlanTask[] = [];
  const projects = 2 + pick(2);
  for (let p = 0; p < projects; p += 1) {
    tasks.push(task(`p${p}`, "general"));
    if (pick(3) > 0) tasks.push(task(`p${p}`, "sp1"));
  }
  return { rooms, tasks, slots: 4 + pick(2), sameGap: pick(2), crossGap: 1 + pick(2) };
}

function solved(inputs: PlanInputs) {
  const result = aamoghCPSolver(inputs);
  if (!result.ok) {
    throw new Error(`expected a schedule: ${JSON.stringify(result.diagnostics)}`);
  }
  return result;
}

/** 300 projects, 8 general rooms over three buildings, four sponsor rooms. */
function largeEvent(): PlanInputs {
  const rooms: PlanRoom[] = [];
  for (let i = 0; i < 8; i += 1) rooms.push(room(`g${i}`, "general", `B${i % 3}`));
  for (let i = 0; i < 4; i += 1) rooms.push(room(`s${i}`, `sp${i}`, `B${i % 3}`));
  const tasks: PlanTask[] = [];
  for (let n = 0; n < 300; n += 1) {
    const id = `e${String(n).padStart(3, "0")}`;
    tasks.push(task(id, "general"));
    for (let k = 0; k < 4; k += 1) {
      if ((n * 37 + k * 53) % 100 < 13) tasks.push(task(id, `sp${k}`));
    }
  }
  return { rooms, tasks, slots: 48, sameGap: 1, crossGap: 2 };
}

describe("aamoghCPSolver", () => {
  it("finds the true optimum on every small instance", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const inputs = smallInstance(seed);
      const strict = bruteForce(inputs, false);
      const optimum = strict ?? bruteForce(inputs, true);
      const result = aamoghCPSolver(inputs);
      if (!optimum) {
        expect(result.ok, `seed ${seed}`).toBe(false);
        continue;
      }
      if (!result.ok) throw new Error(`seed ${seed}: no schedule, optimum exists`);
      expect(result.relaxed, `seed ${seed}`).toBe(strict === null);
      expect(result.score, `seed ${seed}`).toEqual(optimum);
    }
  });

  it("never claims a lower bound above the true optimum", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const inputs = smallInstance(seed);
      const optimum = bruteForce(inputs, false) ?? bruteForce(inputs, true);
      const result = aamoghCPSolver(inputs);
      if (!optimum || !result.ok) continue;
      result.stats.lowerBounds.forEach((bound, goal) => {
        if (bound !== null) expect(optimum[goal]!, `seed ${seed} goal ${goal}`).toBeGreaterThanOrEqual(bound);
      });
    }
  });

  it("marks a goal proven only when it sits on its bound", () => {
    const result = solved(largeEvent());
    result.stats.proven.forEach((proven, goal) => {
      const bound = result.stats.lowerBounds[goal];
      expect(proven).toBe(bound !== null && bound !== undefined && result.score[goal] === bound);
    });
    // Counting alone settles the first four goals on this event.
    expect(result.stats.proven.slice(0, 4)).toEqual([true, true, true, true]);
  });

  it("shortens cross-building breaks only when nothing else fits, and says so", () => {
    // "a" must present in ENG and HEC with a 3-slot walk, in a 3-slot window.
    const inputs: PlanInputs = {
      rooms: [room("g1", "general", "ENG"), room("s1", "sp1", "HEC")],
      tasks: [task("a", "general"), task("a", "sp1")],
      slots: 3,
      sameGap: 1,
      crossGap: 3,
    };
    const result = solved(inputs);
    expect(result.relaxed).toBe(true);
    expect(result.reducedBreaks).toHaveLength(1);
    expect(validateSchedule(inputs, result.placements, { relaxed: true }).valid).toBe(true);
    expect(validateSchedule(inputs, result.placements, { relaxed: false }).valid).toBe(false);
  });

  it("reports capacity it can count instead of searching", () => {
    const result = aamoghCPSolver({
      rooms: [room("g1", "general", "ENG")],
      tasks: [task("a", "general"), task("b", "general"), task("c", "general")],
      slots: 2,
      sameGap: 1,
      crossGap: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]).toMatchObject({ kind: "capacity" });
  });

  it("gives the same schedule for the same inputs", () => {
    const inputs = largeEvent();
    expect(solved(inputs).placements).toEqual(solved(inputs).placements);
  });

  it("only improves on a schedule it is given", () => {
    const inputs = largeEvent();
    const greedy = solvePlan(inputs);
    if (!greedy.ok) throw new Error("greedy found no schedule");
    const result = aamoghCPSolver(inputs, { start: greedy.placements });
    if (!result.ok) throw new Error("no schedule from a valid start");
    expect(compareScores(result.score, greedy.score)).toBeLessThanOrEqual(0);
  });

  it("schedules 300 projects in 12 rooms validly and quickly", () => {
    const inputs = largeEvent();
    const started = performance.now();
    const result = solved(inputs);
    const elapsed = performance.now() - started;
    expect(validateSchedule(inputs, result.placements, { relaxed: result.relaxed }).valid).toBe(true);
    expect(result.placements).toHaveLength(inputs.tasks.length);
    // About half a second on a laptop; the margin is for slow CI machines.
    expect(elapsed).toBeLessThan(10_000);
  });
});
