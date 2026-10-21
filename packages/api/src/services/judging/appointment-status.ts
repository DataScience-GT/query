// Where one scheduled presentation stands, for the organiser board and the
// hacker itinerary alike. Evaluations decide it once any exist; until then the
// clock does.
//
//   complete    every judge who was in the room has an evaluation that holds
//               every rating, the same rule placings count by
//   incomplete  some evaluation exists, but not all of the above
//   missed      the slot is over and nobody evaluated it
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
  endsAt: Date;
  /** Evaluations of this appointment's project for its challenge. */
  evaluations: readonly { judgeId: string; ratingsComplete: boolean }[];
  /** Judges whose presence in the room overlapped the slot. */
  presentJudgeIds?: readonly string[];
};

export function appointmentStatus(
  input: AppointmentStatusInput,
  now: Date,
): AppointmentStatus {
  if (input.evaluations.length > 0) {
    const completeBy = new Set(
      input.evaluations.filter((e) => e.ratingsComplete).map((e) => e.judgeId),
    );
    const allSubmittedComplete = input.evaluations.every(
      (e) => e.ratingsComplete,
    );
    const everyPresentJudged = (input.presentJudgeIds ?? []).every((id) =>
      completeBy.has(id),
    );
    return allSubmittedComplete && everyPresentJudged
      ? "complete"
      : "incomplete";
  }
  if (now >= input.endsAt) return "missed";
  if (now >= input.startsAt) return "pending";
  return "future";
}
