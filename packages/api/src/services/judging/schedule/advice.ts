import { MAX_CONSECUTIVE, assignJudges, judgeShortfalls } from "./judges";
import type { JudgeInput } from "./judges";
import type { PlanInputs, PlanRoom } from "./inputs";
import type { PlanResult } from "./solve";

// What an organiser could change to get a better schedule, worked out from the
// real counts and put in plain words. Pure: the router reads the edition,
// this only counts. At most MAX_ADVICE items, most useful first.

/** Something one button can do for the organiser. */
export type AdviceAction =
  | { type: "archiveTables"; roomIds: string[] }
  | { type: "addTables"; challengeId: string; buildingId: string; count: number }
  | {
      type: "addRooms";
      rooms: { challengeId: string; buildingId: string; name: string }[];
    };

export type Advice = {
  kind: "judges" | "sponsorRoom" | "unusedTables" | "moreTables" | "window";
  message: string;
  action?: AdviceAction;
};

/** A room the edition could schedule in, named, with whether it is a table. */
export type AdviceRoom = PlanRoom & { name: string; table: boolean };

export const MAX_ADVICE = 4;

/** Past this share of the window, the last presentations leave no slack. */
const TIGHT = 0.8;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const count = <K>(keys: Iterable<K>) => {
  const counts = new Map<K, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
};

/**
 * Fewest slots the plan needs: no challenge can finish before its
 * presentations are spread over its rooms, and no project can finish before
 * its own presentations and the breaks between them. Challenges with no room
 * are skipped, since more slots do not help them.
 */
export function slotsNeeded(
  inputs: Pick<PlanInputs, "rooms" | "tasks" | "sameGap">,
): number {
  const rooms = count(inputs.rooms.map((r) => r.challengeId));
  let needed = 0;
  for (const [challengeId, presentations] of count(
    inputs.tasks.map((t) => t.challengeId),
  )) {
    const here = rooms.get(challengeId) ?? 0;
    if (here > 0) needed = Math.max(needed, Math.ceil(presentations / here));
  }
  for (const n of count(inputs.tasks.map((t) => t.entryId)).values()) {
    needed = Math.max(needed, n + (n - 1) * inputs.sameGap);
  }
  return needed;
}

/** Member judges who can sit at once, as roomsJudgesCanStaff counts them. */
function memberSeats(judges: readonly JudgeInput[]) {
  return Math.floor(
    judges
      .filter((j) => j.kind === "member")
      .reduce((sum, j) => {
        const max = j.maxConsecutive ?? MAX_CONSECUTIVE;
        return sum + max / (max + 1);
      }, 0),
  );
}

const numbered = /^(.*?)(\d+)(\D*)$/;

