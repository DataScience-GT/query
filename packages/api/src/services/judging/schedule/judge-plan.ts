import { inJudgeScope } from "../evaluation-store";
import type { ChallengeRow } from "../evaluation-store";
import type { Judge } from "../principal";
import { scheduledChallengeIds, taskKey } from "./inputs";
import type { Placement, PlanInputs, PlanRoom } from "./inputs";
import { mayGrade } from "./judges";
import type { JudgeAssignment, JudgeInput } from "./judges";

// What the router hands the judge assigner and reads back: who can judge,
// which saved appointments are up for assignment, and the numbers the board
// shows. No database in here; the router reads the rows and writes the result.

export type JudgeRow = {
  id: string;
  kind: "member" | "guest";
  userId: string | null;
  displayName: string;
};

/** A guest's session: the room they scanned in at. */
export type GuestSeat = { judgeId: string; roomId: string; createdAt: Date };

export type Roster = {
  /** Judges who can be given presentations: members, and guests with a room. */
  judges: JudgeInput[];
  /** Every judge's name, those who cannot be given presentations too. */
  names: Map<string, string>;
};

/**
 * The judges an edition can assign. A member may grade whatever the judge
 * desk lets them see; a guest only their room's challenge (inJudgeScope),
 * and only in that room, which is the room of their latest session. A guest
 * with no session, or whose room takes no appointments, has nothing to grade.
 */
export function rosterOf(source: {
  hackathonId: string;
  judges: readonly JudgeRow[];
  /** Sessions that have not been revoked. */
  seats: readonly GuestSeat[];
  challenges: readonly ChallengeRow[];
  /** The rooms that take appointments. */
  rooms: readonly PlanRoom[];
}): Roster {
  const scheduled = [...scheduledChallengeIds(source.challenges)].sort();
  const rooms = new Map(source.rooms.map((room) => [room.id, room]));

  const seatOf = new Map<string, GuestSeat>();
  for (const seat of source.seats) {
    const current = seatOf.get(seat.judgeId);
    if (!current || seat.createdAt > current.createdAt)
      seatOf.set(seat.judgeId, seat);
  }

  const judges: JudgeInput[] = [];
  for (const row of source.judges) {
    if (row.kind === "member") {
      const principal: Judge = {
        kind: "member",
        hackathonId: source.hackathonId,
        userId: row.userId ?? "",
        judgeId: row.id,
        displayName: row.displayName,
      };
      judges.push({
        id: row.id,
        kind: "member",
        challengeIds: scheduled.filter((id) =>
          inJudgeScope(principal, source.challenges, id),
        ),
        roomId: null,
      });
      continue;
    }
    const room = rooms.get(seatOf.get(row.id)?.roomId ?? "");
    if (!room) continue;
    const principal: Judge = {
      kind: "guest",
      hackathonId: source.hackathonId,
      sessionId: "",
      linkId: "",
      roomId: room.id,
      roomChallengeId: room.challengeId,
      judgeId: row.id,
      displayName: row.displayName,
    };
    judges.push({
      id: row.id,
      kind: "guest",
      challengeIds: scheduled.filter((id) =>
        inJudgeScope(principal, source.challenges, id),
      ),
      roomId: room.id,
    });
  }
  judges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    judges,
    names: new Map(source.judges.map((row) => [row.id, row.displayName])),
  };
}

export type SavedAppointment = {
  id: string;
  entryId: string;
  challengeId: string;
  roomId: string;
  slot: number;
  assignedJudgeId: string | null;
  /** Entered no more: needs no judge. */
  removed: boolean;
  /** Not started, nothing evaluated or drafted: its judge may be chosen anew. */
  open: boolean;
};

/**
 * The saved schedule as the judge assigner takes it: the appointments still
 * entered that are open or already have a judge. `keep` is the judges of those
 * that are not open, which stay; `current` is every judge there is now.
 */
export function judgePlanOf(source: {
  /** Every room, archived ones too; a room with no building counts as its own. */
  rooms: readonly {
    id: string;
    challengeId: string;
    buildingId: string | null;
  }[];
  sponsorChallengeIds: ReadonlySet<string>;
  grid: Pick<PlanInputs, "slots" | "sameGap" | "crossGap">;
  appointments: readonly SavedAppointment[];
  /** The judges on the roster: those who can be given presentations. */
  judgeIds: ReadonlySet<string>;
}) {
  // One that is over or under way with nobody assigned has no judge to find,
  // and one whose judge has left the roster ties up nobody who is still on it.
  const live = source.appointments.filter(
    (a) =>
      !a.removed &&
      (a.open ||
        (a.assignedJudgeId !== null && source.judgeIds.has(a.assignedJudgeId))),
  );
  const inputs: PlanInputs = {
    ...source.grid,
    rooms: source.rooms.map((room) => ({
      id: room.id,
      challengeId: room.challengeId,
      buildingId: room.buildingId ?? `room:${room.id}`,
    })),
    tasks: live.map((a) => ({
      entryId: a.entryId,
      challengeId: a.challengeId,
      sponsor: source.sponsorChallengeIds.has(a.challengeId),
    })),
  };
  const placements: Placement[] = live.map((a) => ({
    entryId: a.entryId,
    challengeId: a.challengeId,
    roomId: a.roomId,
    slot: a.slot,
  }));
  const given = (a: SavedAppointment): JudgeAssignment => ({
    entryId: a.entryId,
    challengeId: a.challengeId,
    judgeId: a.assignedJudgeId!,
  });
  return {
    inputs,
    placements,
    keep: live.filter((a) => !a.open && a.assignedJudgeId).map(given),
    current: live.filter((a) => a.assignedJudgeId).map(given),
  };
}

/**
 * What `assignment` changes on the open appointments: the new judge of every
 * one whose judge differs, null where it now has none.
 */
export function judgeChanges(
  appointments: readonly SavedAppointment[],
  assignment: readonly JudgeAssignment[],
): { id: string; assignedJudgeId: string | null }[] {
  const chosen = new Map(
    assignment.map((a) => [taskKey(a.entryId, a.challengeId), a.judgeId]),
  );
  return appointments
    .filter((a) => a.open && !a.removed)
    .flatMap((a) => {
      const assignedJudgeId =
        chosen.get(taskKey(a.entryId, a.challengeId)) ?? null;
      return assignedJudgeId === a.assignedJudgeId
        ? []
        : [{ id: a.id, assignedJudgeId }];
    });
}

export type JudgeChoice = {
  judgeId: string;
  /** The appointment of theirs in the same slot, if they are already booked. */
  bookedWith: string | null;
};

/** Judges who may grade `appointment`, and whether each is free in its slot. */
export function judgeChoices(
  roster: Roster,
  appointment: Pick<SavedAppointment, "id" | "challengeId" | "roomId" | "slot">,
  all: readonly SavedAppointment[],
): JudgeChoice[] {
  return roster.judges
    .filter((judge) => mayGrade(judge, appointment))
    .map((judge) => ({
      judgeId: judge.id,
      bookedWith:
        all.find(
          (other) =>
            other.id !== appointment.id &&
            !other.removed &&
            other.assignedJudgeId === judge.id &&
            other.slot === appointment.slot,
        )?.id ?? null,
    }));
}
