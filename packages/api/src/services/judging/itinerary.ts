// What a hacker sees of their project's judging: the challenges it is in,
// when and where it presents, how each presentation went, and the written
// feedback judges chose to share. Pure, so the rules can be tested without a
// database; the router loads the rows.
//
// Remote challenges are judged without the team in the room, so they never
// appear here.

import { appointmentStatus } from "./appointment-status";
import type { AppointmentStatus } from "./appointment-status";
import { rootOf } from "./scope";
import type { ChallengeMode, ChallengeNode } from "./scope";

export type ItineraryChallenge = ChallengeNode & {
  label: string;
  displayOrder: number;
};

export type ItineraryRoom = {
  id: string;
  challengeId: string;
  name: string;
  building: string | null;
  displayOrder: number;
  archived: boolean;
};

export type ItineraryAppointment = {
  id: string;
  challengeId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
};

export type ItineraryEvaluation = {
  judgeId: string;
  challengeId: string;
  appointmentId: string | null;
  isComplete: boolean;
};

export type ItineraryPresence = {
  judgeId: string;
  roomId: string;
  joinedAt: Date;
  lastSeenAt: Date;
  leftAt: Date | null;
};

/** A top-level challenge the project is judged in, with its sub-prizes. */
export type VisibleChallenge = {
  id: string;
  label: string;
  mode: ChallengeMode;
  /** Labels of the challenges under this one that the project is in. */
  children: string[];
};

/**
 * The project's challenges as hackers see them: grouped under their root
 * (rooms and appointments are per root), remote ones dropped, in the
 * organisers' display order.
 */
export function visibleChallenges(
  challenges: readonly ItineraryChallenge[],
  entryChallengeIds: readonly string[],
): VisibleChallenge[] {
  const byRoot = new Map<
    string,
    { root: ItineraryChallenge; children: ItineraryChallenge[] }
  >();

  for (const id of new Set(entryChallengeIds)) {
    const root = rootOf(challenges, id);
    if (!root || root.mode === "remote") continue;
    const group = byRoot.get(root.id) ?? { root, children: [] };
    if (id !== root.id) {
      const child = challenges.find((challenge) => challenge.id === id);
      if (child) group.children.push(child);
    }
    byRoot.set(root.id, group);
  }

  return [...byRoot.values()]
    .sort((a, b) => byDisplay(a.root, b.root))
    .map(({ root, children }) => ({
      id: root.id,
      label: root.label,
      mode: root.mode,
      children: children.sort(byDisplay).map((child) => child.label),
    }));
}

function byDisplay(
  a: { displayOrder: number; label: string },
  b: { displayOrder: number; label: string },
) {
  return a.displayOrder - b.displayOrder || a.label.localeCompare(b.label);
}

/**
 * The evaluations that belong to one appointment: those written against it,
 * plus untimed ones in the same challenge tree (written before a schedule
 * existed, or after a move cleared the link).
 */
export function evaluationsForAppointment<T extends ItineraryEvaluation>(
  appointment: { id: string; challengeId: string },
  evaluations: readonly T[],
  challenges: readonly ChallengeNode[],
): T[] {
  const root = rootOf(challenges, appointment.challengeId)?.id;
  return evaluations.filter(
    (evaluation) =>
      evaluation.appointmentId === appointment.id ||
      (!evaluation.appointmentId &&
        rootOf(challenges, evaluation.challengeId)?.id === root),
  );
}

// Judges heartbeat every minute. An open presence row whose heartbeat stopped
// (a closed laptop) counts as gone two minutes after the last one, or it would
// hold every later slot in that room open as "incomplete".
const HEARTBEAT_GRACE_MS = 2 * 60 * 1000;

/** Judges whose time in the slot's room overlapped the slot. */
export function judgesPresentDuring(
  slot: { roomId: string; startsAt: Date; endsAt: Date },
  presence: readonly ItineraryPresence[],
): string[] {
  const present = new Set<string>();
  for (const row of presence) {
    if (row.roomId !== slot.roomId) continue;
    const left =
      row.leftAt ?? new Date(row.lastSeenAt.getTime() + HEARTBEAT_GRACE_MS);
    if (row.joinedAt < slot.endsAt && left > slot.startsAt) {
      present.add(row.judgeId);
    }
  }
  return [...present];
}

export type ItineraryAppointmentView = {
  id: string;
  challengeId: string;
  challenge: string;
  children: string[];
  room: string | null;
  building: string | null;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
};

export type UnscheduledChallengeView = {
  challengeId: string;
  challenge: string;
  children: string[];
  rooms: { name: string; building: string | null }[];
  /** A judge has finished an evaluation of the project in this challenge. */
  judged: boolean;
};

