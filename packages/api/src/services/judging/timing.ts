import type { ChallengeMode } from "./scope";

// When a judge may write an evaluation, and against what clock. Pure: the desk
// loads the rows, this decides.
//
// Nothing is timed until organisers save a schedule, and a challenge whose
// root is unscheduled or remote is never timed: open the project and judge it.
// A scheduled challenge is judged at its presentation. The judge has to be
// sitting in a room that serves the challenge, and the presentation has to
// have started. Until the slot's deadline (setup plus judging minutes in) the
// answers run against that deadline, and a draft still open when it passes is
// submitted for the judge. The deadline is a hard end: after it the judge can
// neither submit a first evaluation nor edit one they already submitted.
// Writes get DEADLINE_GRACE_MS past it, so an answer sent in the last seconds
// is not refused for the time it spent on the network.
//
// Where nothing is timed, a submitted evaluation stays editable while judging
// is open.
//
// A presentation can have one judge assigned to it. From its start until
// its takeover time only that judge may start grading it. That is
// TAKEOVER_AFTER_MS after the start, or sooner in a short slot: setup plus half
// the judging time, so the takeover always opens well before the deadline.
// After that any
// judge who may grade it there can, as long as the assigned judge has not
// started (their draft holds the project, see grading-hold.ts). The assignment
// is never rewritten to hand the project over.

/** How long after a deadline a write sent before it still lands. */
export const DEADLINE_GRACE_MS = 15_000;

// The assigned judge may be walking over from another room, so the first
// minutes are theirs. After that a project is better graded by someone in the
// room than not at all.
/** The longest after a presentation starts that only its assigned judge may grade it. */
export const TAKEOVER_AFTER_MS = 5 * 60_000;

/** The schedule's minutes for a presentation, which set how soon a takeover opens. */
export type SlotMinutes = { setupMinutes: number; judgingMinutes: number };

export type TimingInput = {
  /** The judge asking. */
  judgeId: string;
  /** Whether the edition has a saved schedule. */
  hasSchedule: boolean;
  /** The challenge's effective mode (its root's). */
  mode: ChallengeMode;
  /** The (root) challenge the evaluation is for. */
  challengeId: string;
  /** This judge's submitted evaluation of the project for the challenge. */
  evaluation: { appointmentId: string | null } | null;
  /** The project's presentation for the challenge in the saved schedule. */
  appointment: {
    id: string;
    startsAt: Date;
    deadlineAt: Date;
    /** The judge the presentation is assigned to; null or absent for none. */
    assignedJudgeId?: string | null;
    /** The saved schedule's minutes; absent, the takeover waits TAKEOVER_AFTER_MS. */
    slot?: SlotMinutes;
  } | null;
  /** The challenge served by the room the judge is sitting in, if any. */
  presenceChallengeId: string | null;
  /** DEADLINE_GRACE_MS for a write; reads leave it at 0. */
  graceMs?: number;
};

export type EvaluationTiming =
  | {
      canEdit: true;
      /**
       * Set while a presentation has not ended: the draft is submitted then.
       * A write in the grace window gets a deadline that has just passed.
       */
      deadlineAt: Date | null;
      appointmentId: string | null;
    }
  | {
      canEdit: false;
      reason: string;
      /** When the judge can start, if waiting is all it takes. */
      opensAt: Date | null;
      /** Shut because the presentation's deadline has passed. */
      ended: boolean;
    };

const ENDED =
  "Judging for this presentation ended at its deadline, so scores for it are final.";

// Never names the judge.
const reserved = (minutes: number) =>
  `Another judge is assigned to this presentation. If they have not started ${minutes} minutes in, you can take it.`;

/** When a presentation assigned to someone else opens to everyone else. */
export function takeoverAt(startsAt: Date, slot?: SlotMinutes): Date {
  const afterMs = slot
    ? Math.min(
        TAKEOVER_AFTER_MS,
        (slot.setupMinutes + slot.judgingMinutes / 2) * 60_000,
      )
    : TAKEOVER_AFTER_MS;
  return new Date(startsAt.getTime() + afterMs);
}

/**
 * When a presentation opens to `judgeId`, if it is held back for another judge
 * until then. Null when nobody is assigned, the judge is the one assigned, or
 * the takeover time has passed. Whether the assigned judge has started is not
 * decided here: a draft of theirs holds the project (grading-hold.ts).
 */
export function reservedUntil(
  appointment: {
    startsAt: Date;
    assignedJudgeId?: string | null;
    slot?: SlotMinutes;
  } | null,
  judgeId: string,
  now: Date,
): Date | null {
  const assigned = appointment?.assignedJudgeId ?? null;
  if (!appointment || !assigned || assigned === judgeId) return null;
  const opens = takeoverAt(appointment.startsAt, appointment.slot);
  return now < opens ? opens : null;
}

export function evaluationTiming(
  input: TimingInput,
  now: Date,
): EvaluationTiming {
  const timed = input.hasSchedule && input.mode === "scheduled";
  const deadline = timed ? (input.appointment?.deadlineAt ?? null) : null;
  const ended =
    deadline !== null &&
    now.getTime() >= deadline.getTime() + (input.graceMs ?? 0);

  if (input.evaluation) {
    if (ended) {
      return { canEdit: false, reason: ENDED, opensAt: null, ended: true };
    }
    return {
      canEdit: true,
      // Counts down the time left to edit; nothing is submitted for the judge.
      deadlineAt: deadline,
      appointmentId: input.evaluation.appointmentId,
    };
  }

  if (!timed) {
    return { canEdit: true, deadlineAt: null, appointmentId: null };
  }

  if (!input.appointment) {
    return {
      canEdit: false,
      reason:
        "This project has no presentation slot for this challenge yet. Ask an organiser to place it on the schedule.",
      opensAt: null,
      ended: false,
    };
  }

  if (ended) {
    return { canEdit: false, reason: ENDED, opensAt: null, ended: true };
  }

  // Before the room: nothing the judge does now helps until the takeover time.
  const opensAt = reservedUntil(input.appointment, input.judgeId, now);
  if (opensAt) {
    const minutes =
      (opensAt.getTime() - input.appointment.startsAt.getTime()) / 60_000;
    return {
      canEdit: false,
      reason: reserved(minutes),
      opensAt,
      ended: false,
    };
  }

  if (input.presenceChallengeId !== input.challengeId) {
    return {
      canEdit: false,
      reason:
        "Join the room or table that judges this challenge to evaluate this project.",
      opensAt: null,
      ended: false,
    };
  }

  if (now < input.appointment.startsAt) {
    return {
      canEdit: false,
      reason:
        "This project has not presented yet. You can judge it once its presentation starts.",
      opensAt: input.appointment.startsAt,
      ended: false,
    };
  }

  // Not ended, so the deadline is still ahead or inside the write grace. A
  // draft first saved in the grace window must still carry it, or nothing
  // submits it for the judge.
  return {
    canEdit: true,
    deadlineAt: input.appointment.deadlineAt,
    appointmentId: input.appointment.id,
  };
}
