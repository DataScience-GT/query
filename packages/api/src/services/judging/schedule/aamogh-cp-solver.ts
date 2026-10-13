import { taskKey } from "./inputs";
import type { Placement, PlanInputs } from "./inputs";
import { compareScores, scoreSchedule, validateSchedule } from "./rules";
import type { PlanScore } from "./rules";
import { capacityProblems } from "./solve";
import type { PlanDiagnostic, PlanResult } from "./solve";

// aamoghCPSolver: the judging scheduler, built for this one problem rather
// than for constraint programming in general.
//
// Same rules and the same five goals as the CP-SAT model in
// packages/api/scripts/judging-schedule/cpsat.py, solved a different way:
//
//   bounds     Before searching, every goal gets a lower bound from counting
//              alone (room capacity per challenge, each project's chain of
//              presentations, the fewest buildings a project can stay in). A
//              goal that reaches its bound is proven optimal and the search
//              moves on. Without these, CP-SAT spent most of its time limit
//              proving what the counting already said.
//   symmetry   Rooms that judge the same challenge in the same building are
//              interchangeable, so a value is "this class at this slot", not
//              "this room at this slot". On a typical event that divides the
//              branching by the number of rooms per building.
//   sweep      The first schedule fills the grid slot by slot, sponsor
//              presentations first, each free room taking the most
//              constrained project that may present there.
//   repair     Large-neighbourhood search aimed at one goal at a time, in
//              priority order: free the presentations that hold the goal
//              where it is (everything in the last slot, a sponsor room's
//              gaps, a project's building hops) plus a window around them,
//              and re-place them with a small exact search: fail-first
//              variable order, forward-checked domains capped so the freed
//              part must beat the goal, and goal-aware value order.
//   polish     Building changes and breaks only ever involve two projects
//              per move, so they get a cheap trade-and-move climb with
//              per-project costs before the exact repair takes a fixed
//              number of shots at the tightest projects.
//
// Budgets count work, not time, and the only randomness is a generator seeded
// from the inputs, so the same inputs always give the same schedule: a save
// re-solves on the server and must land on what the organiser previewed.

/** Which goal each position of a score is (rules.ts PlanScore order). */
export const GOAL_NAMES = [
  "sponsorFinish",
  "sponsorIdle",
  "finish",
  "buildingChanges",
  "breaks",
] as const;

export type AamoghStats = {
  /** Lower bounds per goal, in PlanScore order; null where none is known. */
  lowerBounds: (number | null)[];
  /** Goals whose value equals its lower bound, so no schedule does better. */
  proven: boolean[];
  iterations: number;
  improvements: number;
  /** Values tried by the repair search, summed. */
  nodes: number;
};

export type AamoghOptions = {
  /** A schedule to start from instead of the sweep; invalid rows are dropped. */
  start?: readonly Placement[];
  /** Neighbourhoods tried per attempt. Defaults by problem size. */
  iterations?: number;
};

export type AamoghResult = PlanResult & { stats: AamoghStats };

// Unplaced presentations are a sixth goal, ahead of the five public ones, so
// the same search that improves a schedule also completes a partial one.
const UNPLACED = 0;
const SPONSOR_FINISH = 1;
const SPONSOR_IDLE = 2;
const FINISH = 3;
const CHANGES = 4;
const BREAKS = 5;
const GOALS = 6;

/**
 * Backtracking allowed per freed presentation. Small on purpose: many cheap
 * neighbourhoods beat a few exhaustive ones, and a failed repair that stops
 * early costs almost nothing.
 */
const NODES_PER_TASK = 3;
/** Candidate values kept per variable after ordering. */
const BRANCH = 3;
/**
 * Trials one presentation gets per polishing round. The scan runs from the
 * outermost slots in, where the gains are, so past this it is mostly
 * confirming that nothing helps.
 */
const TRIALS_PER_TASK = 96;
/** Most presentations one neighbourhood may free. */
const MAX_FREED = 48;
/** Neighbourhoods without progress before a goal is left as it stands. */
const PATIENCE = 400;
/** The same for completing a schedule before trying relaxed breaks. */
const UNPLACED_PATIENCE = 60;
/**
 * Breaks come last and polishing has done most of the work, so the exact
 * repair gets a fixed number of tries at them, however they go.
 */
const BREAKS_KICKS = 60;

