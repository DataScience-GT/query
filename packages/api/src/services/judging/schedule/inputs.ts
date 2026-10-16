import { createHash } from "node:crypto";
import { isSponsorChallenge, rootOf } from "../scope";
import type { ChallengeMode } from "../scope";
import { gridOf } from "./slots";
import type { ScheduleTiming } from "./slots";

// What the solver is given. Only rooms that can host a timed presentation
// count: not archived, in a building (travel time depends on it), and serving
// a top-level challenge judged on the schedule. A task is one project
// presenting for one such challenge.

export type PlanRoom = { id: string; challengeId: string; buildingId: string };

/** `sponsor` is every challenge but the general ones; those finish first. */
export type PlanTask = { entryId: string; challengeId: string; sponsor: boolean };

export type PlanInputs = {
  rooms: PlanRoom[];
  tasks: PlanTask[];
  slots: number;
  /** Empty slots between two presentations in the same building. */
  sameGap: number;
  /** Empty slots when the project walks to another building. */
  crossGap: number;
};

/** One task in one room at one slot. */
export type Placement = {
  entryId: string;
  challengeId: string;
  roomId: string;
  slot: number;
};

export type SourceChallenge = {
  id: string;
  parentId: string | null;
  mode: ChallengeMode;
  isGeneral: boolean;
};

export type SourceRoom = {
  id: string;
  challengeId: string;
  buildingId: string | null;
  archivedAt: Date | null;
};

/** A judging_entry_challenge row whose entry is not deleted. */
export type SourceMembership = { entryId: string; challengeId: string };

export const taskKey = (entryId: string, challengeId: string) =>
  `${entryId}:${challengeId}`;

const byId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const byTask = (a: PlanTask, b: PlanTask) =>
  a.entryId !== b.entryId
    ? a.entryId < b.entryId
      ? -1
      : 1
    : a.challengeId < b.challengeId
      ? -1
      : a.challengeId > b.challengeId
        ? 1
        : 0;

/** Ids of the challenges that get timed appointments. */
export function scheduledChallengeIds(
  challenges: readonly SourceChallenge[],
): Set<string> {
  return new Set(
    challenges
      .filter(
        (c) => c.mode === "scheduled" && rootOf(challenges, c.id)?.id === c.id,
      )
      .map((c) => c.id),
  );
}

/** Rooms and tasks for the solver, sorted by id so its output is stable. */
export function selectPlan(source: {
  challenges: readonly SourceChallenge[];
  rooms: readonly SourceRoom[];
  memberships: readonly SourceMembership[];
}): { rooms: PlanRoom[]; tasks: PlanTask[] } {
  const scheduled = scheduledChallengeIds(source.challenges);
  const sponsor = new Set(
    source.challenges.filter(isSponsorChallenge).map((c) => c.id),
  );

  const rooms = source.rooms
    .filter(
      (room) =>
        !room.archivedAt && !!room.buildingId && scheduled.has(room.challengeId),
    )
    .map((room) => ({
      id: room.id,
      challengeId: room.challengeId,
      buildingId: room.buildingId!,
    }))
    .sort(byId);

  const seen = new Set<string>();
  const tasks: PlanTask[] = [];
  for (const row of source.memberships) {
    const key = taskKey(row.entryId, row.challengeId);
    if (!scheduled.has(row.challengeId) || seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      entryId: row.entryId,
      challengeId: row.challengeId,
      sponsor: sponsor.has(row.challengeId),
    });
  }
  tasks.sort(byTask);

  return { rooms, tasks };
}

export function planInputs(
  plan: { rooms: PlanRoom[]; tasks: PlanTask[] },
  timing: ScheduleTiming,
): PlanInputs {
  return { ...plan, ...gridOf(timing) };
}

const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Everything a solve depends on. Two previews with the same fingerprint have
 * the same answer, because the solver is deterministic.
 */
export function planFingerprint(
  plan: { rooms: PlanRoom[]; tasks: PlanTask[] },
  timing: ScheduleTiming,
): string {
  return sha256({
    timing: [
      timing.windowStart.toISOString(),
      timing.windowEnd.toISOString(),
      timing.setupMinutes,
      timing.judgingMinutes,
      timing.teardownMinutes,
      timing.sameBuildingBreakMinutes,
      timing.crossBuildingBreakMinutes,
    ],
    rooms: [...plan.rooms]
      .sort(byId)
      .map((r) => [r.id, r.challengeId, r.buildingId]),
    tasks: [...plan.tasks]
      .sort(byTask)
      .map((t) => [t.entryId, t.challengeId, t.sponsor]),
  });
}

/**
 * Binds a save to the exact schedule the organiser reviewed: the inputs it
 * came from, whether breaks were shortened, and every placement.
 */
export function candidateKey(
  fingerprint: string,
  relaxed: boolean,
  placements: readonly Placement[],
): string {
  const rows = placements
    .map((p) => [p.entryId, p.challengeId, p.roomId, p.slot] as const)
    .sort((a, b) =>
      a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
    );
  return sha256({ fingerprint, relaxed, rows });
}
