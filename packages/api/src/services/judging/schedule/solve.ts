import type { Placement, PlanInputs, PlanRoom, PlanTask } from "./inputs";
import { scoreSchedule, validateSchedule } from "./rules";
import type { PlanScore, ReducedBreak } from "./rules";

// A deterministic heuristic scheduler. It builds a schedule greedily, repairs
// what the greedy pass could not place with augmenting paths, then improves
// it by local search under a fixed budget of evaluated moves. Nothing here
// reads the clock or a random source, and every loop runs in id order, so the
// same inputs always give the same schedule: saving re-solves on the server
// and compares the result with what the organiser previewed.

/** Why a schedule could not be built, for the router to put into words. */
export type PlanDiagnostic =
  | {
      kind: "capacity";
      challengeId: string;
      presentations: number;
      rooms: number;
      capacity: number;
    }
  | {
      kind: "overload";
      entryId: string;
      presentations: number;
      slotsNeeded: number;
      slots: number;
    }
  | { kind: "unplaced"; entryId: string; challengeId: string };

export type PlanResult =
  | {
      ok: true;
      /** Some change of building got only the same-building break. */
      relaxed: boolean;
      placements: Placement[];
      score: PlanScore;
      reducedBreaks: ReducedBreak[];
    }
  | { ok: false; diagnostics: PlanDiagnostic[] };

// Budgets. Counted in work, not time, so a slow machine gives the same answer
// as a fast one. Sized so 300 projects in 12 rooms solves in about a second.
const BUILD_ROUNDS = 12;
const SEARCH_PASSES = 40;
const SEARCH_EVALUATIONS = 1_500_000;

/**
 * Necessary conditions: a challenge cannot have more presentations than its
 * rooms have slots, and a project cannot have more presentations than fit in
 * the window with the shortest break between each. Passing these does not
 * promise a schedule exists.
 */
export function capacityProblems(inputs: PlanInputs): PlanDiagnostic[] {
  const problems: PlanDiagnostic[] = [];
  const roomsPer = new Map<string, number>();
  for (const room of inputs.rooms) {
    roomsPer.set(room.challengeId, (roomsPer.get(room.challengeId) ?? 0) + 1);
  }
  const perChallenge = new Map<string, number>();
  const perEntry = new Map<string, number>();
  for (const task of inputs.tasks) {
    perChallenge.set(
      task.challengeId,
      (perChallenge.get(task.challengeId) ?? 0) + 1,
    );
    perEntry.set(task.entryId, (perEntry.get(task.entryId) ?? 0) + 1);
  }

  for (const [challengeId, presentations] of perChallenge) {
    const rooms = roomsPer.get(challengeId) ?? 0;
    const capacity = rooms * inputs.slots;
    if (presentations > capacity) {
      problems.push({
        kind: "capacity",
        challengeId,
        presentations,
        rooms,
        capacity,
      });
    }
  }
  for (const [entryId, presentations] of perEntry) {
    const slotsNeeded = presentations + (presentations - 1) * inputs.sameGap;
    if (slotsNeeded > inputs.slots) {
      problems.push({
        kind: "overload",
        entryId,
        presentations,
        slotsNeeded,
        slots: inputs.slots,
      });
    }
  }
  return problems;
}

