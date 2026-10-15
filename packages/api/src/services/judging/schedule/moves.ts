import type { Placement } from "./inputs";
import { compareScores, scoreSchedule } from "./rules";
import type { PlanScore } from "./rules";

// Where one presentation can go once a schedule is saved: a late import that
// needs a slot, or a team that missed theirs. Every other appointment stays
// put. A change of building may get only the same-building break, since on
// the day a short walk beats no slot at all, but each choice says how many
// breaks it shortens and the ones that shorten none come first.

export type MoveRoom = {
  id: string;
  challengeId: string;
  /** Null once a room loses its building; it then counts as its own. */
  buildingId: string | null;
};

export type MoveChoice = {
  roomId: string;
  slot: number;
  /** Breaks next to this presentation that fall short of the walk between buildings. */
  reducedBreaks: number;
  score: PlanScore;
};

export type MoveRequest = {
  slots: number;
  sameGap: number;
  crossGap: number;
  /** Every room the schedule mentions, archived ones included. */
  rooms: readonly MoveRoom[];
  sponsorChallengeIds: ReadonlySet<string>;
  /** Every appointment except the one being placed. */
  booked: readonly Placement[];
  task: { entryId: string; challengeId: string };
  /** Where it is now; null for a presentation with no appointment yet. */
  current: { roomId: string; slot: number } | null;
  /** Rooms that may take it: in service, for its challenge, with a judge in. */
  openRoomIds: readonly string[];
  /** The first slot that has not started yet. */
  fromSlot: number;
};

/** Every place the presentation can go, best first. */
export function moveChoices(request: MoveRequest): MoveChoice[] {
  const buildingOf = new Map(
    request.rooms.map((room) => [room.id, room.buildingId ?? `room:${room.id}`]),
  );
  const challengeOf = new Map(request.rooms.map((r) => [r.id, r.challengeId]));
  const taken = new Set(request.booked.map((p) => `${p.roomId}@${p.slot}`));
  const siblings = request.booked.filter(
    (p) => p.entryId === request.task.entryId,
  );

  const scoring = {
    rooms: [...buildingOf].map(([id, buildingId]) => ({ id, buildingId })),
    tasks: [...request.booked, request.task].map((p) => ({
      entryId: p.entryId,
      challengeId: p.challengeId,
      sponsor: request.sponsorChallengeIds.has(p.challengeId),
    })),
  };

  const choices: MoveChoice[] = [];
  for (const roomId of request.openRoomIds) {
    if (challengeOf.get(roomId) !== request.task.challengeId) continue;
    const building = buildingOf.get(roomId)!;

    for (let slot = request.fromSlot; slot < request.slots; slot += 1) {
      if (taken.has(`${roomId}@${slot}`)) continue;
      if (
        request.current &&
        request.current.roomId === roomId &&
        request.current.slot === slot
      ) {
        continue;
      }

      // Only the presentations just before and after this one matter: the
      // rest of the project's day is already settled.
      let before: Placement | null = null;
      let after: Placement | null = null;
      let clash = false;
      for (const p of siblings) {
        if (p.slot === slot) clash = true;
        else if (p.slot < slot && (!before || p.slot > before.slot)) before = p;
        else if (p.slot > slot && (!after || p.slot < after.slot)) after = p;
      }
      if (clash) continue;

      let fits = true;
      let reducedBreaks = 0;
      for (const [first, second, otherRoom] of [
        [before?.slot, slot, before?.roomId],
        [slot, after?.slot, after?.roomId],
      ] as const) {
        if (first === undefined || second === undefined) continue;
        const gap = second - first - 1;
        if (gap < request.sameGap) fits = false;
        else if (
          buildingOf.get(otherRoom!) !== building &&
          gap < request.crossGap
        ) {
          reducedBreaks += 1;
        }
      }
      if (!fits) continue;

      const placed: Placement = {
        entryId: request.task.entryId,
        challengeId: request.task.challengeId,
        roomId,
        slot,
      };
      choices.push({
        roomId,
        slot,
        reducedBreaks,
        score: scoreSchedule(scoring, [...request.booked, placed]),
      });
    }
  }

  return choices.sort(
    (a, b) =>
      Number(a.reducedBreaks > 0) - Number(b.reducedBreaks > 0) ||
      compareScores(a.score, b.score) ||
      a.slot - b.slot ||
      (a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0),
  );
}
