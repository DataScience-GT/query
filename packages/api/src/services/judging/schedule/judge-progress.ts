import { DEADLINE_GRACE_MS, takeoverAt } from "../timing";
import { belongsTo } from "./board";

// How far the judge assigned to a presentation has got, for the organiser's
// live board. Pure: the router loads the rows, this decides. Organisers see
// judge names on the board already, but this says only whether the assigned
// judge or someone else is on the presentation, not who.
//
// From the presentation's start its assigned judge has until its takeover time
// (timing.ts takeoverAt) to begin. After that any judge who may grade it can
// take it over, which the judge desk allows; the assignment itself is never
// rewritten. An evaluation or a draft is the sign a judge has begun.
//
// Once the deadline and the grace a last write gets have passed, a draft still
// carrying its deadline is about to be submitted for its judge
// (evaluation-store reconcileDueDrafts). One that lost it never will be: it
// was empty, or could not be submitted, so it no longer counts as a start.

/**
 * Where a started presentation's grading stands against its assigned judge:
 * "grading" (their draft is open), "graded" (they submitted), "taken_over"
 * (another judge has a draft or an evaluation), "not_started" (nobody has
 * begun and the takeover time has passed).
 */
export type JudgeProgress = "grading" | "graded" | "taken_over" | "not_started";

type Started = { judgeId: string };
type Draft = Started & { updatedAt: Date; deadlineAt: Date | null };

/**
 * Null when there is nothing to say yet: no assigned judge, a presentation
 * that has not started, or one nobody has begun within the takeover window.
 */
export function judgeProgress(
  input: {
    startsAt: Date;
    /** The presentation's deadline: judging for it ends here. */
    deadlineAt: Date;
    assignedJudgeId: string | null;
    /** Judges who submitted an evaluation of the presentation. */
    evaluations: readonly Started[];
    /** Judges with a draft of it open. */
    drafts: readonly Draft[];
  },
  now: Date,
): JudgeProgress | null {
  const { assignedJudgeId } = input;
  if (!assignedJudgeId || now < input.startsAt) return null;

  if (input.evaluations.length > 0) {
    return input.evaluations.some((e) => e.judgeId === assignedJudgeId)
      ? "graded"
      : "taken_over";
  }
  const ended = now.getTime() >= input.deadlineAt.getTime() + DEADLINE_GRACE_MS;
  const drafts = ended
    ? input.drafts.filter((draft) => draft.deadlineAt !== null)
    : input.drafts;
  // Drafts a judge left behind when another took over stay in the table, so
  // the one saved last is the judge who has it.
  const holder = drafts.reduce<Draft | null>(
    (latest, draft) =>
      !latest || draft.updatedAt > latest.updatedAt ? draft : latest,
    null,
  );
  if (holder)
    return holder.judgeId === assignedJudgeId ? "grading" : "taken_over";

  return now >= takeoverAt(input.startsAt) ? "not_started" : null;
}

type Booked = {
  id: string;
  entryId: string;
  challengeId: string;
  startsAt: Date;
  deadlineAt: Date;
  assignedJudgeId: string | null;
};

type Row = {
  entryId: string;
  challengeId: string;
  appointmentId: string | null;
};

/**
 * The progress of every appointment that has something to say, by id. One pass
 * over the edition's evaluations and drafts, matched to appointments the way
 * the board matches them (board.ts belongsTo).
 */
export function judgeProgressById(
  appointments: readonly Booked[],
  evaluations: readonly (Row & Started)[],
  drafts: readonly (Row & Draft)[],
  rootIdOf: (challengeId: string) => string | null,
  now: Date,
): Map<string, JudgeProgress> {
  const byEntry = <T extends Row>(rows: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.entryId);
      if (list) list.push(row);
      else map.set(row.entryId, [row]);
    }
    return map;
  };
  const evaluationsOf = byEntry(evaluations);
  const draftsOf = byEntry(drafts);

  const result = new Map<string, JudgeProgress>();
  for (const appointment of appointments) {
    const mine = <T extends Row>(rows: Map<string, T[]>) =>
      (rows.get(appointment.entryId) ?? []).filter((row) =>
        belongsTo(appointment, row, rootIdOf),
      );
    const progress = judgeProgress(
      {
        startsAt: appointment.startsAt,
        deadlineAt: appointment.deadlineAt,
        assignedJudgeId: appointment.assignedJudgeId,
        evaluations: mine(evaluationsOf),
        drafts: mine(draftsOf),
      },
      now,
    );
    if (progress) result.set(appointment.id, progress);
  }
  return result;
}
