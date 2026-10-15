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

/** How long after a deadline a write sent before it still lands. */
export const DEADLINE_GRACE_MS = 15_000;

export type TimingInput = {
  /** Whether the edition has a saved schedule. */
  hasSchedule: boolean;
  /** The challenge's effective mode (its root's). */
  mode: ChallengeMode;
  /** The (root) challenge the evaluation is for. */
  challengeId: string;
  /** This judge's submitted evaluation of the project for the challenge. */
  evaluation: { appointmentId: string | null } | null;
  /** The project's presentation for the challenge in the saved schedule. */
  appointment: { id: string; startsAt: Date; deadlineAt: Date } | null;
  /** The challenge served by the room the judge is sitting in, if any. */
  presenceChallengeId: string | null;
  /** DEADLINE_GRACE_MS for a write; reads leave it at 0. */
  graceMs?: number;
};

export type EvaluationTiming =
  | {
      canEdit: true;
      /** Set while a presentation is running: the draft is submitted then. */
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
      deadlineAt: deadline && now < deadline ? deadline : null,
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

  return {
    canEdit: true,
    deadlineAt:
      now < input.appointment.deadlineAt ? input.appointment.deadlineAt : null,
    appointmentId: input.appointment.id,
  };
}