// Everything below works on array indexes into id-sorted rooms and tasks.
type Model = {
  rooms: PlanRoom[];
  tasks: PlanTask[];
  slots: number;
  sameGap: number;
  crossGap: number;
  roomBuilding: Int32Array;
  roomSponsor: Uint8Array;
  taskEntry: Int32Array;
  taskChallenge: Int32Array;
  taskSponsor: Uint8Array;
  entryTasks: number[][];
  challengeRooms: number[][];
  challengeTasks: number[][];
};

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function buildModel(inputs: PlanInputs, relaxed: boolean): Model {
  const rooms = [...inputs.rooms].sort((a, b) => compareIds(a.id, b.id));
  const tasks = [...inputs.tasks].sort(
    (a, b) =>
      compareIds(a.entryId, b.entryId) ||
      compareIds(a.challengeId, b.challengeId),
  );

  const challengeIndex = new Map<string, number>();
  const entryIndex = new Map<string, number>();
  const taskEntry = new Int32Array(tasks.length);
  const taskChallenge = new Int32Array(tasks.length);
  const taskSponsor = new Uint8Array(tasks.length);
  const entryTasks: number[][] = [];
  const challengeTasks: number[][] = [];
  const challengeSponsor: boolean[] = [];

  tasks.forEach((task, t) => {
    let c = challengeIndex.get(task.challengeId);
    if (c === undefined) {
      c = challengeTasks.length;
      challengeIndex.set(task.challengeId, c);
      challengeTasks.push([]);
      challengeSponsor.push(task.sponsor);
    }
    let e = entryIndex.get(task.entryId);
    if (e === undefined) {
      e = entryTasks.length;
      entryIndex.set(task.entryId, e);
      entryTasks.push([]);
    }
    taskEntry[t] = e;
    taskChallenge[t] = c;
    taskSponsor[t] = task.sponsor ? 1 : 0;
    entryTasks[e]!.push(t);
    challengeTasks[c]!.push(t);
  });

  const buildingIndex = new Map<string, number>();
  const roomBuilding = new Int32Array(rooms.length);
  const roomSponsor = new Uint8Array(rooms.length);
  const challengeRooms: number[][] = challengeTasks.map(() => []);
  rooms.forEach((room, r) => {
    let b = buildingIndex.get(room.buildingId);
    if (b === undefined) {
      b = buildingIndex.size;
      buildingIndex.set(room.buildingId, b);
    }
    roomBuilding[r] = b;
    const c = challengeIndex.get(room.challengeId);
    if (c === undefined) return;
    challengeRooms[c]!.push(r);
    roomSponsor[r] = challengeSponsor[c] ? 1 : 0;
  });

  return {
    rooms,
    tasks,
    slots: inputs.slots,
    sameGap: inputs.sameGap,
    crossGap: relaxed ? inputs.sameGap : inputs.crossGap,
    roomBuilding,
    roomSponsor,
    taskEntry,
    taskChallenge,
    taskSponsor,
    entryTasks,
    challengeRooms,
    challengeTasks,
  };
}

/** Who is where. Shared by the greedy build and the local search. */
class Layout {
  readonly slotOf: Int32Array;
  readonly roomOf: Int32Array;
  /** room * slots + slot → task, or -1 when free. */
  readonly cells: Int32Array;

  constructor(readonly m: Model) {
    this.slotOf = new Int32Array(m.tasks.length).fill(-1);
    this.roomOf = new Int32Array(m.tasks.length).fill(-1);
    this.cells = new Int32Array(m.rooms.length * m.slots).fill(-1);
  }

  occupant(r: number, s: number): number {
    return this.cells[r * this.m.slots + s]!;
  }

  /**
   * Whether task `t` at (r, s) keeps the required break to each of its
   * project's other placed presentations. Checking every pair is the same as
   * checking the neighbours in time: a farther presentation is separated by
   * at least one neighbour's break, and by a cross-building one whenever the
   * buildings differ. Does not look at whether the cell is free.
   */
  fits(t: number, r: number, s: number): boolean {
    const m = this.m;
    for (const o of m.entryTasks[m.taskEntry[t]!]!) {
      if (o === t) continue;
      const os = this.slotOf[o]!;
      if (os < 0) continue;
      const gap = (os > s ? os - s : s - os) - 1;
      if (gap < 0) return false;
      const need =
        m.roomBuilding[this.roomOf[o]!] === m.roomBuilding[r]
          ? m.sameGap
          : m.crossGap;
      if (gap < need) return false;
    }
    return true;
  }

  /** Places or moves `t`, freeing its old cell. */
  put(t: number, r: number, s: number) {
    const slots = this.m.slots;
    if (this.slotOf[t]! >= 0) {
      this.cells[this.roomOf[t]! * slots + this.slotOf[t]!] = -1;
    }
    this.cells[r * slots + s] = t;
    this.slotOf[t] = s;
    this.roomOf[t] = r;
  }

  placements(): Placement[] {
    return this.m.tasks.map((task, t) => ({
      entryId: task.entryId,
      challengeId: task.challengeId,
      roomId: this.m.rooms[this.roomOf[t]!]!.id,
      slot: this.slotOf[t]!,
    }));
  }
}

// ---------------------------------------------------------------------------
// Construction

/**
 * Placing order: tasks that failed earlier rounds first, then sponsor
 * presentations, then projects with the most presentations, then the most
 * crowded challenges, then id order.
 */
