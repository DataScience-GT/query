import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  judgingAppointments,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingSchedules,
} from "@query/db";
import type { JudgingDb } from "./config";
import type { ChallengeRow, Seat } from "./evaluation-store";
import { gradingStates } from "./grading-hold";
import type { GradingState } from "./grading-hold";
import { queueWindow } from "./queue";
import { descendantsOf } from "./scope";
import { evaluationTiming } from "./timing";

// The projects a judge is offered at a challenge, read from the database. The
// desk's next-project pick and the check on a judge's first claim of a project
// both go through loadQueue, so they never disagree about what is on offer.

export type Queue = {
  /** A scheduled challenge under a saved schedule: the schedule decides who sees what. */
  timed: boolean;
  /** Timed, and the judge is not seated in a room that serves the challenge. */
  needsRoom: boolean;
  /**
   * The challenge's projects and where each stands for the judge. A project
   * the judge has only opened counts as open (see loadQueue). For a timed
   * challenge, only the presentations running now in the judge's room that
   * the judge may start: not one still reserved for another judge (timing.ts).
   * Those assigned to the judge say so.
   */
  candidates: { entryId: string; grading: GradingState; assigned?: boolean }[];
};

/**
 * `challenge` is the root being graded. `filterId` narrows the projects to one
 * prize inside it, as the desk's challenge filter does.
 */
export async function loadQueue(
  db: JudgingDb,
  input: {
    hackathonId: string;
    judgeId: string;
    challenge: ChallengeRow;
    seat: Seat | null;
    filterId?: string;
  },
  now = new Date(),
): Promise<Queue> {
  const { challenge, seat } = input;
  const [schedule] = await db
    .select({
      id: judgingSchedules.id,
      setupMinutes: judgingSchedules.setupMinutes,
      judgingMinutes: judgingSchedules.judgingMinutes,
    })
    .from(judgingSchedules)
    .where(eq(judgingSchedules.hackathonId, input.hackathonId))
    .limit(1);
  // A scheduled challenge is judged where it presents.
  const timed = schedule !== undefined && challenge.mode === "scheduled";
  if (timed && seat?.challengeId !== challenge.id) {
    return { timed, needsRoom: true, candidates: [] };
  }
  const queue = (candidates: Queue["candidates"]): Queue => ({
    timed,
    needsRoom: false,
    candidates,
  });

  const entries = await db
    .select({ id: judgingEntries.id })
    .from(judgingEntries)
    .innerJoin(
      judgingEntryChallenges,
      and(
        eq(judgingEntryChallenges.entryId, judgingEntries.id),
        eq(judgingEntryChallenges.challengeId, input.filterId ?? challenge.id),
      ),
    )
    .where(
      and(
        eq(judgingEntries.hackathonId, input.hackathonId),
        isNull(judgingEntries.deletedAt),
      ),
    );
  if (entries.length === 0) return queue([]);
  const entryIds = entries.map((entry) => entry.id);

  const evaluations = await db
    .select({
      entryId: judgingEvaluations.entryId,
      judgeId: judgingEvaluations.judgeId,
    })
    .from(judgingEvaluations)
    .where(
      and(
        eq(judgingEvaluations.challengeId, challenge.id),
        inArray(judgingEvaluations.entryId, entryIds),
      ),
    );
  const drafts = await db
    .select({
      entryId: judgingEvaluationDrafts.entryId,
      judgeId: judgingEvaluationDrafts.judgeId,
      updatedAt: judgingEvaluationDrafts.updatedAt,
      deadlineAt: judgingEvaluationDrafts.deadlineAt,
      revision: judgingEvaluationDrafts.revision,
    })
    .from(judgingEvaluationDrafts)
    .where(
      and(
        eq(judgingEvaluationDrafts.challengeId, challenge.id),
        inArray(judgingEvaluationDrafts.entryId, entryIds),
      ),
    );
  const grading = gradingStates(
    input.judgeId,
    entryIds,
    evaluations,
    drafts,
    now,
  );
  // A project the judge has only opened (desk.startGrading's draft, never
  // saved to) stays on offer to them. Otherwise opening projects and backing
  // out of them, or skipping them, would walk the judge down their queue.
  const graded = new Set(
    evaluations
      .filter((evaluation) => evaluation.judgeId === input.judgeId)
      .map((evaluation) => evaluation.entryId),
  );
  const opened = new Set(
    drafts
      .filter(
        (draft) =>
          draft.judgeId === input.judgeId &&
          draft.revision === 0 &&
          !graded.has(draft.entryId),
      )
      .map((draft) => draft.entryId),
  );
  let candidates = entryIds.map((entryId) => {
    const state = grading.get(entryId) ?? ("open" as const);
    return {
      entryId,
      grading:
        state === "mine" && opened.has(entryId) ? ("open" as const) : state,
    };
  });

  if (timed && seat) {
    const slots = await db
      .select({
        id: judgingAppointments.id,
        entryId: judgingAppointments.entryId,
        startsAt: judgingAppointments.startsAt,
        deadlineAt: judgingAppointments.deadlineAt,
        assignedJudgeId: judgingAppointments.assignedJudgeId,
      })
      .from(judgingAppointments)
      .where(
        and(
          eq(judgingAppointments.scheduleId, schedule.id),
          eq(judgingAppointments.challengeId, challenge.id),
          eq(judgingAppointments.roomId, seat.roomId),
          inArray(judgingAppointments.entryId, entryIds),
        ),
      );
    const running = new Set(
      slots
        .filter(
          (slot) =>
            evaluationTiming(
              {
                judgeId: input.judgeId,
                hasSchedule: true,
                mode: challenge.mode,
                challengeId: challenge.id,
                evaluation: null,
                appointment: {
                  ...slot,
                  slot: {
                    setupMinutes: schedule.setupMinutes,
                    judgingMinutes: schedule.judgingMinutes,
                  },
                },
                presenceChallengeId: seat.challengeId,
              },
              now,
            ).canEdit,
        )
        .map((slot) => slot.entryId),
    );
    const assigned = new Set(
      slots
        .filter((slot) => slot.assignedJudgeId === input.judgeId)
        .map((slot) => slot.entryId),
    );
    candidates = candidates
      .filter((c) => running.has(c.entryId))
      .map((c) => (assigned.has(c.entryId) ? { ...c, assigned: true } : c));
  }

  return queue(candidates);
}

