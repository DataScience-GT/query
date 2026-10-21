import { taskKey } from "./inputs";
import type { Placement, PlanInputs, PlanTask } from "./inputs";

// The schedule's rules and its yardstick, written separately from the solver
// on purpose: every candidate the solver hands back is re-checked here, so a
// bug in its bookkeeping shows up as a refused preview rather than two
// projects booked into one room.

/**
 * Lower is better, compared left to right, all in slots:
 *   0  when the last sponsor presentation ends
 *   1  empty slots inside sponsor rooms' busy spans, summed
 *   2  when the last presentation of all ends
 *   3  how often a project changes building between presentations
 *   4  minus the empty slots between each project's presentations, so more
 *      breathing room wins once everything else ties
 */
export type PlanScore = [number, number, number, number, number];

export function compareScores(a: PlanScore, b: PlanScore): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

/**
 * Two back-to-back presentations of one project in different buildings with
 * less than the cross-building break between them, allowed only when an
 * organiser accepts shorter breaks.
 */
export type ReducedBreak = {
  entryId: string;
  fromRoomId: string;
  toRoomId: string;
  /** Empty slots actually left between the two. */
  gap: number;
};

type RoomBuilding = { id: string; buildingId: string };

/** Each project's placements, earliest first. */
function itineraries(placements: readonly Placement[]) {
  const byEntry = new Map<string, Placement[]>();
  for (const p of placements) {
    const list = byEntry.get(p.entryId);
    if (list) list.push(p);
    else byEntry.set(p.entryId, [p]);
  }
  for (const list of byEntry.values()) list.sort((a, b) => a.slot - b.slot);
  return byEntry;
}

/**
 * Checks a complete schedule against the hard rules. With `relaxed`, a change
 * of building needs only the same-building break, and each place that uses
 * the allowance is listed in `reducedBreaks`.
 */
export function validateSchedule(
  inputs: PlanInputs,
  placements: readonly Placement[],
  options: { relaxed: boolean },
) {
  const errors = new Set<string>();
  const reducedBreaks: ReducedBreak[] = [];
  const rooms = new Map(inputs.rooms.map((room) => [room.id, room]));
  const tasks = new Map(
    inputs.tasks.map((task) => [taskKey(task.entryId, task.challengeId), task]),
  );
  const placed = new Set<string>();
  const cells = new Set<string>();
  const known: Placement[] = [];

  for (const p of placements) {
    const key = taskKey(p.entryId, p.challengeId);
    const room = rooms.get(p.roomId);
    if (!tasks.has(key)) {
      errors.add(`No such presentation: ${key}.`);
      continue;
    }
    if (!room) {
      errors.add(`No such room: ${p.roomId}.`);
      continue;
    }
    if (placed.has(key)) errors.add(`${key} is booked more than once.`);
    placed.add(key);
    if (room.challengeId !== p.challengeId) {
      errors.add(`${key} is in room ${room.id}, which judges another challenge.`);
    }
    if (!Number.isInteger(p.slot) || p.slot < 0 || p.slot >= inputs.slots) {
      errors.add(`${key} is outside the judging window.`);
    }
    const cell = `${p.roomId}@${p.slot}`;
    if (cells.has(cell)) errors.add(`Room ${p.roomId} is double-booked.`);
    cells.add(cell);
    known.push(p);
  }

  for (const key of tasks.keys()) {
    if (!placed.has(key)) errors.add(`${key} has no appointment.`);
  }

  for (const [entryId, list] of itineraries(known)) {
    for (let i = 1; i < list.length; i += 1) {
      const before = list[i - 1]!;
      const after = list[i]!;
      const gap = after.slot - before.slot - 1;
      const cross =
        rooms.get(before.roomId)!.buildingId !==
        rooms.get(after.roomId)!.buildingId;
      const strict = cross ? inputs.crossGap : inputs.sameGap;
      const needed = options.relaxed ? inputs.sameGap : strict;
      if (gap < needed) {
        errors.add(`${entryId} has too little time between presentations.`);
      } else if (gap < strict) {
        reducedBreaks.push({
          entryId,
          fromRoomId: before.roomId,
          toRoomId: after.roomId,
          gap,
        });
      }
    }
  }

  return { valid: errors.size === 0, errors: [...errors], reducedBreaks };
}

/**
 * Scores placements without checking them. Rooms need only their building,
 * so a saved schedule whose room has since lost one can still be scored.
 */
export function scoreSchedule(
  inputs: { rooms: readonly RoomBuilding[]; tasks: readonly PlanTask[] },
  placements: readonly Placement[],
): PlanScore {
  const building = new Map(inputs.rooms.map((r) => [r.id, r.buildingId]));
  const sponsor = new Set(
    inputs.tasks
      .filter((t) => t.sponsor)
      .map((t) => taskKey(t.entryId, t.challengeId)),
  );

  let sponsorFinish = 0;
  let overallFinish = 0;
  const sponsorRooms = new Map<string, number[]>();
  for (const p of placements) {
    overallFinish = Math.max(overallFinish, p.slot + 1);
    if (!sponsor.has(taskKey(p.entryId, p.challengeId))) continue;
    sponsorFinish = Math.max(sponsorFinish, p.slot + 1);
    const slots = sponsorRooms.get(p.roomId);
    if (slots) slots.push(p.slot);
    else sponsorRooms.set(p.roomId, [p.slot]);
  }

  let idle = 0;
  for (const slots of sponsorRooms.values()) {
    idle += Math.max(...slots) - Math.min(...slots) + 1 - slots.length;
  }

  let changes = 0;
  // Kept negative as it accumulates, so a schedule with no breaks scores 0
  // rather than -0.
  let lessBreaks = 0;
  for (const list of itineraries(placements).values()) {
    for (let i = 1; i < list.length; i += 1) {
      const before = list[i - 1]!;
      const after = list[i]!;
      if (building.get(before.roomId) !== building.get(after.roomId)) {
        changes += 1;
      }
      lessBreaks -= after.slot - before.slot - 1;
    }
  }

  return [sponsorFinish, idle, overallFinish, changes, lessBreaks];
}