/** A name for one more room beside `existing`, not used by `taken`. */
function nextRoomName(
  existing: readonly string[],
  label: string,
  taken: ReadonlySet<string>,
) {
  let best: { prefix: string; n: number; suffix: string } | null = null;
  for (const name of existing) {
    const match = numbered.exec(name);
    if (!match) continue;
    const n = Number(match[2]);
    if (!best || n > best.n) {
      best = { prefix: match[1]!, n, suffix: match[3]! };
    }
  }
  for (let n = (best?.n ?? existing.length) + 1; ; n += 1) {
    const name = best
      ? `${best.prefix}${n}${best.suffix}`
      : `${label} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export function adviceFor(source: {
  /** The plan as solved, with the tables the judges can staff. */
  inputs: PlanInputs;
  result: PlanResult;
  /** Every room the edition could schedule in, before any were left out. */
  rooms: readonly AdviceRoom[];
  judges: readonly JudgeInput[];
  labelOf: (challengeId: string) => string;
  slotMinutes: number;
}): Advice[] {
  const { inputs, result, judges } = source;
  const members = judges.filter((j) => j.kind === "member").length;
  const seats = memberSeats(judges);
  const guestRooms = new Set(judges.flatMap((j) => j.roomId ?? []));
  const unstaffed = inputs.rooms.filter((r) => !guestRooms.has(r.id));
  const spareSeats = members > 0 ? Math.max(0, seats - unstaffed.length) : 0;

  const presentations = count(inputs.tasks.map((t) => t.challengeId));
  const roomsOf = count(inputs.rooms.map((r) => r.challengeId));
  const generalIds = new Set(
    inputs.tasks.filter((t) => !t.sponsor).map((t) => t.challengeId),
  );
  const found: Advice[] = [];

  // Last slot (1-based) each challenge uses in the plan.
  const finish = new Map<string, number>();
  if (result.ok) {
    for (const p of result.placements) {
      finish.set(p.challengeId, Math.max(finish.get(p.challengeId) ?? 0, p.slot + 1));
    }
  }
  const latest = (ids: Iterable<string>) => {
    let best: string | null = null;
    for (const id of [...ids].sort()) {
      if ((finish.get(id) ?? 0) > (finish.get(best ?? "") ?? 0)) best = id;
    }
    return best;
  };
  const sponsorLast = latest(
    [...presentations.keys()].filter((id) => !generalIds.has(id)),
  );
  const generalLast = latest(generalIds);
  const sponsorEnd = finish.get(sponsorLast ?? "") ?? 0;
  const generalEnd = finish.get(generalLast ?? "") ?? 0;

  // The window is too short for what is entered.
  if (!result.ok) {
    const needed = slotsNeeded(inputs);
    const short = result.diagnostics.some(
      (d) => d.kind === "capacity" || d.kind === "overload",
    );
    if (short && needed > inputs.slots) {
      found.push({
        kind: "window",
        message: `The window holds ${plural(inputs.slots, "presentation slot")} per room, and this needs at least ${needed}. Make the window at least ${needed * source.slotMinutes} minutes long.`,
      });
    }
  }

  // Presentations that would have no judge.
  if (result.ok) {
    const { assignment } = assignJudges(inputs, result.placements, judges);
    const missing = inputs.tasks.length - assignment.length;
    if (
      missing > 0 &&
      judgeShortfalls(inputs, result.placements, judges, assignment).length > 0
    ) {
      const judged = new Set(assignment.map((a) => `${a.entryId}:${a.challengeId}`));
      const memberJudges = judges.filter((j) => j.kind === "member");
      // A challenge no table judge may grade can never be covered by more of them.
      const ungradable = inputs.tasks.some(
        (t) =>
          !judged.has(`${t.entryId}:${t.challengeId}`) &&
          !memberJudges.some((j) => j.challengeIds.includes(t.challengeId)),
      );
      const busiest = Math.max(
        ...[
          ...count(
            result.placements
              .filter((p) => !guestRooms.has(p.roomId))
              .map((p) => p.slot),
          ).values(),
          0,
        ],
      );
      const more = Math.max(
        1,
        Math.ceil((busiest * (MAX_CONSECUTIVE + 1)) / MAX_CONSECUTIVE) - members,
      );
      found.push({
        kind: "judges",
        message: ungradable
          ? `${plural(missing, "presentation")} would have no judge. Check that your judges may grade these challenges.`
          : `${plural(missing, "presentation")} would have no judge. About ${plural(more, "more table judge")} would cover them.`,
      });
    }
  }

  // A general challenge needs more tables, and the judges could staff them.
  const crowded = (id: string) =>
    result.ok
      ? id === generalLast &&
        generalEnd > sponsorEnd &&
        generalEnd > inputs.slots * TIGHT
      : result.diagnostics.some(
          (d) => d.kind === "capacity" && d.challengeId === id && d.rooms > 0,
        );
  const needy = [...generalIds].sort().find(crowded);
  if (needy && spareSeats > 0 && inputs.slots > 0) {
    const have = roomsOf.get(needy) ?? 0;
    const want = Math.ceil(
      (presentations.get(needy) ?? 0) / Math.max(1, Math.floor(inputs.slots * TIGHT)),
    );
    const add = Math.min(spareSeats, want - have);
    const mine = source.rooms.filter((r) => r.challengeId === needy);
    const spot = mine.find((r) => r.table) ?? mine[0];
    if (add >= 1 && spot) {
      found.push({
        kind: "moreTables",
        message: result.ok
          ? `${source.labelOf(needy)} decides when judging ends and your judges can staff ${plural(add, "more table")}. Adding ${add === 1 ? "it" : "them"} would finish sooner.`
          : `${source.labelOf(needy)} does not fit in the window and your judges can staff ${plural(add, "more table")}. Add ${add === 1 ? "it" : "them"} so it fits.`,
        action: {
          type: "addTables",
          challengeId: needy,
          buildingId: spot.buildingId,
          count: add,
        },
      });
    }
  }

  // Sponsor challenges tie for last to finish, and one more room each would
  // help. The day only ends sooner by as much as the slowest of the rest.
  // General finishes where it does because the solver fits it around the
  // sponsors, so its own floor is what counts, not where it finished.
  const tied = [...presentations.keys()]
    .filter((id) => !generalIds.has(id) && finish.get(id) === sponsorEnd)
    .sort();
  if (result.ok && sponsorLast && sponsorEnd >= generalEnd) {
    const bound = (id: string) => {
      const p = presentations.get(id) ?? 0;
      const r = roomsOf.get(id) ?? 0;
      return r > 0 ? Math.ceil(p / (r + 1)) : Infinity;
    };
    const generalFloor = Math.max(
      0,
      ...[...generalIds].map((id) =>
        Math.ceil((presentations.get(id) ?? 0) / Math.max(1, roomsOf.get(id) ?? 0)),
      ),
    );
    const newEnd = Math.max(
      generalFloor,
      ...[...presentations.keys()]
        .filter((id) => !generalIds.has(id) && !tied.includes(id))
        .map((id) => finish.get(id) ?? 0),
      ...tied.map(bound),
    );
    const saved = sponsorEnd - newEnd;
    const spots = tied.map((id) =>
      source.rooms.find((room) => room.challengeId === id),
    );
    if (saved >= 1 && spots.every((spot) => spot)) {
      const taken = new Map<string, Set<string>>();
      const rooms = tied.map((id, i) => {
        const building = spots[i]!.buildingId;
        if (!taken.has(building)) {
          taken.set(
            building,
            new Set(
              source.rooms
                .filter((room) => room.buildingId === building)
                .map((room) => room.name.toLowerCase()),
            ),
          );
        }
        const name = nextRoomName(
          source.rooms.filter((r) => r.challengeId === id).map((r) => r.name),
          source.labelOf(id),
          taken.get(building)!,
        );
        taken.get(building)!.add(name.toLowerCase());
        return { challengeId: id, buildingId: building, name };
      });
      const labels = tied.map(source.labelOf);
      const who =
        labels.length === 1
          ? `${labels[0]} decides`
          : labels.length > 4
            ? `${labels.length} sponsors decide`
            : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)} decide`;
      const needsJudge = members > 0 && unstaffed.length + tied.length > seats;
      found.push({
        kind: "sponsorRoom",
        message: `${who} when judging ends. One more room ${tied.length === 1 ? "for it" : "each"} would finish about ${saved * source.slotMinutes} min sooner.${needsJudge ? ` It would also need ${tied.length === 1 ? "another judge" : "more judges"}.` : ""}`,
        action: { type: "addRooms", rooms },
      });
    }
  }

  // Tables the judges cannot staff are not scheduled; hide them.
  const used = new Set(inputs.rooms.map((room) => room.id));
  const unused = source.rooms.filter((room) => room.table && !used.has(room.id));
  if (unused.length > 0) {
    found.push({
      kind: "unusedTables",
      message: `${plural(unused.length, "table")} won't be used with ${plural(members, "table judge")}. Archive them so they don't show on the room list.`,
      action: { type: "archiveTables", roomIds: unused.map((room) => room.id) },
    });
  }

  return found.slice(0, MAX_ADVICE);
}
