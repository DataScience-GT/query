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
//              per-project costs, then exact re-seating one challenge at a
//              time, before the exact repair takes a fixed number of kicks.
//   complete   When the repair cannot finish a schedule, a min-conflicts
//              search looks for any complete one before breaks are relaxed,
//              and the repair improves that instead.
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
/** The same for completing a schedule before the completion search tries. */
const UNPLACED_PATIENCE = 60;
/** Most rounds of re-seating then sponsor moves when settling a schedule. */
const SETTLE_ROUNDS = 8;
/**
 * Building changes and breaks are settled by exact re-seating, which no
 * small repair improves on, so the exact repair instead gets a fixed number
 * of kicks: re-place a neighbourhood however it fits, settle again, keep the
 * result if it is no worse.
 */
const KICKS = 20;
/**
 * Cells the completion search may look at per presentation before the
 * relaxed retry takes over. Where a complete schedule existed, the
 * benchmarks needed under half of this.
 */
const COMPLETE_CELLS = 500;
/** Least number of moves a displaced presentation waits to retake its cell. */
const TENURE = 10;

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
  const challengeTasks: number[][] = Array.from({ length: C }, () => []);
  for (let t = 0; t < T; t += 1) challengeTasks[taskChallenge[t]!]!.push(t);

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
  const classOfRoom: number[][] = Array.from(
    { length: R },
    (_, r) => classKey.get(`${roomChallenge[r]}:${roomBuilding[r]}`)!,
  );

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
    challengeTasks,
    classesOf,
    classOfRoom,
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
    if (this.grid[r * this.m.S + s] !== -1) return false;
    return this.spaced(t, this.m.roomBuilding[r]!, s);
  }

  /**
   * Whether `t`'s placed project-mates leave it the breaks it needs at slot
   * `s` in building `b`. The same for every room there, free or not.
   */
  spaced(t: number, b: number, s: number): boolean {
    const m = this.m;
    for (const u of m.entryTasks[m.taskEntry[t]!]!) {
      if (u === t) continue;
      const ru = this.roomOf[u]!;
      if (ru < 0) continue;
      const gap = m.roomBuilding[ru] === b ? m.sameGap : m.crossGap;
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
      for (const t of tasks) if (this.slotOf[t]! >= 0) insertBySlot(order, this.slotOf, t);
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

/**
 * Adds presentation t to `list`, kept in slot order. Insertion beats a sort
 * call for the handful of presentations one project has.
 */
function insertBySlot(list: number[], slotOf: Int32Array, t: number) {
  let i = list.length;
  list.push(t);
  while (i > 0 && slotOf[list[i - 1]!]! > slotOf[t]!) {
    list[i] = list[i - 1]!;
    i -= 1;
  }
  list[i] = t;
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

/**
 * Finishes a schedule the repair could not, by min-conflicts search. A
 * waiting presentation takes the cell where it displaces the least: the
 * cell's occupant and any project-mates it would now be too close to, each
 * counted at its weight. Whoever it displaces waits instead and may not
 * retake the cell it lost for a while. Every move adds one to the weight of
 * everyone still waiting, so the hardest presentation goes next, the ones
 * that are hard to seat become expensive to displace, and the search does
 * not circle. Gives up after about `budget` cells looked at, leaving the
 * board as it found it. True if everything is placed.
 */
function complete(
  m: Model,
  board: Board,
  random: () => number,
  budget: number,
  counter: { nodes: number },
): boolean {
  const start = new Board(m);
  start.copyFrom(board);
  const weight = new Float64Array(m.T).fill(1);
  const lostCell = new Int32Array(m.T).fill(-1);
  const lostUntil = new Int32Array(m.T);
  const waiting: number[] = [];
  for (let t = 0; t < m.T; t += 1) if (board.roomOf[t]! < 0) waiting.push(t);
  const displaced: number[] = [];
  // The project-mates of t too close to slot s in building b, or their
  // total weight.
  const clashes = (t: number, b: number, s: number, out: number[] | null) => {
    let cost = 0;
    for (const u of m.entryTasks[m.taskEntry[t]!]!) {
      const ru = board.roomOf[u]!;
      if (u === t || ru < 0) continue;
      const gap = m.roomBuilding[ru] === b ? m.sameGap : m.crossGap;
      if (Math.abs(s - board.slotOf[u]!) - 1 >= gap) continue;
      cost += weight[u]!;
      out?.push(u);
    }
    return cost;
  };

  let work = 0;
  for (let step = 0; waiting.length > 0 && work < budget; step += 1) {
    let pick = 0;
    for (let i = 1; i < waiting.length; i += 1) {
      if (weight[waiting[i]!]! > weight[waiting[pick]!]!) pick = i;
    }
    const t = waiting[pick]!;

    // The cheapest cell, ties broken at random.
    let bestCost = Infinity;
    let bestCell = -1;
    let ties = 0;
    for (const rooms of m.classesOf[m.taskChallenge[t]!]!) {
      const b = m.roomBuilding[rooms[0]!]!;
      for (let s = 0; s < m.S; s += 1) {
        work += 1;
        const cost = clashes(t, b, s, null);
        if (cost > bestCost) continue;
        for (const r of rooms) {
          const cell = r * m.S + s;
          if (cell === lostCell[t] && step < lostUntil[t]!) continue;
          const u = board.grid[cell]!;
          const total = u < 0 ? cost : cost + weight[u]!;
          if (total < bestCost) {
            bestCost = total;
            bestCell = cell;
            ties = 1;
          } else if (total === bestCost && random() * (ties += 1) < 1) {
            bestCell = cell;
          }
          // Free rooms of a class are alike: the first stands for the rest.
          if (u < 0) break;
        }
      }
    }
    if (bestCell < 0) break;

    const r = Math.floor(bestCell / m.S);
    const s = bestCell % m.S;
    displaced.length = 0;
    if (board.grid[bestCell]! >= 0) displaced.push(board.grid[bestCell]!);
    clashes(t, m.roomBuilding[r]!, s, displaced);
    waiting[pick] = waiting[waiting.length - 1]!;
    waiting.pop();
    for (const u of displaced) {
      lostCell[u] = board.roomOf[u]! * m.S + board.slotOf[u]!;
      lostUntil[u] = step + TENURE + Math.floor(random() * TENURE);
      board.lift(u);
      waiting.push(u);
    }
    board.place(t, r, s);
    for (const u of waiting) weight[u] += 1;
  }
  counter.nodes += work;
  if (waiting.length === 0) return true;
  board.copyFrom(start);
  return false;
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
  const capOf = (t: number) =>
    m.taskSponsor[t] ? Math.min(caps.sponsor, caps.all) : caps.all;

  // Every value for t inside the caps, one room per symmetry class and slot.
  const enumerate = (t: number): number => {
    const cap = capOf(t);
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
          }
          break;
        }
      }
    }
    return count;
  };

  // How many values each freed task has, kept current as the search places
  // and lifts, so picking the next task is a scan rather than a recount.
  // Placing t at (r, s) changes only its project-mates' values (recounted)
  // and, when it took the last free room of its class at s, costs each other
  // task of its challenge that value.
  const n = freed.length;
  const waiting = new Uint8Array(n).fill(1);
  let left = n;
  const sizes = new Int32Array(n);
  for (let i = 0; i < n; i += 1) sizes[i] = enumerate(freed[i]!);
  const savedSizes = new Int32Array(n * (n + 1));
  let depth = 0;
  const update = (t: number, r: number, s: number) => {
    const e = m.taskEntry[t]!;
    const c = m.taskChallenge[t]!;
    const b = m.roomBuilding[r]!;
    let full = true;
    for (const q of m.classOfRoom[r]!) {
      if (board.grid[q * m.S + s] === -1) {
        full = false;
        break;
      }
    }
    for (let i = 0; i < n; i += 1) {
      if (!waiting[i]) continue;
      const u = freed[i]!;
      if (m.taskEntry[u] === e) sizes[i] = enumerate(u);
      else if (full && m.taskChallenge[u] === c && s < capOf(u) && board.spaced(u, b, s)) {
        sizes[i] -= 1;
      }
    }
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

  const search = (): boolean => {
    if (left === 0) return true;
    if (counter.nodes > budgetEnd) return false;

    // Fail-first: fewest values, counted up to 64 so that big domains tie
    // and go in the order they were freed.
    let pick = -1;
    let pickCount = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (!waiting[i]) continue;
      const count = Math.min(sizes[i]!, 64);
      if (count < pickCount) {
        pickCount = count;
        pick = i;
        if (count === 0) break;
      }
    }
    const t = freed[pick]!;
    waiting[pick] = 0;
    left -= 1;

    if (pickCount === 0) {
      if (partial && search()) return true;
      waiting[pick] = 1;
      left += 1;
      return false;
    }

    const count = enumerate(t);
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

    const at = depth * n;
    for (let i = 0; i < n; i += 1) savedSizes[at + i] = sizes[i]!;
    depth += 1;
    for (const [r, s] of tries) {
      counter.nodes += 1;
      board.place(t, r, s);
      update(t, r, s);
      if (search()) return true;
      board.lift(t);
      for (let i = 0; i < n; i += 1) sizes[i] = savedSizes[at + i]!;
      if (counter.nodes > budgetEnd) break;
    }
    depth -= 1;
    waiting[pick] = 1;
    left += 1;
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
 * Works through a queue of every project; a project that changes goes back
 * on the queue along with its trade partner, so later rounds touch only
 * what moved. Fewer changes first, then more breaks. Returns the tries
 * spent, at most `budget`.
 */
function polish(
  m: Model,
  board: Board,
  finish: number,
  budget: number,
): number {
  // Lower is better. One building change outweighs any difference in spread
  // two projects can make between them.
  const weight = 2 * m.S + 1;
  const visits: number[] = [];
  const changesOf = new Int32Array(m.E);
  const cost = (e: number) => {
    visits.length = 0;
    for (const t of m.entryTasks[e]!) {
      if (board.slotOf[t]! >= 0) insertBySlot(visits, board.slotOf, t);
    }
    if (visits.length < 2) return 0;
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
    enqueue(e);
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
    // The trial costs overwrite the cached change counts; a refused change
    // puts them back.
    const changesE = changesOf[e]!;
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
      changesOf[e] = changesE;
      return false;
    }
    const f = m.taskEntry[u]!;
    if (f === e) return false;
    tries += 1;
    const changesF = changesOf[f]!;
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
    changesOf[e] = changesE;
    changesOf[f] = changesF;
    return false;
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
            // The same for every room of a class: one check rules it out.
            if (!board.spaced(t, m.roomBuilding[rooms[0]!]!, s)) continue;
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
            if (!board.spaced(t, m.roomBuilding[rooms[0]!]!, s)) continue;
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

/**
 * Prices one presentation at many cells in a row, for the moves below: its
 * project-mates are gathered once, in slot order, and each price is then a
 * short scan. A price is the project's building changes times `weight`,
 * minus how far apart its first and last presentations are, so lower is
 * better and, with a weight above any spread the moves at hand can gain,
 * changes come first and breaks second; Infinity where a mate is too close.
 * Every presentation of the project must be placed.
 */
class Mates {
  private readonly slots: number[] = [];
  private readonly halls: number[] = [];
  private count = 0;
  private changes = 0;

  constructor(
    private readonly m: Model,
    private readonly board: Board,
    private readonly weight: number,
  ) {}

  /** Gathers the project-mates of presentation t. */
  of(t: number) {
    const { m, board, slots, halls } = this;
    let n = 0;
    for (const u of m.entryTasks[m.taskEntry[t]!]!) {
      if (u === t) continue;
      const s = board.slotOf[u]!;
      const hall = m.roomBuilding[board.roomOf[u]!]!;
      let j = n - 1;
      while (j >= 0 && slots[j]! > s) {
        slots[j + 1] = slots[j]!;
        halls[j + 1] = halls[j]!;
        j -= 1;
      }
      slots[j + 1] = s;
      halls[j + 1] = hall;
      n += 1;
    }
    let changes = 0;
    for (let i = 1; i < n; i += 1) if (halls[i] !== halls[i - 1]) changes += 1;
    this.count = n;
    this.changes = changes;
  }

  /** The project's price with the presentation at slot s in building b. */
  price(b: number, s: number): number {
    const { m, slots, halls, count: n } = this;
    if (n === 0) return 0;
    let at = 0;
    for (let i = 0; i < n; i += 1) {
      const gap = Math.abs(s - slots[i]!) - 1;
      if (gap < (halls[i] === b ? m.sameGap : m.crossGap)) return Infinity;
      if (slots[i]! < s) at = i + 1;
    }
    let changes = this.changes;
    if (at > 0 && at < n && halls[at - 1] !== halls[at]) changes -= 1;
    if (at > 0 && halls[at - 1] !== b) changes += 1;
    if (at < n && halls[at] !== b) changes += 1;
    return changes * this.weight - (Math.max(slots[n - 1]!, s) - Math.min(slots[0]!, s));
  }
}

/**
 * Sponsor idle is a room-by-room matter: each sponsor room's presentations
 * should run unbroken. This moves sponsor presentations to free cells of
 * their challenge before the sponsor finish, each to the cell that cuts the
 * most idle, then the most building changes, then adds the most breaks,
 * round after round until no move helps or `budget` trials are spent. A move
 * touches two rooms and one project, so a trial costs two row scans and one
 * short itinerary. While the finish is still open (`settled` false), only
 * moves that cut idle are made: spreading sponsor presentations out for
 * breaks can leave the general ones no room to finish earlier. Returns the
 * trials spent.
 */
function compact(
  m: Model,
  board: Board,
  sponsorFinish: number,
  settled: boolean,
  budget: number,
): number {
  // Each room's sponsor presentations: first and last slot, and how many.
  const firstOf = new Int32Array(m.R);
  const lastOf = new Int32Array(m.R);
  const heldOf = new Int32Array(m.R);
  const sponsorAt = (r: number, s: number) => {
    const t = board.grid[r * m.S + s]!;
    return t >= 0 && m.taskSponsor[t] === 1;
  };
  const measure = (r: number) => {
    firstOf[r] = -1;
    lastOf[r] = -1;
    heldOf[r] = 0;
    for (let s = 0; s < m.S; s += 1) {
      if (!sponsorAt(r, s)) continue;
      if (firstOf[r]! < 0) firstOf[r] = s;
      lastOf[r] = s;
      heldOf[r] += 1;
    }
  };
  for (let r = 0; r < m.R; r += 1) measure(r);
  const idleOf = (first: number, last: number, held: number) =>
    held > 0 ? last - first + 1 - held : 0;
  // The same with one more presentation at slot s.
  const idleWith = (first: number, last: number, held: number, s: number) =>
    held > 0 ? Math.max(last, s) - Math.min(first, s) - held : 0;
  const mates = new Mates(m, board, 2 * m.S + 1);

  let tries = 0;
  let moved = true;
  while (moved && tries < budget) {
    moved = false;
    for (let x = 0; x < m.T && tries < budget; x += 1) {
      if (!m.taskSponsor[x]) continue;
      const r0 = board.roomOf[x]!;
      const s0 = board.slotOf[x]!;
      const idle0 = idleOf(firstOf[r0]!, lastOf[r0]!, heldOf[r0]!);
      // Room r0 without x.
      let first0 = firstOf[r0]!;
      let last0 = lastOf[r0]!;
      const held0 = heldOf[r0]! - 1;
      if (held0 > 0 && s0 === first0) while (!sponsorAt(r0, ++first0));
      if (held0 > 0 && s0 === last0) while (!sponsorAt(r0, --last0));
      const idleLeft = idleOf(first0, last0, held0) - idle0;
      mates.of(x);
      const cost0 = mates.price(m.roomBuilding[r0]!, s0);
      let bestIdle = 0;
      let bestCost = 0;
      let bestRoom = -1;
      let bestSlot = -1;
      for (const r of m.roomsOf[m.taskChallenge[x]!]!) {
        const b = m.roomBuilding[r]!;
        const idleHere = idleOf(firstOf[r]!, lastOf[r]!, heldOf[r]!);
        for (let s = 0; s < sponsorFinish; s += 1) {
          if (board.grid[r * m.S + s] !== -1) continue;
          const price = mates.price(b, s);
          if (price === Infinity) continue;
          tries += 1;
          const idle =
            r === r0
              ? idleWith(first0, last0, held0, s) - idle0
              : idleLeft + idleWith(firstOf[r]!, lastOf[r]!, heldOf[r]!, s) - idleHere;
          if (idle > bestIdle) continue;
          const cost = price - cost0;
          if (idle < bestIdle || (cost < bestCost && (idle < 0 || settled))) {
            bestIdle = idle;
            bestCost = cost;
            bestRoom = r;
            bestSlot = s;
          }
        }
      }
      if (bestRoom < 0) continue;
      board.lift(x);
      board.place(x, bestRoom, bestSlot);
      measure(r0);
      measure(bestRoom);
      moved = true;
    }

    // A hole no single move fills may still close by sliding everything on
    // one side of it a slot towards it. Each presentation that slides needs
    // only its own project's breaks one slot over, and the room's span
    // shrinks by one either way, so the cheapest slide in the room wins.
    for (let r = 0; r < m.R && tries < budget; r += 1) {
      const row = r * m.S;
      const b = m.roomBuilding[r]!;
      let first = -1;
      let last = -1;
      for (let s = 0; s < m.S; s += 1) {
        const t = board.grid[row + s]!;
        if (t < 0) continue;
        if (!m.taskSponsor[t]) {
          first = -1;
          break;
        }
        if (first < 0) first = s;
        last = s;
      }
      if (first < 0) continue;
      let bestCost = Infinity;
      let bestFrom = -1;
      let bestTo = -1;
      let bestStep = 0;
      for (let h = first + 1; h < last; h += 1) {
        if (board.grid[row + h] !== -1) continue;
        for (const step of [-1, 1]) {
          const from = step < 0 ? h + 1 : first;
          const to = step < 0 ? last : h - 1;
          let cost = 0;
          for (let s = from; s <= to && cost < bestCost; s += 1) {
            const t = board.grid[row + s]!;
            if (t < 0) continue;
            tries += 1;
            mates.of(t);
            cost += mates.price(b, s + step) - mates.price(b, s);
          }
          if (cost < bestCost) {
            bestCost = cost;
            bestFrom = from;
            bestTo = to;
            bestStep = step;
          }
        }
      }
      if (bestStep === 0) continue;
      const sliding: number[] = [];
      for (let s = bestFrom; s <= bestTo; s += 1) {
        if (board.grid[row + s]! >= 0) sliding.push(board.grid[row + s]!, s);
      }
      for (let i = 0; i < sliding.length; i += 2) board.lift(sliding[i]!);
      for (let i = 0; i < sliding.length; i += 2) {
        board.place(sliding[i]!, r, sliding[i + 1]! + bestStep);
      }
      measure(r);
      moved = true;
    }
  }
  return tries;
}

/**
 * Within one challenge every presentation belongs to a different project,
 * so with the other challenges held still each presentation has a fixed
 * cost in each cell, and re-seating the whole challenge is an assignment
 * problem. This solves it exactly, one challenge at a time, by cancelling
 * negative cycles over (class, slot) cells: one presentation moves to
 * another cell, the one there moves on, and so on back to the start or
 * into a free seat, whenever together they make fewer building changes or
 * more breaks. Sponsor challenges keep the cells they hold, so sponsor idle
 * and the sponsor finish stay as they are; general presentations may take
 * any free cell before the finish. Rounds repeat while any challenge
 * improves, up to `budget` units of work. Returns the work spent.
 */
function reassign(
  m: Model,
  board: Board,
  finish: number,
  budget: number,
  seated: { board: Board; finish: number },
): number {
  // A single move shifts at most one project's spread, by less than S, so
  // one building change outweighs any cycle's worth of spread.
  const mates = new Mates(m, board, m.S * m.T + 1);
  // `seated` is the last schedule on which no challenge could improve. A
  // challenge's problem is its own cells and its projects' other
  // presentations, so only challenges with a project that has moved since
  // need solving again, and each move made here dirties its project's.
  const dirty = new Uint8Array(m.C);
  const touch = (t: number) => {
    for (const u of m.entryTasks[m.taskEntry[t]!]!) dirty[m.taskChallenge[u]!] = 1;
  };
  if (seated.finish !== finish) dirty.fill(1);
  else {
    for (let t = 0; t < m.T; t += 1) {
      if (board.roomOf[t] !== seated.board.roomOf[t] || board.slotOf[t] !== seated.board.slotOf[t]) {
        touch(t);
      }
    }
  }
  // Round and round the challenges, so each gets a turn before any second.
  const nextDirty = (from: number) => {
    for (let i = 0; i < m.C; i += 1) if (dirty[(from + i) % m.C]) return (from + i) % m.C;
    return -1;
  };
  let work = 0;
  for (let c = nextDirty(0); c >= 0 && work < budget; c = nextDirty(c + 1)) {
    const classes = m.classesOf[c]!;
    const fixed = m.challengeTasks[c]!.some((t) => m.taskSponsor[t]);
    // Cell (k, s) is node k * finish + s; node K is the pool of free seats.
    const K = classes.length * finish;
    const N = K + 1;
    const cap = new Int32Array(K);
    const load = new Int32Array(K);
    const nodeHall = new Int32Array(K);
    const nodeSlot = new Int32Array(K);
    for (let u = 0; u < K; u += 1) {
      for (const r of classes[Math.floor(u / finish)]!) {
        if (board.grid[r * m.S + (u % finish)]! >= 0) load[u] += 1;
      }
      cap[u] = fixed ? load[u]! : classes[Math.floor(u / finish)]!.length;
      nodeHall[u] = m.roomBuilding[classes[Math.floor(u / finish)]![0]!]!;
      nodeSlot[u] = u % finish;
    }

    // weights[u * N + v]: the cheapest move of one presentation from u to
    // v, and moves[u * N + v] which one it is.
    const weights = new Float64Array(N * N);
    const moves = new Int32Array(N * N);
    const edgesFrom = (u: number) => {
      weights.fill(Infinity, u * N, u * N + N);
      if (load[u]! < cap[u]!) weights[u * N + K] = 0;
      weights[K * N + u] = load[u]! > 0 ? 0 : Infinity;
      const s = u % finish;
      for (const r of classes[Math.floor(u / finish)]!) {
        const t = board.grid[r * m.S + s]!;
        if (t < 0) continue;
        mates.of(t);
        const here = mates.price(m.roomBuilding[r]!, s);
        for (let v = 0; v < K; v += 1) {
          if (v === u || cap[v] === 0) continue;
          work += 1;
          const delta = mates.price(nodeHall[v]!, nodeSlot[v]!) - here;
          if (delta < weights[u * N + v]!) {
            weights[u * N + v] = delta;
            moves[u * N + v] = t;
          }
        }
      }
    };
    weights.fill(Infinity, K * N, N * N);
    for (let u = 0; u < K; u += 1) edgesFrom(u);

    const dist = new Float64Array(N);
    const pred = new Int32Array(N);
    const mark = new Int32Array(N);
    const queue = new Int32Array(N);
    const inQueue = new Uint8Array(N);
    const cycle: number[] = [];
    const vacated: number[] = [];
    let solved = false;
    while (work < budget) {
      // Bellman-Ford from every node at once, queue-driven so that only
      // nodes whose distance fell are rescanned. Any cycle among the
      // predecessors is a negative one, so they are checked every few scans
      // (a check costs about one scan); an empty queue means there is none.
      dist.fill(0);
      pred.fill(-1);
      let head = 0;
      let queued = N;
      for (let u = 0; u < N; u += 1) {
        queue[u] = u;
        inQueue[u] = 1;
      }
      let x = -1;
      for (let scans = 1; queued > 0 && x < 0; scans += 1) {
        const u = queue[head]!;
        head = head + 1 === N ? 0 : head + 1;
        queued -= 1;
        inQueue[u] = 0;
        const du = dist[u]!;
        const row = u * N;
        for (let v = 0; v < N; v += 1) {
          const w = weights[row + v]!;
          if (du + w < dist[v]!) {
            dist[v] = du + w;
            pred[v] = u;
            if (!inQueue[v]) {
              queue[(head + queued) % N] = v;
              inQueue[v] = 1;
              queued += 1;
            }
          }
        }
        work += N;
        if (scans % 8 !== 0) continue;
        mark.fill(-1);
        for (let start = 0; start < N && x < 0; start += 1) {
          let y = start;
          while (y >= 0 && mark[y] === -1) {
            mark[y] = start;
            y = pred[y]!;
          }
          if (y >= 0 && mark[y] === start) x = y;
        }
      }
      if (x < 0) {
        solved = true;
        break;
      }
      cycle.length = 0;
      let y = x;
      do {
        cycle.push(y);
        y = pred[y]!;
      } while (y !== x);

      // Lift everyone moving, then seat each in a cell its predecessor
      // left (a sponsor room keeps its occupancy) or else a free one.
      const moving: number[] = [];
      for (const v of cycle) {
        const u = pred[v]!;
        if (u === K || v === K) continue;
        const t = moves[u * N + v]!;
        moving.push(t, v);
        load[u] -= 1;
        load[v] += 1;
      }
      vacated.length = 0;
      for (let i = 0; i < moving.length; i += 2) {
        const t = moving[i]!;
        vacated.push(board.roomOf[t]! * m.S + board.slotOf[t]!);
        board.lift(t);
      }
      for (let i = 0; i < moving.length; i += 2) {
        const v = moving[i + 1]!;
        const s = v % finish;
        const rooms = classes[Math.floor(v / finish)]!;
        let room = -1;
        for (let j = 0; j < rooms.length && room < 0; j += 1) {
          const cell = rooms[j]! * m.S + s;
          if (vacated.includes(cell) && board.grid[cell] === -1) room = rooms[j]!;
        }
        for (let j = 0; j < rooms.length && room < 0; j += 1) {
          if (board.grid[rooms[j]! * m.S + s] === -1) room = rooms[j]!;
        }
        board.place(moving[i]!, room, s);
      }
      for (let i = 0; i < moving.length; i += 2) touch(moving[i]!);
      for (const v of cycle) if (v !== K) edgesFrom(v);
    }
    if (solved) dirty[c] = 0;
  }
  if (dirty.indexOf(1) < 0) {
    seated.board.copyFrom(board);
    seated.finish = finish;
  }
  return work;
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
  const next = new Float64Array(GOALS);
  board.score(current);
  bestScore.set(current);

  const saved = new Board(m);
  const stalled = new Int32Array(GOALS);
  const counter = { nodes: 0 };
  // Polishing tries per presentation; trades are cheap, so this is generous.
  const polishBudget = 400 * m.T;
  // Re-seating work per round: a few hundred cost checks per presentation
  // covers the cells of every class it might move to, many times over.
  const reassignBudget = 2000 * m.T;
  let compacted = false;
  let polished = false;
  let kicks = 0;
  const seated = { board: new Board(m), finish: -1 };

  // Keeps the board if it scores no worse than `current`, otherwise puts
  // `saved` back. True if it scored better.
  const keepIfNoWorse = (): boolean => {
    board.score(trial);
    const order = lexCompare(trial, current);
    if (order > 0) {
      board.copyFrom(saved);
      return false;
    }
    current.set(trial);
    if (lexCompare(current, bestScore) < 0) {
      bestScore.set(current);
      best.copyFrom(board);
      stats.improvements += 1;
    }
    return order < 0;
  };

  // Sponsor moves, then exact re-seating and sponsor moves in turn for as
  // long as the pair helps.
  const settle = () => {
    stats.nodes += compact(m, board, current[SPONSOR_FINISH]!, true, polishBudget);
    board.score(trial);
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
      stats.nodes += reassign(m, board, current[FINISH]!, reassignBudget, seated);
      stats.nodes += compact(m, board, current[SPONSOR_FINISH]!, true, polishBudget);
      board.score(next);
      if (lexCompare(next, trial) >= 0) break;
      trial.set(next);
    }
  };

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

    // Once the sponsor finish has settled, sponsor idle gets single moves
    // before any exact repair.
    if (goal >= SPONSOR_IDLE && !compacted) {
      compacted = true;
      saved.copyFrom(board);
      const settled = goal > FINISH || current[FINISH]! <= bounds[FINISH]!;
      stats.nodes += compact(m, board, current[SPONSOR_FINISH]!, settled, polishBudget);
      keepIfNoWorse();
      continue;
    }

    // Changes and breaks go to the cheap trades first, then to settling.
    if (goal >= CHANGES && !polished) {
      polished = true;
      saved.copyFrom(board);
      stats.nodes += polish(m, board, current[FINISH]!, polishBudget);
      settle();
      keepIfNoWorse();
      continue;
    }
    // After that each round is a kick: the exact repair re-places a
    // neighbourhood any way it can inside the finishes, whatever that does
    // to changes and breaks, and settling from there is kept if it lands
    // no worse than before.
    if (goal >= CHANGES && (kicks += 1) > KICKS) break;
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
    if (!done) {
      board.copyFrom(saved);
      stalled[goal] += 1;
      continue;
    }
    if (goal >= CHANGES) settle();
    if (keepIfNoWorse()) stalled.fill(0, goal);
    else stalled[goal] += 1;
  }

  stats.nodes += counter.nodes;
  board.copyFrom(best);
  // A last polish of the best schedule, which the kicks may have left with
  // trades still open.
  if (bestScore[UNPLACED] === 0 && polished) {
    stats.nodes += polish(m, board, bestScore[FINISH]!, polishBudget);
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
    let score = improve(m, board, bounds, iterations, seed, stats);
    if (score[UNPLACED]! > 0 && complete(m, board, generator(seed), COMPLETE_CELLS * m.T, stats)) {
      score = improve(m, board, bounds, iterations, seed, stats);
    }

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
