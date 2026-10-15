import { appointmentStatus } from "../appointment-status";
import type { AppointmentStatus } from "../appointment-status";

// The organiser's view of a saved schedule: where each appointment stands and
// which rooms have someone in them right now.

/** A room counts as staffed while a judge's heartbeat is this recent. */
export const STAFFED_WITHIN_MS = 15 * 60_000;

export type BoardEvaluation = {
  judgeId: string;
  entryId: string;
  challengeId: string;
  appointmentId: string | null;
  isComplete: boolean;
};

export type BoardPresence = {
  judgeId: string;
  roomId: string;
  joinedAt: Date;
  lastSeenAt: Date;
  leftAt: Date | null;
};

type Booked = {
  id: string;
  entryId: string;
  challengeId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
};

/** Rooms with a judge still in them and heard from in the last 15 minutes. */
export function staffedRoomIds(
  presence: readonly BoardPresence[],
  now: Date,
): Set<string> {
  const since = now.getTime() - STAFFED_WITHIN_MS;
  return new Set(
    presence
      .filter((p) => !p.leftAt && p.lastSeenAt.getTime() >= since)
      .map((p) => p.roomId),
  );
}

/**
 * Each appointment with its status, how many evaluations it has, and whether
 * an organiser may move it: only before it starts, or once it has passed
 * with nobody judging it. An evaluation belongs to an appointment when it
 * names it, or, when it names none, when it is for the same project and its
 * challenge sits under the appointment's.
 */
export function withStatus<A extends Booked>(
  appointments: readonly A[],
  evaluations: readonly BoardEvaluation[],
  presence: readonly BoardPresence[],
  rootIdOf: (challengeId: string) => string | null,
  now: Date,
): (A & {
  status: AppointmentStatus;
  canMove: boolean;
  evaluationCount: number;
})[] {
  const byEntry = new Map<string, BoardEvaluation[]>();
  for (const evaluation of evaluations) {
    const list = byEntry.get(evaluation.entryId);
    if (list) list.push(evaluation);
    else byEntry.set(evaluation.entryId, [evaluation]);
  }
  const byRoom = new Map<string, BoardPresence[]>();
  for (const row of presence) {
    const list = byRoom.get(row.roomId);
    if (list) list.push(row);
    else byRoom.set(row.roomId, [row]);
  }

  return appointments.map((appointment) => {
    const mine = (byEntry.get(appointment.entryId) ?? []).filter((e) =>
      e.appointmentId
        ? e.appointmentId === appointment.id
        : rootIdOf(e.challengeId) === appointment.challengeId,
    );
    // Seen in the room at some point during the slot. An open row's last
    // heartbeat stands in for when the judge left.
    const presentJudgeIds = (byRoom.get(appointment.roomId) ?? [])
      .filter(
        (p) =>
          p.joinedAt < appointment.endsAt &&
          (p.leftAt ?? p.lastSeenAt) >= appointment.startsAt,
      )
      .map((p) => p.judgeId);

    const status = appointmentStatus(
      {
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        evaluations: mine,
        presentJudgeIds,
      },
      now,
    );
    return {
      ...appointment,
      status,
      canMove: status === "future" || status === "missed",
      evaluationCount: mine.length,
    };
  });
}