function buildOrder(m: Model, boost: Int32Array): number[] {
  const load = m.challengeTasks.map(
    (tasks, c) => tasks.length / m.challengeRooms[c]!.length,
  );
  const order = m.tasks.map((_, t) => t);
  order.sort(
    (a, b) =>
      boost[b]! - boost[a]! ||
      m.taskSponsor[b]! - m.taskSponsor[a]! ||
      m.entryTasks[m.taskEntry[b]!]!.length -
        m.entryTasks[m.taskEntry[a]!]!.length ||
      load[m.taskChallenge[b]!]! - load[m.taskChallenge[a]!]! ||
      a - b,
  );
  return order;
}

/** How many of a project's time-neighbours at slot `s` are in other buildings. */
function buildingSwitches(layout: Layout, t: number, r: number, s: number) {
  const m = layout.m;
  let before = -1;
  let after = -1;
  for (const o of m.entryTasks[m.taskEntry[t]!]!) {
    const os = layout.slotOf[o]!;
    if (o === t || os < 0) continue;
    if (os < s && (before < 0 || os > layout.slotOf[before]!)) before = o;
    if (os > s && (after < 0 || os < layout.slotOf[after]!)) after = o;
  }
  let switches = 0;
  for (const o of [before, after]) {
    if (o >= 0 && m.roomBuilding[layout.roomOf[o]!] !== m.roomBuilding[r]) {
      switches += 1;
    }
  }
  return switches;
}

/** The earliest free cell `t` fits in, preferring its neighbours' building. */
function placeEarliest(layout: Layout, t: number, from: number): boolean {
  const m = layout.m;
  const rooms = m.challengeRooms[m.taskChallenge[t]!]!;
  for (let s = from; s < m.slots; s += 1) {
    let best = -1;
    let bestSwitches = Infinity;
    for (const r of rooms) {
      if (layout.occupant(r, s) >= 0 || !layout.fits(t, r, s)) continue;
      const switches = buildingSwitches(layout, t, r, s);
      if (switches < bestSwitches) {
        best = r;
        bestSwitches = switches;
        if (switches === 0) break;
      }
    }
    if (best >= 0) {
      layout.put(t, best, s);
      return true;
    }
  }
  return false;
}

/**
 * Finds `t` a cell by moving other presentations of the same challenge out of
 * the way (an augmenting path). Within one challenge each project has a
 * single presentation, so with every other challenge held still this is
 * bipartite matching and finds a cell whenever one can be freed.
 */
function augment(layout: Layout, t: number, seen: Uint8Array): boolean {
  const m = layout.m;
  const rooms = m.challengeRooms[m.taskChallenge[t]!]!;
  for (let s = 0; s < m.slots; s += 1) {
    for (const r of rooms) {
      const cell = r * m.slots + s;
      if (seen[cell] || !layout.fits(t, r, s)) continue;
      seen[cell] = 1;
      const holder = layout.cells[cell]!;
      if (holder < 0 || augment(layout, holder, seen)) {
        layout.put(t, r, s);
        return true;
      }
    }
  }
  return false;
}

/**
 * Greedy rounds. A task left over after repair is moved up the order for the
 * next round, so the presentations that are hard to place get first pick.
 */
function construct(m: Model): { layout: Layout | null; unplaced: number[] } {
  const boost = new Int32Array(m.tasks.length);
  let fewest: number[] | null = null;

  for (let round = 0; round < BUILD_ROUNDS; round += 1) {
    const layout = new Layout(m);
    // The first slot where a room of each challenge may still be free. Rooms
    // fill front to back, so the greedy pass need not rescan full slots.
    const open = new Int32Array(m.challengeRooms.length);
    const failed: number[] = [];

    for (const t of buildOrder(m, boost)) {
      const c = m.taskChallenge[t]!;
      if (!placeEarliest(layout, t, open[c]!)) failed.push(t);
      const rooms = m.challengeRooms[c]!;
      while (
        open[c]! < m.slots &&
        rooms.every((r) => layout.occupant(r, open[c]!) >= 0)
      ) {
        open[c]! += 1;
      }
    }

    const unplaced = failed.filter(
      (t) => !augment(layout, t, new Uint8Array(layout.cells.length)),
    );
    if (unplaced.length === 0) return { layout, unplaced };

    if (!fewest || unplaced.length < fewest.length) fewest = unplaced;
    for (const t of unplaced) boost[t]! += 1;
  }

  return { layout: null, unplaced: fewest ?? [] };
}

