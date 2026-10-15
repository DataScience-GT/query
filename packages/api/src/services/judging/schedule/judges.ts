import { taskKey } from "./inputs";
import type { Placement, PlanInputs } from "./inputs";

// The second scheduling stage. Once every presentation has a time and a room,
// each one gets exactly one judge, so every project has a time, a place and a
// grader. A presentation is a project in one root challenge, and that
// challenge is graded once, by one judge.
//
// Table judges (members) handle general judging; a sponsor's judges are other
// people, tied to the sponsor's room, who grade only that sponsor's challenge.
// A judge is in one place per slot, needs the schedule's breaks to walk to
// another room, and takes a rest after a long run of presentations. Judge bias
// is calibrated on the assumption that every judge sees a random sample of
// projects, so after everything is graded the aim is an even load, then each
// judge spread over as many rooms and as much of the day as possible.
//
// Pure and deterministic, written apart from the CP-SAT script on purpose: the
// script's answer is re-checked here (validateJudgeAssignment), and a server
// without OR-Tools builds its assignment here (assignJudges).

/** Most slots in a row a judge grades before at least one free slot. */
export const MAX_CONSECUTIVE = 4;

/**
 * The day is cut into this many equal parts when asking whether a judge's
 * presentations are spread across it. cpsat.py cuts it the same way.
 */
export const DAY_PARTS = 4;

export type JudgeInput = {
  id: string;
  kind: "member" | "guest";
  /** The root challenges this judge may grade. */
  challengeIds: readonly string[];
  /** The one room a guest grades in; null for a member, who moves about. */
  roomId: string | null;
  /** Defaults to MAX_CONSECUTIVE. */
  maxConsecutive?: number;
};

/** The judge of one presentation. */
export type JudgeAssignment = {
  entryId: string;
  challengeId: string;
  judgeId: string;
};

/** Lower is better, except the last, which counts what the judges cover. */
export type JudgeMetrics = {
  /** Presentations with no judge. */
  unassigned: number;
  /** Sponsor presentations graded by a table judge rather than a sponsor's. */
  memberOnSponsor: number;
  /** Presentations of the busiest judge. */
  maxLoad: number;
  /** How far apart the judges of one pool are, summed over the pools. */
  loadSpread: number;
  /** Times a judge grades in a room they have already graded in. */
  repeats: number;
  /** Rooms a judge grades in, averaged over the judges who grade at all. */
  avgDistinctRooms: number;
  /** Parts of the day a judge grades in, summed over the judges. Higher is better. */
  dayPartsCovered: number;
  /** Presentations per judge, for every judge given. */
  loads: Record<string, number>;
};

/**
 * Judges with the same challenges and room share a pool: they are
 * interchangeable, so only within a pool can the load be evened out.
 */
const poolKey = (judge: JudgeInput) =>
  `${[...judge.challengeIds].sort().join(",")}|${judge.roomId ?? ""}`;

/** Whether `judge` may grade a presentation of `challengeId` held in `roomId`. */
export function mayGrade(
  judge: JudgeInput,
  presentation: { challengeId: string; roomId: string },
): boolean {
  if (!judge.challengeIds.includes(presentation.challengeId)) return false;
  // A guest grades only in their own room, and with no room grades nowhere.
  if (judge.roomId !== null) return judge.roomId === presentation.roomId;
  return judge.kind !== "guest";
}

// Same hash for every run, so ties break the same way each time.
function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const byHash = (a: string, b: string) =>
  stableHash(a) - stableHash(b) || (a < b ? -1 : a > b ? 1 : 0);

type Item = {
  index: number;
  key: string;
  entryId: string;
  challengeId: string;
  roomId: string;
  buildingId: string;
  slot: number;
  part: number;
  sponsor: boolean;
};

type Prepared = {
  input: JudgeInput;
  max: number;
  /** Judges are numbered in id order, the same for any input order. */
  pool: number;
};

type Context = {
  items: Item[];
  judges: Prepared[];
  sameGap: number;
  crossGap: number;
  maxGap: number;
  itemIndex: Map<string, number>;
  judgeIndex: Map<string, number>;
  /** Judges who may grade each item, in judge order. */
  eligible: number[][];
  pools: number[][];
};