export const QUEUE_REFUSAL =
  "Grade the projects your queue offers so every judge sees a random mix. Use Grade next project.";

/**
 * For a judge's first claim of a project (they hold no draft of it and have
 * not graded it): at an untimed challenge it has to be one of the projects
 * their queue offers (see QUEUE_WINDOW). A judge who narrowed the list to one
 * prize is offered that prize's own window, so the project counts if it sits
 * in the window of any prize it is entered in. Run it after claimGrading, in
 * the same transaction.
 */
export async function assertQueueOffers(
  tx: JudgingDb,
  input: {
    hackathonId: string;
    judgeId: string;
    entryId: string;
    challenge: ChallengeRow;
    challenges: readonly ChallengeRow[];
  },
  now = new Date(),
) {
  const { challenge } = input;
  const offers = (queue: Queue) =>
    queueWindow(input.judgeId, challenge.id, queue.candidates).includes(
      input.entryId,
    );
  // A timed challenge stops at the schedule check, so the seat is never read.
  const base = { hackathonId: input.hackathonId, judgeId: input.judgeId };

  const whole = await loadQueue(tx, { ...base, challenge, seat: null }, now);
  if (whole.timed || offers(whole)) return;

  const below = descendantsOf(input.challenges, challenge.id).map((c) => c.id);
  if (below.length > 0) {
    const entered = await tx
      .select({ challengeId: judgingEntryChallenges.challengeId })
      .from(judgingEntryChallenges)
      .where(
        and(
          eq(judgingEntryChallenges.entryId, input.entryId),
          inArray(judgingEntryChallenges.challengeId, below),
        ),
      );
    for (const { challengeId } of entered) {
      const prize = await loadQueue(
        tx,
        { ...base, challenge, seat: null, filterId: challengeId },
        now,
      );
      if (offers(prize)) return;
    }
  }

  throw new TRPCError({ code: "PRECONDITION_FAILED", message: QUEUE_REFUSAL });
}