// ---------------------------------------------------------------------------
// Local search

/**
 * The layout plus every objective, kept current as tasks are lifted and
 * dropped so a candidate move costs a few array updates, not a full rescore.
 */
class Scored extends Layout {
  private readonly sponsorAt: Int32Array;
  private readonly allAt: Int32Array;
  sponsorEnd = 0;
  allEnd = 0;
  private readonly roomFirst: Int32Array;
  private readonly roomLast: Int32Array;
  private readonly roomCount: Int32Array;
  private idle = 0;
  private readonly entryChanges: Int32Array;
  private readonly entryLess: Int32Array;
  private changes = 0;
  private lessBreaks = 0;
  private readonly daySlots: number[] = [];
  private readonly dayBuildings: number[] = [];

  constructor(m: Model, from: Layout) {
    super(m);
    this.sponsorAt = new Int32Array(m.slots);
    this.allAt = new Int32Array(m.slots);
    this.roomFirst = new Int32Array(m.rooms.length).fill(-1);
    this.roomLast = new Int32Array(m.rooms.length).fill(-1);
    this.roomCount = new Int32Array(m.rooms.length);
    this.entryChanges = new Int32Array(m.entryTasks.length);
    this.entryLess = new Int32Array(m.entryTasks.length);
    for (let t = 0; t < m.tasks.length; t += 1) {
      this.drop(t, from.roomOf[t]!, from.slotOf[t]!);
    }
  }

  private roomIdle(r: number) {
    return this.roomCount[r]! > 0
      ? this.roomLast[r]! - this.roomFirst[r]! + 1 - this.roomCount[r]!
      : 0;
  }

  /**
   * Changes of building and (negated) breaks for one project, optionally as
   * if task `moved` sat at (room, slot).
   */
  private itinerary(e: number, moved = -1, room = -1, slot = -1) {
    const m = this.m;
    const slots = this.daySlots;
    const buildings = this.dayBuildings;
    let n = 0;
    for (const o of m.entryTasks[e]!) {
      const s = o === moved ? slot : this.slotOf[o]!;
      if (s < 0) continue;
      const b = m.roomBuilding[o === moved ? room : this.roomOf[o]!]!;
      // Insertion sort: a project has a handful of presentations.
      let j = n - 1;
      while (j >= 0 && slots[j]! > s) {
        slots[j + 1] = slots[j]!;
        buildings[j + 1] = buildings[j]!;
        j -= 1;
      }
      slots[j + 1] = s;
      buildings[j + 1] = b;
      n += 1;
    }
    let changes = 0;
    let less = 0;
    for (let i = 1; i < n; i += 1) {
      if (buildings[i] !== buildings[i - 1]) changes += 1;
      less -= slots[i]! - slots[i - 1]! - 1;
    }
    return { changes, less };
  }

  private refreshEntry(e: number) {
    const { changes, less } = this.itinerary(e);
    this.changes += changes - this.entryChanges[e]!;
    this.lessBreaks += less - this.entryLess[e]!;
    this.entryChanges[e] = changes;
    this.entryLess[e] = less;
  }

  lift(t: number) {
    const m = this.m;
    const r = this.roomOf[t]!;
    const s = this.slotOf[t]!;
    this.cells[r * m.slots + s] = -1;
    this.slotOf[t] = -1;
    this.roomOf[t] = -1;

    this.allAt[s]! -= 1;
    if (this.allAt[s] === 0 && s + 1 === this.allEnd) {
      let x = s - 1;
      while (x >= 0 && this.allAt[x] === 0) x -= 1;
      this.allEnd = x + 1;
    }
    if (m.taskSponsor[t]) {
      this.sponsorAt[s]! -= 1;
      if (this.sponsorAt[s] === 0 && s + 1 === this.sponsorEnd) {
        let x = s - 1;
        while (x >= 0 && this.sponsorAt[x] === 0) x -= 1;
        this.sponsorEnd = x + 1;
      }
    }

    if (m.roomSponsor[r]) this.idle -= this.roomIdle(r);
    this.roomCount[r]! -= 1;
    if (this.roomCount[r] === 0) {
      this.roomFirst[r] = -1;
      this.roomLast[r] = -1;
    } else {
      if (s === this.roomFirst[r]) {
        let x = s + 1;
        while (this.occupant(r, x) < 0) x += 1;
        this.roomFirst[r] = x;
      }
      if (s === this.roomLast[r]) {
        let x = s - 1;
        while (this.occupant(r, x) < 0) x -= 1;
        this.roomLast[r] = x;
      }
    }
    if (m.roomSponsor[r]) this.idle += this.roomIdle(r);

    this.refreshEntry(m.taskEntry[t]!);
  }