function contextOf(
  inputs: PlanInputs,
  placements: readonly Placement[],
  judges: readonly JudgeInput[],
): Context {
  const buildings = new Map(inputs.rooms.map((r) => [r.id, r.buildingId]));
  const sponsor = new Map(
    inputs.tasks.map((t) => [taskKey(t.entryId, t.challengeId), t.sponsor]),
  );

  const items: Item[] = [];
  const seen = new Set<string>();
  for (const p of placements) {
    const key = taskKey(p.entryId, p.challengeId);
    const buildingId = buildings.get(p.roomId);
    if (seen.has(key) || buildingId === undefined) continue;
    seen.add(key);
    items.push({
      index: 0,
      key,
      entryId: p.entryId,
      challengeId: p.challengeId,
      roomId: p.roomId,
      buildingId,
      slot: p.slot,
      part: Math.min(
        DAY_PARTS - 1,
        Math.max(
          0,
          Math.floor((p.slot * DAY_PARTS) / Math.max(1, inputs.slots)),
        ),
      ),
      sponsor: sponsor.get(key) ?? false,
    });
  }
  items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  items.forEach((item, index) => {
    item.index = index;
  });

  const unique = [...new Map(judges.map((j) => [j.id, j])).values()].sort(
    (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const poolIds = new Map<string, number>();
  const prepared = unique.map((input) => {
    const key = poolKey(input);
    if (!poolIds.has(key)) poolIds.set(key, poolIds.size);
    return {
      input,
      max: Math.max(1, input.maxConsecutive ?? MAX_CONSECUTIVE),
      pool: poolIds.get(key)!,
    };
  });
  const pools: number[][] = [...poolIds.keys()].map(() => []);
  prepared.forEach((judge, j) => pools[judge.pool]!.push(j));

  return {
    items,
    judges: prepared,
    sameGap: inputs.sameGap,
    crossGap: inputs.crossGap,
    maxGap: Math.max(inputs.sameGap, inputs.crossGap),
    itemIndex: new Map(items.map((item) => [item.key, item.index])),
    judgeIndex: new Map(prepared.map((judge, j) => [judge.input.id, j])),
    eligible: items.map((item) =>
      prepared.flatMap((judge, j) => (mayGrade(judge.input, item) ? [j] : [])),
    ),
    pools,
  };
}

/**
 * Whether one judge cannot do both presentations: they are at the same time,
 * or the walk between two rooms needs more free slots than lie between them.
 * Staying in one room needs no walk.
 */
function clash(context: Context, a: Item, b: Item): boolean {
  const apart = Math.abs(a.slot - b.slot);
  if (apart === 0) return true;
  if (a.roomId === b.roomId) return false;
  const gap =
    a.buildingId === b.buildingId ? context.sameGap : context.crossGap;
  return apart <= gap;
}

/** Where the search stands: who grades what, and the counts the score needs. */
class State {
  readonly owner: number[];
  /** Per judge, the item they grade in each slot. */
  readonly slots: Map<number, number>[];
  readonly load: number[];
  readonly rooms: Map<string, number>[];
  readonly parts: number[][];
  unassigned: number;
  memberOnSponsor = 0;
  repeats = 0;
  covered = 0;

  constructor(private readonly context: Context) {
    this.owner = context.items.map(() => -1);
    this.slots = context.judges.map(() => new Map());
    this.load = context.judges.map(() => 0);
    this.rooms = context.judges.map(() => new Map());
    this.parts = context.judges.map(() => Array<number>(DAY_PARTS).fill(0));
    this.unassigned = context.items.length;
  }

  add(i: number, j: number) {
    const item = this.context.items[i]!;
    this.owner[i] = j;
    this.slots[j]!.set(item.slot, i);
    this.load[j]! += 1;
    this.unassigned -= 1;
    if (item.sponsor && this.context.judges[j]!.input.kind === "member") {
      this.memberOnSponsor += 1;
    }
    const rooms = this.rooms[j]!;
    const seen = rooms.get(item.roomId) ?? 0;
    if (seen > 0) this.repeats += 1;
    rooms.set(item.roomId, seen + 1);
    if (this.parts[j]![item.part]! === 0) this.covered += 1;
    this.parts[j]![item.part]! += 1;
  }

  remove(i: number) {
    const j = this.owner[i]!;
    const item = this.context.items[i]!;
    this.owner[i] = -1;
    this.slots[j]!.delete(item.slot);
    this.load[j]! -= 1;
    this.unassigned += 1;
    if (item.sponsor && this.context.judges[j]!.input.kind === "member") {
      this.memberOnSponsor -= 1;
    }
    const rooms = this.rooms[j]!;
    const left = rooms.get(item.roomId)! - 1;
    if (left > 0) {
      this.repeats -= 1;
      rooms.set(item.roomId, left);
    } else {
      rooms.delete(item.roomId);
    }
    this.parts[j]![item.part]! -= 1;
    if (this.parts[j]![item.part]! === 0) this.covered -= 1;
  }

  /**
   * Whether judge `j` could also take `item`: free in its slot, far enough
   * from their other rooms, and not past their run limit. `ignore` is an
   * item of theirs to leave out, as when it is about to be swapped away.
   */
  fits(j: number, item: Item, ignore = -1): boolean {
    const mine = this.slots[j]!;
    const taken = (slot: number) => {
      const other = mine.get(slot);
      return other === undefined || other === ignore ? undefined : other;
    };
    if (taken(item.slot) !== undefined) return false;
    for (let d = 1; d <= this.context.maxGap; d += 1) {
      for (const slot of [item.slot - d, item.slot + d]) {
        const other = taken(slot);
        if (
          other !== undefined &&
          clash(this.context, this.context.items[other]!, item)
        ) {
          return false;
        }
      }
    }
    let run = 1;
    for (let s = item.slot - 1; taken(s) !== undefined; s -= 1) run += 1;
    for (let s = item.slot + 1; taken(s) !== undefined; s += 1) run += 1;
    return run <= this.context.judges[j]!.max;
  }

  /** The score as a vector, compared left to right; lower is better. */
  vector(): number[] {
    let maxLoad = 0;
    for (const load of this.load) maxLoad = Math.max(maxLoad, load);
    return [
      this.unassigned,
      this.memberOnSponsor,
      maxLoad,
      this.spread(),
      this.repeats,
      -this.covered,
    ];
  }

  spread(): number {
    let total = 0;
    for (const pool of this.context.pools) {
      if (pool.length < 2) continue;
      let low = Infinity;
      let high = 0;
      for (const j of pool) {
        low = Math.min(low, this.load[j]!);
        high = Math.max(high, this.load[j]!);
      }
      total += high - low;
    }
    return total;
  }

  metrics(): JudgeMetrics {
    const [unassigned, memberOnSponsor, maxLoad, loadSpread, repeats] =
      this.vector() as [number, number, number, number, number];
    let graders = 0;
    let distinct = 0;
    const loads: Record<string, number> = {};
    this.context.judges.forEach((judge, j) => {
      loads[judge.input.id] = this.load[j]!;
      if (this.load[j]! === 0) return;
      graders += 1;
      distinct += this.rooms[j]!.size;
    });
    return {
      unassigned,
      memberOnSponsor,
      maxLoad,
      loadSpread,
      repeats,
      avgDistinctRooms: graders === 0 ? 0 : distinct / graders,
      dayPartsCovered: this.covered,
      loads,
    };
  }
}

function compareVectors(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

/** Lower is better, compared as the fields are listed in JudgeMetrics. */
export function compareJudgeMetrics(a: JudgeMetrics, b: JudgeMetrics): number {
  return compareVectors(
    [
      a.unassigned,
      a.memberOnSponsor,
      a.maxLoad,
      a.loadSpread,
      a.repeats,
      -a.dayPartsCovered,
    ],
    [
      b.unassigned,
      b.memberOnSponsor,
      b.maxLoad,
      b.loadSpread,
      b.repeats,
      -b.dayPartsCovered,
    ],
  );
}

/** A state holding `assignment`, skipping rows that name nothing known. */
function stateOf(context: Context, assignment: readonly JudgeAssignment[]) {
  const state = new State(context);
  for (const row of assignment) {
    const i = context.itemIndex.get(taskKey(row.entryId, row.challengeId));
    const j = context.judgeIndex.get(row.judgeId);
    if (i === undefined || j === undefined || state.owner[i]! !== -1) continue;
    state.add(i, j);
  }
  return state;
}

/**
 * Checks an assignment against the hard rules. A presentation with no judge
 * is not an error here (see judgeShortfalls); one with the wrong judge, or
 * two, is.
 */
export function validateJudgeAssignment(
  inputs: PlanInputs,
  placements: readonly Placement[],
  judges: readonly JudgeInput[],
  assignment: readonly JudgeAssignment[],
) {
  const problems = new Set<string>();
  const context = contextOf(inputs, placements, judges);
  const given = new Set<string>();
  const mine = context.judges.map((): number[] => []);

  for (const row of assignment) {
    const key = taskKey(row.entryId, row.challengeId);
    const i = context.itemIndex.get(key);
    const j = context.judgeIndex.get(row.judgeId);
    if (i === undefined) {
      problems.add(`No such presentation: ${key}.`);
      continue;
    }
    if (j === undefined) {
      problems.add(`No such judge: ${row.judgeId}.`);
      continue;
    }
    if (given.has(key)) problems.add(`${key} has more than one judge.`);
    given.add(key);
    const judge = context.judges[j]!.input;
    const item = context.items[i]!;
    if (!judge.challengeIds.includes(item.challengeId)) {
      problems.add(`Judge ${judge.id} may not grade ${key}: wrong challenge.`);
    } else if (!mayGrade(judge, item)) {
      problems.add(`Judge ${judge.id} may not grade ${key}: wrong room.`);
    }
    mine[j]!.push(i);
  }

  context.judges.forEach((judge, j) => {
    const items = mine[j]!.map((i) => context.items[i]!).sort(
      (a, b) => a.slot - b.slot,
    );
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        if (items[b]!.slot - items[a]!.slot > context.maxGap) break;
        if (clash(context, items[a]!, items[b]!)) {
          problems.add(
            items[a]!.slot === items[b]!.slot
              ? `Judge ${judge.input.id} is booked twice in slot ${items[a]!.slot + 1}.`
              : `Judge ${judge.input.id} has too little time between ${items[a]!.key} and ${items[b]!.key}.`,
          );
        }
      }
    }
    let run = 0;
    let previous = -2;
    for (const item of items) {
      if (item.slot === previous) continue;
      run = item.slot === previous + 1 ? run + 1 : 1;
      previous = item.slot;
      if (run === judge.max + 1) {
        problems.add(
          `Judge ${judge.input.id} grades more than ${judge.max} slots in a row.`,
        );
      }
    }
  });

  return { valid: problems.size === 0, problems: [...problems] };
}

/** How even and how mixed an assignment is, and how many presentations it leaves out. */
export function scoreJudgeAssignment(
  inputs: PlanInputs,
  placements: readonly Placement[],
  judges: readonly JudgeInput[],
  assignment: readonly JudgeAssignment[],
): JudgeMetrics {
  const context = contextOf(inputs, placements, judges);
  return stateOf(context, assignment).metrics();
}

/** A slot where some presentations of one challenge have no judge. */
export type JudgeShortfall = {
  slot: number;
  challengeId: string;
  presentations: number;
  /** How many of them judges could cover at that time. */
  judgesFree: number;
};

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** The shortfall as a sentence; `challenge` is the challenge's label. */
export function describeShortfall(
  shortfall: JudgeShortfall,
  challenge: string,
): string {
  return `Slot ${shortfall.slot + 1}: ${plural(shortfall.presentations, "presentation")} in ${challenge}, only ${plural(shortfall.judgesFree, "judge")} free`;
}

/**
 * Each slot and challenge with a presentation that has no judge, earliest
 * first. A judge counts as free for a challenge when they may grade it there,
 * are not grading another challenge in that slot, and could walk there.
 */
export function judgeShortfalls(
  inputs: PlanInputs,
  placements: readonly Placement[],
  judges: readonly JudgeInput[],
  assignment: readonly JudgeAssignment[],
): JudgeShortfall[] {
  const context = contextOf(inputs, placements, judges);
  const state = stateOf(context, assignment);

  const groups = new Map<string, number[]>();
  for (const item of context.items) {
    const key = `${item.slot}|${item.challengeId}`;
    const list = groups.get(key);
    if (list) list.push(item.index);
    else groups.set(key, [item.index]);
  }

  const found: JudgeShortfall[] = [];
  for (const members of groups.values()) {
    if (!members.some((i) => state.owner[i]! === -1)) continue;
    const first = context.items[members[0]!]!;
    // Presentations of this group each need a different free judge: match them.
    const options = members.map((i) =>
      context.eligible[i]!.filter((j) => {
        const held = state.slots[j]!.get(first.slot);
        const own = held !== undefined && members.includes(held) ? held : -1;
        return (
          (held === undefined || own !== -1) &&
          state.fits(j, context.items[i]!, own)
        );
      }),
    );
    const taker = new Map<number, number>();
    const place = (m: number, tried: Set<number>): boolean => {
      for (const j of options[m]!) {
        if (tried.has(j)) continue;
        tried.add(j);
        const holder = taker.get(j);
        if (holder === undefined || place(holder, tried)) {
          taker.set(j, m);
          return true;
        }
      }
      return false;
    };
    let covered = 0;
    for (let m = 0; m < members.length; m += 1) {
      if (place(m, new Set())) covered += 1;
    }
    found.push({
      slot: first.slot,
      challengeId: first.challengeId,
      presentations: members.length,
      judgesFree: covered,
    });
  }
  return found.sort(
    (a, b) => a.slot - b.slot || (a.challengeId < b.challengeId ? -1 : 1),
  );
}

export type JudgeAssignmentResult = {
  /** Every presentation that has a judge, the kept ones included. */
  assignment: JudgeAssignment[];
  metrics: JudgeMetrics;
};

/**
 * Moves and swaps tried, and blocking items moved out of the way, before the
 * search stops, however large the event.
 */
const MAX_EVALUATIONS = 50_000;
const MAX_DISPLACEMENTS = 100_000;
const MAX_PASSES = 12;

/**
 * Assigns a judge to every presentation it can: a greedy pass, each
 * presentation to the judge that leaves the score best, from three orders of
 * going through them, then a bounded local search on the best of the three
 * that moves, swaps and displaces. The same inputs give the same answer,
 * whatever order they come in: ties break on a hash of the ids. `keep` is
 * assignments that stay as they are, and count towards loads and breaks.
 */
export function assignJudges(
  inputs: PlanInputs,
  placements: readonly Placement[],
  judges: readonly JudgeInput[],
  options: { keep?: readonly JudgeAssignment[] } = {},
): JudgeAssignmentResult {
  const context = contextOf(inputs, placements, judges);
  const start = stateOf(context, options.keep ?? []);
  const locked = new Set(
    context.items
      .filter((item) => start.owner[item.index]! !== -1)
      .map((i) => i.index),
  );
  const rank = (j: number) => stableHash(context.judges[j]!.input.id);
  const free = context.items.filter((item) => !locked.has(item.index));

  // Judges to try for an item, in a fixed order that does not favour the
  // first by id.
  const order = (i: number) =>
    [...context.eligible[i]!].sort((a, b) => rank(a) - rank(b) || a - b);

  /**
   * The judge for `item` that leaves the score best, or -1. With `stay`, one
   * who was in this room the slot before comes first: staying costs a judge
   * no break, where moving on spends one.
   */
  const bestJudge = (state: State, item: Item, skip = -1, stay = false) => {
    let best = -1;
    let bestVector: number[] = [];
    for (const j of order(item.index)) {
      if (j === skip || !state.fits(j, item)) continue;
      const before = state.slots[j]!.get(item.slot - 1);
      const staying =
        before !== undefined && context.items[before]!.roomId === item.roomId;
      state.add(item.index, j);
      const vector = [stay && !staying ? 1 : 0, ...state.vector()];
      state.remove(item.index);
      if (best === -1 || compareVectors(vector, bestVector) < 0) {
        best = j;
        bestVector = vector;
      }
    }
    return best;
  };

  // Three starting points, the best of them is improved below: most
  // constrained first, which is what a short supply of judges needs; and
  // through the day in order, with or without judges staying where they are,
  // which is what a long run of crowded slots needs.
  const construct = (sort: (a: Item, b: Item) => number, stay: boolean) => {
    const state = stateOf(context, options.keep ?? []);
    for (const item of [...free].sort(sort)) {
      const j = bestJudge(state, item, -1, stay);
      if (j !== -1) state.add(item.index, j);
    }
    return state;
  };
  const tightFirst = (a: Item, b: Item) =>
    context.eligible[a.index]!.length - context.eligible[b.index]!.length ||
    a.slot - b.slot ||
    byHash(a.key, b.key);
  const inOrder = (a: Item, b: Item) => a.slot - b.slot || byHash(a.key, b.key);
  const state = [
    construct(tightFirst, false),
    construct(inOrder, true),
    construct(inOrder, false),
  ].reduce((best, next) =>
    compareVectors(next.vector(), best.vector()) < 0 ? next : best,
  );

  let evaluations = 0;
  let displacements = 0;

  /** Moves `i` to judge `to` if that scores better than `current`, and says so. */
  const tryMove = (i: number, to: number, current: number[]) => {
    const from = state.owner[i]!;
    evaluations += 1;
    state.remove(i);
    state.add(i, to);
    if (compareVectors(state.vector(), current) < 0) return true;
    state.remove(i);
    state.add(i, from);
    return false;
  };

  /** Swaps the judges of `i` and `q` if that scores better than `current`, and says so. */
  const trySwap = (i: number, q: number, current: number[]) => {
    const a = state.owner[i]!;
    const b = state.owner[q]!;
    evaluations += 1;
    state.remove(i);
    state.remove(q);
    if (state.fits(b, context.items[i]!) && state.fits(a, context.items[q]!)) {
      state.add(i, b);
      state.add(q, a);
      if (compareVectors(state.vector(), current) < 0) return true;
      state.remove(i);
      state.remove(q);
    }
    state.add(i, a);
    state.add(q, b);
    return false;
  };

  /**
   * Gives `item` a judge, moving blocking items of that judge to other
   * judges, `depth` moves deep. Changes nothing if it cannot.
   */
  const displace = (item: Item, depth: number): boolean => {
    const direct = bestJudge(state, item);
    if (direct !== -1) {
      state.add(item.index, direct);
      return true;
    }
    if (depth === 0) return false;
    for (const j of order(item.index)) {
      const reach = Math.max(context.maxGap, context.judges[j]!.max);
      for (const q of [...state.slots[j]!.values()]) {
        if (
          locked.has(q) ||
          Math.abs(context.items[q]!.slot - item.slot) > reach
        ) {
          continue;
        }
        if (displacements >= MAX_DISPLACEMENTS) return false;
        displacements += 1;
        state.remove(q);
        if (state.fits(j, item)) {
          state.add(item.index, j);
          if (displace(context.items[q]!, depth - 1)) return true;
          state.remove(item.index);
        }
        state.add(q, j);
      }
    }
    return false;
  };

  for (
    let pass = 0;
    pass < MAX_PASSES && evaluations < MAX_EVALUATIONS;
    pass += 1
  ) {
    let improved = false;

    // A presentation with no judge: clear its way by sending an item that
    // blocks a judge to somebody else, who may in turn send one on.
    for (const item of free) {
      if (state.owner[item.index]! !== -1) continue;
      if (displacements >= MAX_DISPLACEMENTS) break;
      if (displace(item, 4)) improved = true;
    }

    // A presentation that scores better with another judge, alone or swapped
    // with one of theirs.
    for (const item of free) {
      const from = state.owner[item.index]!;
      if (from === -1) continue;
      const current = state.vector();
      for (const to of order(item.index)) {
        if (evaluations >= MAX_EVALUATIONS) break;
        if (to === from) continue;
        if (!state.slots[to]!.has(item.slot) && state.fits(to, item)) {
          if (tryMove(item.index, to, current)) {
            improved = true;
            break;
          }
        }
        let swapped = false;
        for (const q of [...state.slots[to]!.values()]) {
          if (evaluations >= MAX_EVALUATIONS) break;
          if (locked.has(q) || !context.eligible[q]!.includes(from)) continue;
          if (trySwap(item.index, q, current)) {
            improved = true;
            swapped = true;
            break;
          }
        }
        if (swapped) break;
      }
    }
    if (!improved) break;
  }

  const assignment = context.items
    .filter((item) => state.owner[item.index]! !== -1)
    .map((item) => ({
      entryId: item.entryId,
      challengeId: item.challengeId,
      judgeId: context.judges[state.owner[item.index]!]!.input.id,
    }));
  return { assignment, metrics: state.metrics() };
}