/** Small, fast, seedable; good enough to pick neighbourhoods. */
function generator(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The problem as typed arrays, indexes instead of ids. */
function compile(inputs: PlanInputs, relaxed: boolean) {
  const R = inputs.rooms.length;
  const T = inputs.tasks.length;
  const S = inputs.slots;

  const challengeIndex = new Map<string, number>();
  const buildingIndex = new Map<string, number>();
  const indexOf = (map: Map<string, number>, key: string) => {
    let value = map.get(key);
    if (value === undefined) {
      value = map.size;
      map.set(key, value);
    }
    return value;
  };

  const roomChallenge = new Int32Array(R);
  const roomBuilding = new Int32Array(R);
  for (let r = 0; r < R; r += 1) {
    roomChallenge[r] = indexOf(challengeIndex, inputs.rooms[r]!.challengeId);
    roomBuilding[r] = indexOf(buildingIndex, inputs.rooms[r]!.buildingId);
  }

  const entryIndex = new Map<string, number>();
  const taskChallenge = new Int32Array(T);
  const taskEntry = new Int32Array(T);
  const taskSponsor = new Uint8Array(T);
  for (let t = 0; t < T; t += 1) {
    const task = inputs.tasks[t]!;
    taskChallenge[t] = indexOf(challengeIndex, task.challengeId);
    taskEntry[t] = indexOf(entryIndex, task.entryId);
    taskSponsor[t] = task.sponsor ? 1 : 0;
  }
  const C = challengeIndex.size;
  const E = entryIndex.size;

  const entryTasks: number[][] = Array.from({ length: E }, () => []);
  for (let t = 0; t < T; t += 1) entryTasks[taskEntry[t]!]!.push(t);

  // Symmetry classes: one per (challenge, building), each with its rooms.
  const classesOf: number[][][] = Array.from({ length: C }, () => []);
  const classKey = new Map<string, number[]>();
  for (let r = 0; r < R; r += 1) {
    const key = `${roomChallenge[r]}:${roomBuilding[r]}`;
    let rooms = classKey.get(key);
    if (!rooms) {
      rooms = [];
      classKey.set(key, rooms);
      classesOf[roomChallenge[r]!]!.push(rooms);
    }
    rooms.push(r);
  }
  const roomsOf: number[][] = Array.from({ length: C }, () => []);
  for (let r = 0; r < R; r += 1) roomsOf[roomChallenge[r]!]!.push(r);

  return {
    R,
    T,
    S,
    C,
    E,
    sameGap: inputs.sameGap,
    crossGap: relaxed ? inputs.sameGap : inputs.crossGap,
    roomChallenge,
    roomBuilding,
    taskChallenge,
    taskEntry,
    taskSponsor,
    entryTasks,
    classesOf,
    roomsOf,
    buildings: buildingIndex.size,
  };
}

type Model = ReturnType<typeof compile>;

/** Lower bounds per internal goal; -Infinity where nothing useful is known. */
function lowerBounds(m: Model): number[] {
  const busiest = (sponsorOnly: boolean) => {
    const count = new Int32Array(m.C);
    for (let t = 0; t < m.T; t += 1) {
      if (!sponsorOnly || m.taskSponsor[t]) count[m.taskChallenge[t]!]! += 1;
    }
    let most = 0;
    for (let c = 0; c < m.C; c += 1) {
      if (count[c]! > 0) {
        most = Math.max(most, Math.ceil(count[c]! / m.roomsOf[c]!.length));
      }
    }
    return most;
  };
  const chain = (n: number) => (n === 0 ? 0 : n + (n - 1) * m.sameGap);

  let sponsorChain = 0;
  let longestChain = 0;
  let changes = 0;
  for (const tasks of m.entryTasks) {
    longestChain = Math.max(longestChain, chain(tasks.length));
    sponsorChain = Math.max(
      sponsorChain,
      chain(tasks.filter((t) => m.taskSponsor[t]).length),
    );
    changes += fewestBuildings(m, tasks) - 1;
  }

  const sponsorFinish = Math.max(busiest(true), sponsorChain);
  return [
    0,
    sponsorFinish,
    0,
    Math.max(busiest(false), longestChain, sponsorFinish),
    Math.max(0, changes),
    -Infinity,
  ];
}

/**
 * The fewest buildings a project's presentations can be spread over: the
 * smallest set of buildings that has a room for each of its challenges. A
 * project visits each building once at best, so this minus one is the fewest
 * building changes it can make.
 */
function fewestBuildings(m: Model, tasks: readonly number[]): number {
  if (tasks.length < 2) return 1;
  const options = tasks.map((t) => {
    let mask = 0;
    for (const r of m.roomsOf[m.taskChallenge[t]!]!) mask |= 1 << m.roomBuilding[r]!;
    return mask;
  });
  // Exact over subsets while buildings are few; otherwise a safe bound of 1.
  if (m.buildings > 16) return 1;
  let best = Infinity;
  for (let set = 1; set < 1 << m.buildings; set += 1) {
    if (options.every((mask) => (mask & set) !== 0)) {
      let size = 0;
      for (let s = set; s; s &= s - 1) size += 1;
      best = Math.min(best, size);
      if (best === 1) break;
    }
  }
  return best === Infinity ? 1 : best;
}

/** The working schedule: who is where, both ways round. */
class Board {
  readonly roomOf: Int32Array;
  readonly slotOf: Int32Array;
  readonly grid: Int32Array;

  constructor(private readonly m: Model) {
    this.roomOf = new Int32Array(m.T).fill(-1);
    this.slotOf = new Int32Array(m.T).fill(-1);
    this.grid = new Int32Array(m.R * m.S).fill(-1);
  }

  copyFrom(other: Board) {
    this.roomOf.set(other.roomOf);
    this.slotOf.set(other.slotOf);
    this.grid.set(other.grid);
  }

  place(t: number, r: number, s: number) {
    this.roomOf[t] = r;
    this.slotOf[t] = s;
    this.grid[r * this.m.S + s] = t;
  }

  lift(t: number) {
    const r = this.roomOf[t]!;
    if (r < 0) return;
    this.grid[r * this.m.S + this.slotOf[t]!] = -1;
    this.roomOf[t] = -1;
    this.slotOf[t] = -1;
  }

  /** Whether `t` may present in room `r` at slot `s`, given everyone placed. */
  fits(t: number, r: number, s: number): boolean {
    const m = this.m;
    if (this.grid[r * m.S + s] !== -1) return false;
    const building = m.roomBuilding[r]!;
    for (const u of m.entryTasks[m.taskEntry[t]!]!) {
      if (u === t) continue;
      const ru = this.roomOf[u]!;
      if (ru < 0) continue;
      const gap = m.roomBuilding[ru] === building ? m.sameGap : m.crossGap;
      const apart = Math.abs(s - this.slotOf[u]!) - 1;
      if (apart < gap) return false;
    }
    return true;
  }

  /** The six goals, unplaced first, lower is better. */
  score(out: Float64Array) {
    const m = this.m;
    let unplaced = 0;
    let sponsorFinish = 0;
    let finish = 0;
    for (let t = 0; t < m.T; t += 1) {
      const s = this.slotOf[t]!;
      if (s < 0) {
        unplaced += 1;
        continue;
      }
      if (s + 1 > finish) finish = s + 1;
      if (m.taskSponsor[t] && s + 1 > sponsorFinish) sponsorFinish = s + 1;
    }

    let idle = 0;
    for (let r = 0; r < m.R; r += 1) {
      let first = -1;
      let last = -1;
      let held = 0;
      const row = r * m.S;
      for (let s = 0; s < m.S; s += 1) {
        const t = this.grid[row + s]!;
        if (t < 0 || !m.taskSponsor[t]) continue;
        if (first < 0) first = s;
        last = s;
        held += 1;
      }
      if (held > 0) idle += last - first + 1 - held;
    }

    let changes = 0;
    let lessBreaks = 0;
    const order: number[] = [];
    for (const tasks of m.entryTasks) {
      if (tasks.length < 2) continue;
      order.length = 0;
      for (const t of tasks) if (this.slotOf[t]! >= 0) order.push(t);
      order.sort((a, b) => this.slotOf[a]! - this.slotOf[b]!);
      for (let i = 1; i < order.length; i += 1) {
        const a = order[i - 1]!;
        const b = order[i]!;
        if (m.roomBuilding[this.roomOf[a]!] !== m.roomBuilding[this.roomOf[b]!]) {
          changes += 1;
        }
        lessBreaks -= this.slotOf[b]! - this.slotOf[a]! - 1;
      }
    }

    out[UNPLACED] = unplaced;
    out[SPONSOR_FINISH] = sponsorFinish;
    out[SPONSOR_IDLE] = idle;
    out[FINISH] = finish;
    out[CHANGES] = changes;
    out[BREAKS] = lessBreaks;
  }
}

function lexCompare(a: Float64Array, b: Float64Array): number {
  for (let i = 0; i < GOALS; i += 1) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/**
 * First schedule: walk the grid slot by slot; every free room takes the
 * waiting presentation that is hardest to place (most presentations for its
 * project, then the one keeping its project in one building), sponsor
 * presentations in a first pass so sponsor judging packs at the start.
 */
function sweep(m: Model, board: Board) {
  const priority = (t: number) => m.entryTasks[m.taskEntry[t]!]!.length;
  for (const sponsorPass of [true, false]) {
    const waiting: number[][] = Array.from({ length: m.C }, () => []);
    for (let t = 0; t < m.T; t += 1) {
      if (board.roomOf[t]! < 0 && !!m.taskSponsor[t] === sponsorPass) {
        waiting[m.taskChallenge[t]!]!.push(t);
      }
    }
    for (const list of waiting) list.sort((a, b) => priority(b) - priority(a) || a - b);

    for (let s = 0; s < m.S; s += 1) {
      for (let r = 0; r < m.R; r += 1) {
        const list = waiting[m.roomChallenge[r]!]!;
        if (list.length === 0 || board.grid[r * m.S + s] !== -1) continue;
        let pick = -1;
        let pickHops = Infinity;
        for (let i = 0; i < list.length; i += 1) {
          const t = list[i]!;
          if (!board.fits(t, r, s)) continue;
          const hops = buildingHops(m, board, t, r);
          if (hops < pickHops) {
            pick = i;
            pickHops = hops;
            if (hops === 0) break;
          }
        }
        if (pick < 0) continue;
        const [t] = list.splice(pick, 1);
        board.place(t!, r, s);
      }
    }
  }
}

/** How many of `t`'s placed project-mates are in another building than `r`. */
function buildingHops(m: Model, board: Board, t: number, r: number): number {
  let hops = 0;
  for (const u of m.entryTasks[m.taskEntry[t]!]!) {
    if (u === t || board.roomOf[u]! < 0) continue;
    if (m.roomBuilding[board.roomOf[u]!] !== m.roomBuilding[r]) hops += 1;
  }
  return hops;
}

/** Nearest placed project-mate, in slots; S when there is none. */
function nearestMate(m: Model, board: Board, t: number, s: number): number {
  let nearest = m.S;
  for (const u of m.entryTasks[m.taskEntry[t]!]!) {
    if (u === t || board.slotOf[u]! < 0) continue;
    nearest = Math.min(nearest, Math.abs(s - board.slotOf[u]!));
  }
  return nearest;
}

/**
 * The exact part. Places every task in `freed`, each inside the caps, by
 * depth-first search: always the task with the fewest values left (and stop
 * at once if one has none), trying its best few values in goal order. Gives
 * up after the node budget. With `partial`, a task with no value is skipped
 * rather than failing the search, for completing an unfinished schedule.
 */
function repair(
  m: Model,
  board: Board,
  freed: number[],
  goal: number,
  caps: { sponsor: number; all: number },
  partial: boolean,
  counter: { nodes: number },
): boolean {
  const budgetEnd = counter.nodes + NODES_PER_TASK * freed.length + 8;
  const values = new Int32Array(m.R * m.S * 2);
  const keys = new Float64Array(m.R * m.S);

  // Every value for t inside the caps, one room per symmetry class and slot.
  const enumerate = (t: number, limit: number): number => {
    const cap = m.taskSponsor[t] ? Math.min(caps.sponsor, caps.all) : caps.all;
    let count = 0;
    for (const rooms of m.classesOf[m.taskChallenge[t]!]!) {
      for (let s = 0; s < cap; s += 1) {
        for (const r of rooms) {
          if (board.grid[r * m.S + s] !== -1) continue;
          // Rooms in a class differ only by occupancy: the first free one
          // stands for all of them, so either it fits or none does.
          if (board.fits(t, r, s)) {
            values[count * 2] = r;
            values[count * 2 + 1] = s;
            count += 1;
            if (count >= limit) return count;
          }
          break;
        }
      }
    }
    return count;
  };

  const keyOf = (t: number, r: number, s: number) => {
    const hops = buildingHops(m, board, t, r);
    switch (goal) {
      case CHANGES:
        return hops * m.S + s;
      case BREAKS:
        // Furthest from its project-mates, then earliest.
        return -nearestMate(m, board, t, s) * m.S + s + hops * m.S * m.S;
      default:
        return s * 4 + hops;
    }
  };

  const remaining = freed.slice();
  const placedHere: number[] = [];

  const search = (): boolean => {
    if (remaining.length === 0) return true;
    if (counter.nodes > budgetEnd) return false;

    // Fail-first: fewest values. Counting stops early past the best so far.
    let pickIndex = -1;
    let pickCount = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const count = enumerate(remaining[i]!, Math.min(pickCount, 64));
      if (count < pickCount) {
        pickCount = count;
        pickIndex = i;
        if (count === 0) break;
      }
    }
    const t = remaining[pickIndex]!;
    remaining.splice(pickIndex, 1);

    if (pickCount === 0) {
      if (partial) {
        const done = search();
        if (!done) remaining.splice(pickIndex, 0, t);
        return done;
      }
      remaining.splice(pickIndex, 0, t);
      return false;
    }

    const count = enumerate(t, Infinity);
    for (let i = 0; i < count; i += 1) {
      keys[i] = keyOf(t, values[i * 2]!, values[i * 2 + 1]!);
    }
    // Best few by key, kept in order (count is at most a few hundred).
    const chosen: number[] = [];
    for (let i = 0; i < count; i += 1) {
      let at = chosen.length;
      while (at > 0 && keys[chosen[at - 1]!]! > keys[i]!) at -= 1;
      if (at < BRANCH) {
        chosen.splice(at, 0, i);
        if (chosen.length > BRANCH) chosen.pop();
      }
    }
    const tries = chosen.map((i) => [values[i * 2]!, values[i * 2 + 1]!] as const);

    for (const [r, s] of tries) {
      counter.nodes += 1;
      board.place(t, r, s);
      placedHere.push(t);
      if (search()) return true;
      placedHere.pop();
      board.lift(t);
      if (counter.nodes > budgetEnd) break;
    }
    remaining.splice(pickIndex, 0, t);
    return false;
  };

  return search();
}

/** Picks what to free so that `goal` has room to improve. */
function neighbourhood(
  m: Model,
  board: Board,
  goal: number,
  score: Float64Array,
  random: () => number,
): number[] {
  const freed = new Set<number>();
  // Breaks only need small shuffles; a smaller neighbourhood repairs faster.
  const most = goal === BREAKS ? MAX_FREED / 2 : MAX_FREED;
  const add = (t: number) => {
    if (t >= 0 && freed.size < most) freed.add(t);
  };
  const withMates = (t: number) => {
    add(t);
    for (const u of m.entryTasks[m.taskEntry[t]!]!) add(u);
  };
  const slotTasks = (s: number, sponsorOnly: boolean) => {
    for (let r = 0; r < m.R; r += 1) {
      const t = board.grid[r * m.S + s]!;
      if (t >= 0 && (!sponsorOnly || m.taskSponsor[t])) withMates(t);
    }
  };
  const window = (width: number, below: number) => {
    const end = Math.max(1, below);
    const from = Math.floor(random() * Math.max(1, end - width + 1));
    for (let s = from; s < Math.min(end, from + width); s += 1) slotTasks(s, false);
  };

  switch (goal) {
    case UNPLACED: {
      for (let t = 0; t < m.T; t += 1) if (board.roomOf[t]! < 0) withMates(t);
      window(3, m.S);
      break;
    }
    case SPONSOR_FINISH:
      slotTasks(score[SPONSOR_FINISH]! - 1, true);
      window(2 + Math.floor(random() * 3), score[SPONSOR_FINISH]! - 1);
      break;
    case FINISH:
      slotTasks(score[FINISH]! - 1, false);
      window(2 + Math.floor(random() * 3), score[FINISH]! - 1);
      break;
    case SPONSOR_IDLE: {
      // A sponsor room with a hole: everything in its busy span.
      const holed: number[] = [];
      for (let r = 0; r < m.R; r += 1) {
        let first = -1;
        let last = -1;
        let held = 0;
        for (let s = 0; s < m.S; s += 1) {
          const t = board.grid[r * m.S + s]!;
          if (t < 0 || !m.taskSponsor[t]) continue;
          if (first < 0) first = s;
          last = s;
          held += 1;
        }
        if (held > 0 && last - first + 1 > held) holed.push(r);
      }
      if (holed.length === 0) break;
      const r = holed[Math.floor(random() * holed.length)]!;
      for (let s = 0; s < m.S; s += 1) {
        const t = board.grid[r * m.S + s]!;
        if (t >= 0 && m.taskSponsor[t]) withMates(t);
      }
      break;
    }
    case CHANGES:
    case BREAKS: {
      const candidates: number[] = [];
      for (let e = 0; e < m.E; e += 1) {
        const tasks = m.entryTasks[e]!;
        if (tasks.length < 2) continue;
        if (goal === BREAKS) {
          candidates.push(e);
          continue;
        }
        const building = m.roomBuilding[board.roomOf[tasks[0]!]!];
        if (tasks.some((t) => m.roomBuilding[board.roomOf[t]!] !== building)) {
          candidates.push(e);
        }
      }
      if (goal === BREAKS) {
        // The projects with the least breathing room have the most to gain:
        // draw from the tightest fifth.
        const spread = (e: number) => {
          let first = m.S;
          let last = -1;
          for (const t of m.entryTasks[e]!) {
            first = Math.min(first, board.slotOf[t]!);
            last = Math.max(last, board.slotOf[t]!);
          }
          return last - first - m.entryTasks[e]!.length;
        };
        const tight = candidates
          .map((e) => [spread(e), e] as const)
          .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        candidates.length = 0;
        const pool = Math.max(4, Math.ceil(tight.length / 5));
        for (let i = 0; i < Math.min(pool, tight.length); i += 1) candidates.push(tight[i]![1]);
      }
      for (let k = 0; k < 4 && candidates.length > 0; k += 1) {
        const e = candidates[Math.floor(random() * candidates.length)]!;
        for (const t of m.entryTasks[e]!) withMates(t);
      }
      window(2 + Math.floor(random() * 2), score[FINISH]!);
      break;
    }
  }
  return [...freed];
}

/**
 * Building changes and breaks are per project, and a project's breaks are
 * just (last slot - first slot) - (presentations - 1): only its ends matter.
 * So trading two presentations of one challenge, or moving a general one to
 * a free cell, changes two projects at most, and its effect costs a handful
 * of operations to measure instead of a full rescore. Trades leave every
 * room's occupancy as it was, so sponsor finish, sponsor idle and the finish
 * cannot move; moves stay inside the current finish.
 *
 * Works through a queue of projects (all of them, or those in `only`); a
 * project that changes goes back on the queue along with its trade partner,
 * so later rounds touch only what moved. Fewer changes first, then more
 * breaks. Returns the tries spent, at most `budget`.
 */
function polish(
  m: Model,
  board: Board,
  finish: number,
  budget: number,
  only?: Uint8Array,
): number {
  // Lower is better. One building change outweighs any difference in spread
  // two projects can make between them.
  const weight = 2 * m.S + 1;
  const visits: number[] = [];
  const changesOf = new Int32Array(m.E);
  const cost = (e: number) => {
    visits.length = 0;
    for (const t of m.entryTasks[e]!) if (board.slotOf[t]! >= 0) visits.push(t);
    if (visits.length < 2) return 0;
    visits.sort((a, b) => board.slotOf[a]! - board.slotOf[b]!);
    let changes = 0;
    for (let i = 1; i < visits.length; i += 1) {
      const before = m.roomBuilding[board.roomOf[visits[i - 1]!]!];
      if (before !== m.roomBuilding[board.roomOf[visits[i]!]!]) changes += 1;
    }
    changesOf[e] = changes;
    const spread = board.slotOf[visits[visits.length - 1]!]! - board.slotOf[visits[0]!]!;
    return changes * weight - spread;
  };

  const cached = new Float64Array(m.E);
  const queued = new Uint8Array(m.E);
  const queue: number[] = [];
  const enqueue = (e: number) => {
    if (queued[e] || m.entryTasks[e]!.length < 2) return;
    queued[e] = 1;
    queue.push(e);
  };
  for (let e = 0; e < m.E; e += 1) {
    cached[e] = cost(e);
    if (!only || only[e]) enqueue(e);
  }

  // A project already at its own fewest possible building changes can only
  // gain breaks, and breaks only grow by moving outside its current span.
  const leastChanges = m.entryTasks.map((tasks) => fewestBuildings(m, tasks) - 1);

  // Tries trading `t` with whoever sits in (r, s), or moving it there if the
  // cell is free (general presentations only: sponsor rooms keep their
  // occupancy so sponsor idle cannot move). Keeps the change if the two
  // projects' cost drops; true if it did.
  const attempt = (t: number, e: number, r: number, s: number): boolean => {
    const u = board.grid[r * m.S + s]!;
    if (u === t) return false;
    const r1 = board.roomOf[t]!;
    const s1 = board.slotOf[t]!;
    if (u < 0) {
      if (m.taskSponsor[t]) return false;
      tries += 1;
      board.lift(t);
      if (board.fits(t, r, s)) {
        board.place(t, r, s);
        const ce = cost(e);
        if (ce < cached[e]!) {
          cached[e] = ce;
          return true;
        }
        board.lift(t);
      }
      board.place(t, r1, s1);
      cost(e);
      return false;
    }
    const f = m.taskEntry[u]!;
    if (f === e) return false;
    tries += 1;
    const before = cached[e]! + cached[f]!;
    board.lift(t);
    board.lift(u);
    if (board.fits(t, r, s)) {
      board.place(t, r, s);
      if (board.fits(u, r1, s1)) {
        board.place(u, r1, s1);
        const ce = cost(e);
        const cf = cost(f);
        if (ce + cf < before) {
          cached[e] = ce;
          cached[f] = cf;
          enqueue(f);
          return true;
        }
        board.lift(u);
      }
      board.lift(t);
    }
    board.place(t, r1, s1);
    board.place(u, r, s);
    // The trial costs overwrote the cached change counts; put them back.
    cost(e);
    cost(f);
    return false;
  };

  // Whether t's own project-mates leave it room at slot s in building b. The
  // same for every room of a class, so one check rules out the whole class.
  const mateRoom = (t: number, b: number, s: number) => {
    for (const v of m.entryTasks[m.taskEntry[t]!]!) {
      if (v === t || board.roomOf[v]! < 0) continue;
      const gap = m.roomBuilding[board.roomOf[v]!] === b ? m.sameGap : m.crossGap;
      if (Math.abs(s - board.slotOf[v]!) - 1 < gap) return false;
    }
    return true;
  };

  let tries = 0;
  for (let head = 0; head < queue.length && tries < budget; head += 1) {
    const e = queue[head]!;
    queued[e] = 0;
    let first = m.S;
    let last = -1;
    for (const v of m.entryTasks[e]!) {
      first = Math.min(first, board.slotOf[v]!);
      last = Math.max(last, board.slotOf[v]!);
    }
    const tangled = changesOf[e]! > leastChanges[e]!;

    let moved = false;
    for (const t of m.entryTasks[e]!) {
      const classes = m.classesOf[m.taskChallenge[t]!]!;
      const stop = tries + TRIALS_PER_TASK;
      if (tangled) {
        // Every cell of the challenge: untangling may need a move inward.
        for (let s = 0; s < finish && !moved && tries < stop; s += 1) {
          for (const rooms of classes) {
            if (!mateRoom(t, m.roomBuilding[rooms[0]!]!, s)) continue;
            for (const r of rooms) {
              if (attempt(t, e, r, s)) {
                moved = true;
                break;
              }
            }
            if (moved) break;
          }
        }
      } else {
        // Outside the span only, furthest first: the biggest gains come
        // first and the first one that helps is taken.
        for (let k = 0; k < finish && !moved && tries < stop; k += 1) {
          const s = k % 2 === 0 ? k >> 1 : finish - 1 - (k >> 1);
          if (s >= first && s <= last) continue;
          for (const rooms of classes) {
            if (!mateRoom(t, m.roomBuilding[rooms[0]!]!, s)) continue;
            for (const r of rooms) {
              if (attempt(t, e, r, s)) {
                moved = true;
                break;
              }
            }
            if (moved) break;
          }
        }
      }
      if (moved) break;
    }
    if (moved) enqueue(e);
  }
  return tries;
}

const patienceFor = (goal: number) =>
  goal === UNPLACED ? UNPLACED_PATIENCE : PATIENCE;

function improve(
  m: Model,
  board: Board,
  bounds: number[],
  iterations: number,
  seed: number,
  stats: { iterations: number; improvements: number; nodes: number },
) {
  const random = generator(seed);
  const best = new Board(m);
  best.copyFrom(board);
  const current = new Float64Array(GOALS);
  const bestScore = new Float64Array(GOALS);
  const trial = new Float64Array(GOALS);
  board.score(current);
  bestScore.set(current);

  const saved = new Board(m);
  const stalled = new Int32Array(GOALS);
  const counter = { nodes: 0 };
  // Polishing tries per presentation; trades are cheap, so this is generous.
  const polishBudget = 400 * m.T;
  let polished = false;
  const afterPolish = new Board(m);
  let kicks = 0;

  for (let i = 0; i < iterations; i += 1) {
    let goal = -1;
    for (let g = 0; g < GOALS; g += 1) {
      if (current[g]! > bounds[g]! && stalled[g]! < patienceFor(g)) {
        goal = g;
        break;
      }
    }
    // Every goal at its bound or out of ideas. An unfinished schedule never
    // gets here: unplaced presentations make everything else meaningless.
    if (goal < 0 || (goal > UNPLACED && current[UNPLACED]! > 0)) break;

    // Changes and breaks go to the cheap trades first; the exact repair only
    // gets what trading cannot reach, and a few kicks to escape it.
    if (goal >= CHANGES && !polished) {
      polished = true;
      saved.copyFrom(board);
      stats.nodes += polish(m, board, current[FINISH]!, polishBudget);
      afterPolish.copyFrom(board);
      board.score(trial);
      if (lexCompare(trial, current) <= 0) {
        current.set(trial);
        if (lexCompare(current, bestScore) < 0) {
          bestScore.set(current);
          best.copyFrom(board);
          stats.improvements += 1;
        }
      } else {
        board.copyFrom(saved);
      }
      continue;
    }
    if (goal === BREAKS && (kicks += 1) > BREAKS_KICKS) break;
    stats.iterations += 1;

    const freed = neighbourhood(m, board, goal, current, random);
    if (freed.length === 0) {
      stalled[goal] = PATIENCE;
      continue;
    }

    saved.copyFrom(board);
    for (const t of freed) board.lift(t);
    const caps = {
      sponsor:
        goal === SPONSOR_FINISH ? current[SPONSOR_FINISH]! - 1 : current[SPONSOR_FINISH]! || m.S,
      all: goal === FINISH ? current[FINISH]! - 1 : current[UNPLACED]! > 0 ? m.S : current[FINISH]!,
    };
    if (goal === UNPLACED) caps.sponsor = m.S;
    const done = repair(m, board, freed, goal, caps, goal === UNPLACED, counter);

    if (done) board.score(trial);
    if (done && lexCompare(trial, current) <= 0) {
      const better = lexCompare(trial, current) < 0;
      current.set(trial);
      if (better) stalled.fill(0, goal);
      else stalled[goal] += 1;
      if (lexCompare(current, bestScore) < 0) {
        bestScore.set(current);
        best.copyFrom(board);
        stats.improvements += 1;
      }
    } else {
      board.copyFrom(saved);
      stalled[goal] += 1;
    }
  }

  stats.nodes += counter.nodes;
  board.copyFrom(best);
  // A last polish of the best schedule, which the kicks may have left with
  // trades still open.
  if (bestScore[UNPLACED] === 0 && polished) {
    const moved = new Uint8Array(m.E);
    for (let t = 0; t < m.T; t += 1) {
      if (board.roomOf[t] !== afterPolish.roomOf[t] || board.slotOf[t] !== afterPolish.slotOf[t]) {
        moved[m.taskEntry[t]!] = 1;
      }
    }
    stats.nodes += polish(m, board, bestScore[FINISH]!, polishBudget, moved);
    board.score(trial);
    if (lexCompare(trial, bestScore) < 0) bestScore.set(trial);
    else board.copyFrom(best);
  }
  return bestScore;
}

function placementsOf(m: Model, inputs: PlanInputs, board: Board): Placement[] {
  const out: Placement[] = [];
  for (let t = 0; t < m.T; t += 1) {
    if (board.roomOf[t]! < 0) continue;
    const task = inputs.tasks[t]!;
    out.push({
      entryId: task.entryId,
      challengeId: task.challengeId,
      roomId: inputs.rooms[board.roomOf[t]!]!.id,
      slot: board.slotOf[t]!,
    });
  }
  return out;
}

function seedFrom(m: Model, inputs: PlanInputs, board: Board, start: readonly Placement[]) {
  const roomIndex = new Map(inputs.rooms.map((room, i) => [room.id, i]));
  const taskIndex = new Map(
    inputs.tasks.map((task, i) => [taskKey(task.entryId, task.challengeId), i]),
  );
  for (const p of start) {
    const t = taskIndex.get(taskKey(p.entryId, p.challengeId));
    const r = roomIndex.get(p.roomId);
    if (t === undefined || r === undefined || board.roomOf[t]! >= 0) continue;
    if (m.roomChallenge[r] !== m.taskChallenge[t]) continue;
    if (!Number.isInteger(p.slot) || p.slot < 0 || p.slot >= m.S) continue;
    if (board.fits(t, r, p.slot)) board.place(t, r, p.slot);
  }
}

/**
 * Builds a schedule: full cross-building breaks first, and when no complete
 * schedule is found that way, the same-building break everywhere, flagged as
 * relaxed. Every schedule returned has passed `validateSchedule`. Same shape
 * as `solvePlan`, plus what the bounds proved.
 */
export function aamoghCPSolver(
  inputs: PlanInputs,
  options: AamoghOptions = {},
): AamoghResult {
  const stats = { iterations: 0, improvements: 0, nodes: 0 };
  const report = (bounds: number[], score: Float64Array | null): AamoghStats => ({
    ...stats,
    lowerBounds: bounds.slice(1).map((b) => (Number.isFinite(b) ? b : null)),
    proven: bounds.slice(1).map((b, g) => score !== null && score[g + 1] === b),
  });

  const capacity = capacityProblems(inputs);
  if (capacity.length > 0) {
    return {
      ok: false,
      diagnostics: capacity,
      stats: report(lowerBounds(compile(inputs, false)), null),
    };
  }

  const seed = hashOf(
    inputs.tasks.map((t) => taskKey(t.entryId, t.challengeId)).join("|") +
      `#${inputs.slots}:${inputs.sameGap}:${inputs.crossGap}`,
  );
  const iterations =
    options.iterations ?? Math.min(20_000, 2_000 + inputs.tasks.length * 12);

  let unplaced: PlanDiagnostic[] = [];
  let bounds: number[] = [];
  for (const relaxed of [false, true]) {
    if (relaxed && inputs.crossGap === inputs.sameGap) break;
    const m = compile(inputs, relaxed);
    bounds = lowerBounds(m);
    const board = new Board(m);
    if (options.start) seedFrom(m, inputs, board, options.start);
    sweep(m, board);
    const score = improve(m, board, bounds, iterations, seed, stats);

    if (score[UNPLACED]! > 0) {
      unplaced = [];
      for (let t = 0; t < m.T; t += 1) {
        if (board.roomOf[t]! >= 0) continue;
        unplaced.push({
          kind: "unplaced",
          entryId: inputs.tasks[t]!.entryId,
          challengeId: inputs.tasks[t]!.challengeId,
        });
      }
      continue;
    }

    const placements = placementsOf(m, inputs, board);
    const check = validateSchedule(inputs, placements, { relaxed });
    if (!check.valid) {
      throw new Error(
        `aamoghCPSolver built a schedule that breaks its own rules: ${check.errors.join(" ")}`,
      );
    }
    const publicScore: PlanScore = scoreSchedule(inputs, placements);
    const mine: PlanScore = [score[1]!, score[2]!, score[3]!, score[4]!, score[5]!];
    if (compareScores(publicScore, mine) !== 0) {
      throw new Error("aamoghCPSolver scored its schedule differently from scoreSchedule.");
    }
    return {
      ok: true,
      relaxed: check.reducedBreaks.length > 0,
      placements,
      score: publicScore,
      reducedBreaks: check.reducedBreaks,
      stats: report(bounds, score),
    };
  }

  return { ok: false, diagnostics: unplaced, stats: report(bounds, null) };
}