  drop(t: number, r: number, s: number) {
    const m = this.m;
    this.cells[r * m.slots + s] = t;
    this.slotOf[t] = s;
    this.roomOf[t] = r;

    this.allAt[s]! += 1;
    if (s + 1 > this.allEnd) this.allEnd = s + 1;
    if (m.taskSponsor[t]) {
      this.sponsorAt[s]! += 1;
      if (s + 1 > this.sponsorEnd) this.sponsorEnd = s + 1;
    }

    if (m.roomSponsor[r]) this.idle -= this.roomIdle(r);
    this.roomCount[r]! += 1;
    if (this.roomCount[r] === 1) {
      this.roomFirst[r] = s;
      this.roomLast[r] = s;
    } else {
      if (s < this.roomFirst[r]!) this.roomFirst[r] = s;
      if (s > this.roomLast[r]!) this.roomLast[r] = s;
    }
    if (m.roomSponsor[r]) this.idle += this.roomIdle(r);

    this.refreshEntry(m.taskEntry[t]!);
  }

  /**
   * The search's own ordering. It refines the public score with how many
   * presentations sit in the last sponsor slot and the last slot overall:
   * emptying the last slot one move at a time is how a finish time comes
   * down, and without the counts each of those moves would look like no
   * progress.
   */
  read(into: Int32Array) {
    into[0] = this.sponsorEnd;
    into[1] = this.sponsorEnd > 0 ? this.sponsorAt[this.sponsorEnd - 1]! : 0;
    into[2] = this.idle;
    into[3] = this.allEnd;
    into[4] = this.allEnd > 0 ? this.allAt[this.allEnd - 1]! : 0;
    into[5] = this.changes;
    into[6] = this.lessBreaks;
  }

  publicScore(): PlanScore {
    return [
      this.sponsorEnd,
      this.idle,
      this.allEnd,
      this.changes,
      this.lessBreaks,
    ];
  }

  /**
   * The (changes, breaks) totals if `t` and `u` traded cells. Occupancy is
   * unchanged by a trade, so nothing else in the score can move.
   */
  tradedTotals(t: number, u: number) {
    const m = this.m;
    const et = m.taskEntry[t]!;
    const eu = m.taskEntry[u]!;
    const a = this.itinerary(et, t, this.roomOf[u]!, this.slotOf[u]!);
    const b = this.itinerary(eu, u, this.roomOf[t]!, this.slotOf[t]!);
    return {
      changes:
        this.changes -
        this.entryChanges[et]! -
        this.entryChanges[eu]! +
        a.changes +
        b.changes,
      less:
        this.lessBreaks -
        this.entryLess[et]! -
        this.entryLess[eu]! +
        a.less +
        b.less,
    };
  }
}

function lexLess(a: Int32Array | number[], b: Int32Array | number[]) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  return false;
}

const RELOCATE = 1;
const TRADE = 2;
const EJECT = 3;

/**
 * Hill-climbs from a complete layout. For each task in turn it tries every
 * free cell of its challenge, trading cells with each other presentation of
 * that challenge, and, for a task holding up a finish time, pushing another
 * presentation into a free cell to take its place. The best improving move
 * is applied. Returns the layout with the best public score seen.
 */