export type Itinerary = {
  appointments: ItineraryAppointmentView[];
  unscheduled: UnscheduledChallengeView[];
  /** Some appointment ended with nobody judging the project. */
  missed: boolean;
  /**
   * When the next appointment that has not ended yet ends. Statuses change
   * then, so the client refetches at that moment rather than waiting for its
   * next poll.
   */
  nextEndsAt: Date | null;
};

export function buildItinerary(input: {
  challenges: readonly ItineraryChallenge[];
  entryChallengeIds: readonly string[];
  rooms: readonly ItineraryRoom[];
  appointments: readonly ItineraryAppointment[];
  evaluations: readonly ItineraryEvaluation[];
  presence: readonly ItineraryPresence[];
  now: Date;
}): Itinerary {
  const { challenges, rooms, evaluations, now } = input;
  const visible = visibleChallenges(challenges, input.entryChallengeIds);
  const visibleById = new Map(
    visible.map((challenge) => [challenge.id, challenge]),
  );
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const rootId = (id: string) => rootOf(challenges, id)?.id;

  const appointments: ItineraryAppointmentView[] = [];
  for (const appointment of [...input.appointments].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  )) {
    const challenge = visibleById.get(rootId(appointment.challengeId) ?? "");
    if (!challenge) continue;
    const room = roomById.get(appointment.roomId);
    appointments.push({
      id: appointment.id,
      challengeId: challenge.id,
      challenge: challenge.label,
      children: challenge.children,
      room: room?.name ?? null,
      building: room?.building ?? null,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      status: appointmentStatus(
        {
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          evaluations: evaluationsForAppointment(
            appointment,
            evaluations,
            challenges,
          ),
          presentJudgeIds: judgesPresentDuring(appointment, input.presence),
        },
        now,
      ),
    });
  }

  const unscheduled = visible
    .filter((challenge) => challenge.mode === "unscheduled")
    .map((challenge) => ({
      challengeId: challenge.id,
      challenge: challenge.label,
      children: challenge.children,
      rooms: rooms
        .filter(
          (room) => !room.archived && rootId(room.challengeId) === challenge.id,
        )
        .sort(byDisplayName)
        .map((room) => ({ name: room.name, building: room.building })),
      judged: evaluations.some(
        (evaluation) =>
          evaluation.isComplete &&
          rootId(evaluation.challengeId) === challenge.id,
      ),
    }));

  const upcomingEnds = appointments
    .map((appointment) => appointment.endsAt.getTime())
    .filter((end) => end > now.getTime());

  return {
    appointments,
    unscheduled,
    missed: appointments.some((appointment) => appointment.status === "missed"),
    nextEndsAt: upcomingEnds.length
      ? new Date(Math.min(...upcomingEnds))
      : null,
  };
}

function byDisplayName(
  a: { displayOrder: number; name: string },
  b: { displayOrder: number; name: string },
) {
  return a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);
}

export type FeedbackEvaluation = {
  id: string;
  challengeId: string;
  submittedAt: Date;
};

export type FeedbackResponse = {
  evaluationId: string;
  label: string;
  displayOrder: number;
  value: string;
};

export type FeedbackItem = {
  challenge: string;
  responses: { label: string; value: string }[];
};

/**
 * Written feedback, one item per evaluation that has any to share, in
 * challenge order then the order it arrived. Carries no judge and no score:
 * the router passes only complete member evaluations and their public
 * responses.
 */
export function groupFeedback(
  evaluations: readonly FeedbackEvaluation[],
  responses: readonly FeedbackResponse[],
  challenges: readonly ItineraryChallenge[],
): FeedbackItem[] {
  const challengeById = new Map(
    challenges.map((challenge) => [challenge.id, challenge]),
  );
  const order = (id: string) => challengeById.get(id)?.displayOrder ?? 0;

  return [...evaluations]
    .sort(
      (a, b) =>
        order(a.challengeId) - order(b.challengeId) ||
        (challengeById.get(a.challengeId)?.label ?? "").localeCompare(
          challengeById.get(b.challengeId)?.label ?? "",
        ) ||
        a.submittedAt.getTime() - b.submittedAt.getTime(),
    )
    .map((evaluation) => ({
      challenge: challengeById.get(evaluation.challengeId)?.label ?? "Judging",
      responses: responses
        .filter(
          (response) =>
            response.evaluationId === evaluation.id &&
            response.value.trim() !== "",
        )
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(({ label, value }) => ({ label, value: value.trim() })),
    }))
    .filter((item) => item.responses.length > 0);
}
