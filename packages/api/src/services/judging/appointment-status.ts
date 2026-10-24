import { DEADLINE_GRACE_MS } from "./timing";

// Where one scheduled presentation stands, for the organiser board and the
// hacker itinerary alike. Evaluations decide it once any exist; until then the
// clock does.
//
//   complete    every evaluation holds every rating, the same rule placings
//               count by. A project is graded once per challenge
//               (grading-hold.ts), so another judge sitting in the room
//               cannot add one and does not hold the slot open.
//   incomplete  some evaluation exists, but one is short of a rating
//   missed      grading has closed (the deadline and its grace, timing.ts)
//               and nobody evaluated it. Teardown time after the deadline
//               cannot save it, so it does not read "on now" through it.
//   pending     the slot has started, nothing submitted yet
//   future      the slot has not started

export type AppointmentStatus =
  | "complete"
  | "incomplete"
  | "missed"
  | "pending"
  | "future";

export type AppointmentStatusInput = {
  startsAt: Date;
  deadlineAt: Date;
  /** Evaluations of this appointment's project for its challenge. */
  evaluations: readonly { judgeId: string; ratingsComplete: boolean }[];
};

/** When a judge can no longer submit for the appointment. */
export function gradingClosesAt(appointment: { deadlineAt: Date }): Date {
  return new Date(appointment.deadlineAt.getTime() + DEADLINE_GRACE_MS);
}

export function appointmentStatus(
  input: AppointmentStatusInput,
  now: Date,
): AppointmentStatus {
  if (input.evaluations.length > 0) {
    return input.evaluations.every((e) => e.ratingsComplete)
      ? "complete"
      : "incomplete";
  }
  if (now >= gradingClosesAt(input)) return "missed";
  if (now >= input.startsAt) return "pending";
  return "future";
}