function improve(m: Model, start: Layout): Layout {
  const state = new Scored(m, start);
  const best = new Layout(m);
  const keepBest = () => {
    best.slotOf.set(state.slotOf);
    best.roomOf.set(state.roomOf);
  };
  keepBest();
  let bestScore = state.publicScore();

  const current = new Int32Array(7);
  const trial = new Int32Array(7);
  const winner = new Int32Array(7);
  let budget = SEARCH_EVALUATIONS;

  for (let pass = 0; pass < SEARCH_PASSES && budget > 0; pass += 1) {
    let moved = false;

    for (let t = 0; t < m.tasks.length && budget > 0; t += 1) {
      const c = m.taskChallenge[t]!;
      const rooms = m.challengeRooms[c]!;
      const peers = m.challengeTasks[c]!;
      const r0 = state.roomOf[t]!;
      const s0 = state.slotOf[t]!;
      // A move to or past the current finish can only make it later.
      const limit = m.taskSponsor[t] ? state.sponsorEnd : state.allEnd;

      state.read(current);
      winner.set(current);
      let kind = 0;
      let moveA = -1;
      let moveB = -1;
      let moveC = -1;

      for (let s = 0; s < limit; s += 1) {
        for (const r of rooms) {
          if (state.occupant(r, s) >= 0 || !state.fits(t, r, s)) continue;
          budget -= 1;
          state.lift(t);
          state.drop(t, r, s);
          state.read(trial);
          state.lift(t);
          state.drop(t, r0, s0);
          if (lexLess(trial, winner)) {
            winner.set(trial);
            kind = RELOCATE;
            moveA = r;
            moveB = s;
          }
        }
      }

      for (const u of peers) {
        if (u === t) continue;
        const ru = state.roomOf[u]!;
        const su = state.slotOf[u]!;
        if (!state.fits(t, ru, su) || !state.fits(u, r0, s0)) continue;
        budget -= 1;
        const traded = state.tradedTotals(t, u);
        trial.set(current);
        trial[5] = traded.changes;
        trial[6] = traded.less;
        if (lexLess(trial, winner)) {
          winner.set(trial);
          kind = TRADE;
          moveA = u;
        }
      }

      if (s0 + 1 === limit) {
        for (const u of peers) {
          if (u === t) continue;
          const ru = state.roomOf[u]!;
          const su = state.slotOf[u]!;
          if (!state.fits(t, ru, su)) continue;
          for (let s = 0; s < limit; s += 1) {
            for (const r of rooms) {
              if (state.occupant(r, s) >= 0 || !state.fits(u, r, s)) continue;
              budget -= 1;
              state.lift(t);
              state.lift(u);
              state.drop(t, ru, su);
              state.drop(u, r, s);
              state.read(trial);
              state.lift(u);
              state.lift(t);
              state.drop(u, ru, su);
              state.drop(t, r0, s0);
              if (lexLess(trial, winner)) {
                winner.set(trial);
                kind = EJECT;
                moveA = u;
                moveB = r;
                moveC = s;
              }
            }
          }
        }
      }

      if (kind === 0) continue;
      moved = true;
      if (kind === RELOCATE) {
        state.lift(t);
        state.drop(t, moveA, moveB);
      } else {
        const u = moveA;
        const ru = state.roomOf[u]!;
        const su = state.slotOf[u]!;
        state.lift(t);
        state.lift(u);
        state.drop(t, ru, su);
        if (kind === TRADE) state.drop(u, r0, s0);
        else state.drop(u, moveB, moveC);
      }

      const score = state.publicScore();
      if (lexLess(score, bestScore)) {
        bestScore = score;
        keepBest();
      }
    }

    if (!moved) break;
  }

  return best;
}

// ---------------------------------------------------------------------------

/**
 * Builds a schedule. Tries the full cross-building break first; when no
 * schedule is found that way, tries again with the same-building break
 * everywhere and says so. Every schedule returned has passed
 * `validateSchedule` and carries the score `scoreSchedule` gives it.
 */
export function solvePlan(inputs: PlanInputs): PlanResult {
  const capacity = capacityProblems(inputs);
  if (capacity.length > 0) return { ok: false, diagnostics: capacity };

  let unplaced: PlanDiagnostic[] = [];
  for (const relaxed of [false, true]) {
    const m = buildModel(inputs, relaxed);
    const built = construct(m);
    if (!built.layout) {
      unplaced = built.unplaced.map((t) => ({
        kind: "unplaced" as const,
        entryId: m.tasks[t]!.entryId,
        challengeId: m.tasks[t]!.challengeId,
      }));
      continue;
    }

    const placements = improve(m, built.layout).placements();
    const check = validateSchedule(inputs, placements, { relaxed });
    if (!check.valid) {
      throw new Error(
        `The scheduler built a schedule that breaks its own rules: ${check.errors.join(" ")}`,
      );
    }
    return {
      ok: true,
      // A relaxed solve can still land on a schedule that shortened nothing.
      relaxed: check.reducedBreaks.length > 0,
      placements,
      score: scoreSchedule(inputs, placements),
      reducedBreaks: check.reducedBreaks,
    };
  }

  return { ok: false, diagnostics: unplaced };
}
