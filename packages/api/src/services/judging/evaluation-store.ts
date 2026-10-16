import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  judgingAppointments,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluationRatings,
  judgingEvaluationResponses,
  judgingEvaluationRevisions,
  judgingEvaluations,
  judgingGuestSessions,
  judgingJudges,
  judgingPresence,
  judgingRoomLinks,
  judgingRooms,
  judgingRubricItems,
  judgingSchedules,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import type { JudgingDb, JudgingTx } from "./config";
import { checkAnswers, snapshotOf } from "./evaluation";
import type { CheckedAnswers } from "./evaluation";
import { gradingLockKey, gradingRefusal, gradingStateOf } from "./grading-hold";
import { GUEST_SESSION_ENDED } from "./principal";
import type { Judge } from "./principal";
import {
  descendantsOf,
  effectiveMode,
  isSponsorChallenge,
  rootOf,
} from "./scope";
import type { ChallengeMode } from "./scope";
import { DEADLINE_GRACE_MS, evaluationTiming } from "./timing";
import type { EvaluationTiming } from "./timing";

// The judge desk's reads and writes around one evaluation: which challenge a
// judge is evaluating, whether they may write now, the write itself, and
// submitting drafts whose time ran out.
//
// A judge evaluates a project for a root challenge: General, a sponsor prize,
// or a group such as "MLH Challenges". Children of a group are what the team
// opted into, shown as tags; the presentation, the room and the evaluation all
// belong to the root.

export type ChallengeRow = {
  id: string;
  parentId: string | null;
  mode: ChallengeMode;
  label: string;
  isGeneral: boolean;
  isGroup: boolean;
};

export async function loadChallenges(
  db: JudgingDb,
  hackathonId: string,
): Promise<ChallengeRow[]> {
  return db
    .select({
      id: judgingChallenges.id,
      parentId: judgingChallenges.parentId,
      mode: judgingChallenges.mode,
      label: judgingChallenges.label,
      isGeneral: judgingChallenges.isGeneral,
      isGroup: judgingChallenges.isGroup,
    })
    .from(judgingChallenges)
    .where(eq(judgingChallenges.hackathonId, hackathonId))
    .orderBy(asc(judgingChallenges.displayOrder), asc(judgingChallenges.label));
}

/** The challenges a guest may see: their room's, and everything below it. */
export function guestScope(
  challenges: readonly ChallengeRow[],
  roomChallengeId: string,
): Set<string> {
  return new Set([
    roomChallengeId,
    ...descendantsOf(challenges, roomChallengeId).map((c) => c.id),
  ]);
}

/** Whether `judge` may see `challengeId` at all. */
export function inJudgeScope(
  judge: Judge,
  challenges: readonly ChallengeRow[],
  challengeId: string,
): boolean {
  if (judge.kind === "member") {
    return challenges.some((c) => c.id === challengeId);
  }
  return guestScope(challenges, judge.roomChallengeId).has(challengeId);
}

export type Seat = {
  roomId: string;
  roomName: string;
  /** The root of the challenge the room serves. */
  challengeId: string;
};

/** The room a judge is sitting in right now, if it is still open. */
export async function seatOf(
  db: JudgingDb,
  judgeId: string,
  challenges: readonly ChallengeRow[],
): Promise<Seat | null> {
  const [row] = await db
    .select({
      roomId: judgingRooms.id,
      roomName: judgingRooms.name,
      challengeId: judgingRooms.challengeId,
    })
    .from(judgingPresence)
    .innerJoin(judgingRooms, eq(judgingRooms.id, judgingPresence.roomId))
    .where(
      and(
        eq(judgingPresence.judgeId, judgeId),
        isNull(judgingPresence.leftAt),
        isNull(judgingRooms.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    roomId: row.roomId,
    roomName: row.roomName,
    challengeId: rootOf(challenges, row.challengeId)?.id ?? row.challengeId,
  };
}

/**
 * Sponsor challenges belong to the sponsor's own judges: a member (table)
 * judge grades one only while seated in a room that serves it.
 */
function memberMayGrade(root: ChallengeRow, seat: Seat | null): boolean {
  return !isSponsorChallenge(root) || seat?.challengeId === root.id;
}

/**
 * The challenges a member judge may pick right now: the general ones, and a
 * sponsor's (with everything below it) only from a seat in its room.
 */
export function memberScope(
  challenges: readonly ChallengeRow[],
  seat: Seat | null,
): Set<string> {
  return new Set(
    challenges
      .filter((c) => {
        const root = rootOf(challenges, c.id);
        return !!root && memberMayGrade(root, seat);
      })
      .map((c) => c.id),
  );
}

/**
 * The root challenge a judge is evaluating. A guest always evaluates their
 * room's; a filter they pass has to sit inside it. A member evaluates the root
 * of what they picked, or else the room they sit in, or else General, and
 * only a sponsor's challenge from a seat in the room that serves it.
 */
export function evaluatedChallenge(
  judge: Judge,
  challenges: readonly ChallengeRow[],
  requestedId: string | null | undefined,
  seat: Seat | null,
): ChallengeRow {
  if (requestedId && !inJudgeScope(judge, challenges, requestedId)) {
    throw new TRPCError({
      code: judge.kind === "guest" ? "FORBIDDEN" : "NOT_FOUND",
      message:
        judge.kind === "guest"
          ? "That challenge is not judged at your room or table."
          : "That challenge is not part of this hackathon.",
    });
  }

  const pick =
    judge.kind === "guest"
      ? judge.roomChallengeId
      : (requestedId ??
        seat?.challengeId ??
        challenges.find((c) => c.isGeneral && !c.parentId)?.id ??
        challenges.find((c) => !c.parentId)?.id);
  const root = pick ? rootOf(challenges, pick) : null;
  if (!root) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This hackathon has no judging challenges yet. Ask an organiser to import projects first.",
    });
  }
  if (judge.kind === "member" && !memberMayGrade(root, seat)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Sponsor judges grade ${root.label}. Sit in its room to grade it.`,
    });
  }
  return root;
}

export type JudgingSwitches = {
  state: "draft" | "open" | "closed";
  showAllScores: boolean;
  closedAt: Date | null;
};

/** The edition's judging state, read only: a missing row is a draft. */
export async function judgingSwitches(
  db: JudgingDb,
  hackathonId: string,
): Promise<JudgingSwitches> {
  const [config] = await db
    .select({
      state: judgingConfigs.state,
      showAllScores: judgingConfigs.showAllScores,
      closedAt: judgingConfigs.closedAt,
    })
    .from(judgingConfigs)
    .where(eq(judgingConfigs.hackathonId, hackathonId))
    .limit(1);
  return config ?? { state: "draft", showAllScores: false, closedAt: null };
}

/**
 * Refuses a write unless judging is open. Holds a share lock on the config
 * row, so an organiser closing judging waits for writes already under way and
 * none start after.
 */
export async function assertJudgingOpen(tx: JudgingTx, hackathonId: string) {
  const [config] = await tx
    .select({ state: judgingConfigs.state })
    .from(judgingConfigs)
    .where(eq(judgingConfigs.hackathonId, hackathonId))
    .for("share")
    .limit(1);
  if (config?.state === "open") return;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      config?.state === "closed"
        ? "Judging is closed. Your submitted evaluations are read-only now."
        : "Judging has not opened yet. Your answers can be saved once organisers open it.",
  });
}

/**
 * For a guest's write: their session must still be live. Share-locked so an
 * organiser revoking the room's link waits for this write rather than racing
 * it.
 */
export async function assertGuestSeated(tx: JudgingTx, judge: Judge) {
  if (judge.kind !== "guest") return;
  const [session] = await tx
    .select({ id: judgingGuestSessions.id })
    .from(judgingGuestSessions)
    .innerJoin(
      judgingRoomLinks,
      eq(judgingRoomLinks.id, judgingGuestSessions.linkId),
    )
    .innerJoin(judgingRooms, eq(judgingRooms.id, judgingGuestSessions.roomId))
    .where(
      and(
        eq(judgingGuestSessions.id, judge.sessionId),
        isNull(judgingGuestSessions.revokedAt),
        gt(judgingGuestSessions.expiresAt, new Date()),
        isNull(judgingRoomLinks.revokedAt),
        isNull(judgingRooms.archivedAt),
      ),
    )
    .for("share", { of: judgingGuestSessions })
    .limit(1);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: GUEST_SESSION_ENDED });
  }
}

/** A live project entered in the challenge, or NOT_FOUND. */
export async function loadEntryInChallenge(
  db: JudgingDb,
  input: { hackathonId: string; entryId: string; challenge: ChallengeRow },
) {
  const [entry] = await db
    .select({
      id: judgingEntries.id,
      title: judgingEntries.title,
      description: judgingEntries.description,
      submissionUrl: judgingEntries.submissionUrl,
      demoLinks: judgingEntries.demoLinks,
      videoUrl: judgingEntries.videoUrl,
      technologies: judgingEntries.technologies,
      participantCount: judgingEntries.participantCount,
    })
    .from(judgingEntries)
    .innerJoin(
      judgingEntryChallenges,
      and(
        eq(judgingEntryChallenges.entryId, judgingEntries.id),
        eq(judgingEntryChallenges.challengeId, input.challenge.id),
      ),
    )
    .where(
      and(
        eq(judgingEntries.id, input.entryId),
        eq(judgingEntries.hackathonId, input.hackathonId),
        isNull(judgingEntries.deletedAt),
      ),
    )
    .limit(1);
  if (!entry) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `That project is not judged in ${input.challenge.label}. It may have been withdrawn; go back to the project list.`,
    });
  }
  return entry;
}

export async function loadRubric(db: JudgingDb, hackathonId: string) {
  return db
    .select({
      id: judgingRubricItems.id,
      kind: judgingRubricItems.kind,
      label: judgingRubricItems.label,
      description: judgingRubricItems.description,
      required: judgingRubricItems.required,
      guestVisibility: judgingRubricItems.guestVisibility,
    })
    .from(judgingRubricItems)
    .where(eq(judgingRubricItems.hackathonId, hackathonId))
    .orderBy(
      asc(judgingRubricItems.displayOrder),
      asc(judgingRubricItems.createdAt),
    );
}

export type Presentation = {
  id: string;
  roomId: string;
  startsAt: Date;
  deadlineAt: Date;
  endsAt: Date;
};

/**
 * Whether `judge` may write their evaluation of an entry for a challenge now,
 * with the presentation it is tied to. Reads the saved schedule and where the
 * judge sits; the rule itself is services/judging/timing.ts.
 */
export async function evaluationAccess(
  db: JudgingDb,
  input: {
    hackathonId: string;
    judgeId: string;
    entryId: string;
    challenge: ChallengeRow;
    challenges: readonly ChallengeRow[];
    evaluation: { appointmentId: string | null } | null;
    /** DEADLINE_GRACE_MS when the caller is writing. */
    graceMs?: number;
  },
  now = new Date(),
): Promise<{ timing: EvaluationTiming; presentation: Presentation | null }> {
  const [schedule] = await db
    .select({ id: judgingSchedules.id })
    .from(judgingSchedules)
    .where(eq(judgingSchedules.hackathonId, input.hackathonId))
    .limit(1);

  const [presentation] = schedule
    ? await db
        .select({
          id: judgingAppointments.id,
          roomId: judgingAppointments.roomId,
          startsAt: judgingAppointments.startsAt,
          deadlineAt: judgingAppointments.deadlineAt,
          endsAt: judgingAppointments.endsAt,
        })
        .from(judgingAppointments)
        .where(
          and(
            eq(judgingAppointments.scheduleId, schedule.id),
            eq(judgingAppointments.entryId, input.entryId),
            eq(judgingAppointments.challengeId, input.challenge.id),
          ),
        )
        .limit(1)
    : [];

  const seat = await seatOf(db, input.judgeId, input.challenges);
  const timing = evaluationTiming(
    {
      hasSchedule: !!schedule,
      mode: effectiveMode(input.challenges, input.challenge.id) ?? "scheduled",
      challengeId: input.challenge.id,
      evaluation: input.evaluation,
      appointment: presentation ?? null,
      presenceChallengeId: seat?.challengeId ?? null,
      graceMs: input.graceMs,
    },
    now,
  );
  return { timing, presentation: presentation ?? null };
}

/**
 * Serialises the writers of one project's grade for one challenge until the
 * transaction ends: a judge's submit, another judge's first save, and the
 * deadline submission each check that nobody else has the project and then
 * write, which two of them cannot do at once. Transaction-level, so it is safe
 * behind the connection pooler. Take a draft's row lock before this one, and
 * take several in key order (gradingLockKey), so the locks cannot deadlock.
 */
export async function lockGrading(
  tx: JudgingTx,
  entryId: string,
  challengeId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${gradingLockKey(entryId, challengeId)}::text, 0))`,
  );
}

/**
 * For a judge who has not graded a project yet and is about to write to it:
 * takes the project's grading lock, then refuses if another judge has graded
 * it or is grading it now (see grading-hold.ts). Run it after the judge's own
 * rows are locked, and skip it for a judge editing their own evaluation.
 */
export async function claimGrading(
  tx: JudgingTx,
  input: { judgeId: string; entryId: string; challenge: ChallengeRow },
  now = new Date(),
) {
  await lockGrading(tx, input.entryId, input.challenge.id);

  const evaluations = await tx
    .select({ judgeId: judgingEvaluations.judgeId })
    .from(judgingEvaluations)
    .where(
      and(
        eq(judgingEvaluations.entryId, input.entryId),
        eq(judgingEvaluations.challengeId, input.challenge.id),
        ne(judgingEvaluations.judgeId, input.judgeId),
      ),
    );
  const drafts = await tx
    .select({
      judgeId: judgingEvaluationDrafts.judgeId,
      updatedAt: judgingEvaluationDrafts.updatedAt,
      deadlineAt: judgingEvaluationDrafts.deadlineAt,
    })
    .from(judgingEvaluationDrafts)
    .where(
      and(
        eq(judgingEvaluationDrafts.entryId, input.entryId),
        eq(judgingEvaluationDrafts.challengeId, input.challenge.id),
        ne(judgingEvaluationDrafts.judgeId, input.judgeId),
      ),
    );

  const refusal = gradingRefusal(
    gradingStateOf(input.judgeId, evaluations, drafts, now),
    input.challenge.label,
  );
  if (refusal) throw new TRPCError({ code: "CONFLICT", message: refusal });
}

/**
 * Writes one evaluation: the row (new, or the next revision of the existing
 * one), its ratings and responses, and a revision snapshot. The first result
 * of a scheduled presentation also stamps the schedule, which from then on
 * cannot be dropped. The caller holds the locks and has checked access.
 */
export async function writeEvaluation(
  tx: JudgingTx,
  input: {
    hackathonId: string;
    judgeId: string;
    entryId: string;
    challengeId: string;
    appointmentId: string | null;
    answers: CheckedAnswers;
    existing: { id: string; revision: number } | null;
    /** When it counts as submitted: now, or the deadline that passed. */
    at: Date;
    auto: boolean;
  },
): Promise<{ evaluationId: string; revision: number }> {
  const { answers, existing, at } = input;
  const revision = (existing?.revision ?? 0) + 1;

  let evaluationId: string;
  if (existing) {
    evaluationId = existing.id;
    await tx
      .update(judgingEvaluations)
      .set({ revision, isComplete: answers.isComplete, updatedAt: at })
      .where(eq(judgingEvaluations.id, evaluationId));
    await tx
      .delete(judgingEvaluationRatings)
      .where(eq(judgingEvaluationRatings.evaluationId, evaluationId));
    await tx
      .delete(judgingEvaluationResponses)
      .where(eq(judgingEvaluationResponses.evaluationId, evaluationId));
  } else {
    const [created] = await tx
      .insert(judgingEvaluations)
      .values({
        hackathonId: input.hackathonId,
        judgeId: input.judgeId,
        entryId: input.entryId,
        challengeId: input.challengeId,
        appointmentId: input.appointmentId,
        isComplete: answers.isComplete,
        revision,
        submittedAt: at,
        autoSubmittedAt: input.auto ? at : null,
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: judgingEvaluations.id });
    evaluationId = created.id;
  }

  if (answers.ratings.length > 0) {
    await tx.insert(judgingEvaluationRatings).values(
      answers.ratings.map((rating) => ({
        evaluationId,
        itemId: rating.itemId,
        value: rating.value,
      })),
    );
  }
  if (answers.responses.length > 0) {
    await tx.insert(judgingEvaluationResponses).values(
      answers.responses.map((response) => ({
        evaluationId,
        itemId: response.itemId,
        value: response.value,
        isPublic: response.isPublic,
      })),
    );
  }

  await tx.insert(judgingEvaluationRevisions).values({
    evaluationId,
    revision,
    snapshot: {
      ...snapshotOf(answers),
      isComplete: answers.isComplete,
      auto: input.auto,
    },
    createdAt: at,
  });

  if (input.appointmentId) {
    await tx
      .update(judgingSchedules)
      .set({ firstResultAt: at })
      .where(
        and(
          eq(judgingSchedules.hackathonId, input.hackathonId),
          isNull(judgingSchedules.firstResultAt),
        ),
      );
  }

  return { evaluationId, revision };
}

// Drafts submitted per read. The rest wait for the next one: a desk poll is
// never more than fifteen seconds away.
const RECONCILE_BATCH = 50;

/**
 * Submits drafts whose deadline has passed, as of their deadline, marked as
 * submitted for the judge, complete or not. Run at the top of desk reads (and
 * anything else that reports on evaluations): there is no background worker.
 *
 * Only drafts that could have been submitted count: judging open, or closed
 * after the deadline passed. Concurrent readers lock with SKIP LOCKED, so a
 * draft is submitted once, and a judge's own submit (which locks the draft
 * first) wins over this. A draft that can no longer be submitted (the guest's
 * session was revoked before the deadline, the project was withdrawn, the
 * schedule was dropped, another judge already graded the project) keeps its
 * answers and loses its deadline. So does a draft with no answers in it: the
 * judge only opened the project (desk.startGrading), and that is not a grade.
 *
 * Each project is graded once, so the batch takes the grading lock of every
 * project it touches before it writes anything: in key order, and ahead of any
 * write, so it cannot deadlock with another batch or with a judge's submit.
 */
export async function reconcileDueDrafts(
  db: DrizzleDB,
  hackathonId: string,
  now = new Date(),
) {
  // Waits out the grace a judge's own submit gets, so the two never race.
  const due = and(
    eq(judgingEvaluationDrafts.hackathonId, hackathonId),
    lte(
      judgingEvaluationDrafts.deadlineAt,
      new Date(now.getTime() - DEADLINE_GRACE_MS),
    ),
    or(
      eq(judgingConfigs.state, "open"),
      and(
        eq(judgingConfigs.state, "closed"),
        lte(judgingEvaluationDrafts.deadlineAt, judgingConfigs.closedAt),
      ),
    ),
  );

  // Cheap check first: on almost every read nothing is due.
  const [any] = await db
    .select({ id: judgingEvaluationDrafts.id })
    .from(judgingEvaluationDrafts)
    .innerJoin(
      judgingConfigs,
      eq(judgingConfigs.hackathonId, judgingEvaluationDrafts.hackathonId),
    )
    .where(due)
    .limit(1);
  if (!any) return;

  await db.transaction(async (tx) => {
    const drafts = await tx
      .select({
        id: judgingEvaluationDrafts.id,
        judgeId: judgingEvaluationDrafts.judgeId,
        entryId: judgingEvaluationDrafts.entryId,
        challengeId: judgingEvaluationDrafts.challengeId,
        appointmentId: judgingEvaluationDrafts.appointmentId,
        ratings: judgingEvaluationDrafts.ratings,
        responses: judgingEvaluationDrafts.responses,
        deadlineAt: judgingEvaluationDrafts.deadlineAt,
      })
      .from(judgingEvaluationDrafts)
      .innerJoin(
        judgingConfigs,
        eq(judgingConfigs.hackathonId, judgingEvaluationDrafts.hackathonId),
      )
      .where(due)
      .orderBy(asc(judgingEvaluationDrafts.deadlineAt))
      .limit(RECONCILE_BATCH)
      .for("update", { of: judgingEvaluationDrafts, skipLocked: true });
    if (drafts.length === 0) return;

    const rubric = await loadRubric(tx, hackathonId);
    const kinds = await tx
      .select({ id: judgingJudges.id, kind: judgingJudges.kind })
      .from(judgingJudges)
      .where(
        inArray(
          judgingJudges.id,
          drafts.map((draft) => draft.judgeId),
        ),
      );
    const kindOf = new Map(kinds.map((judge) => [judge.id, judge.kind]));

    const locks = new Map(
      drafts.map((draft) => [
        gradingLockKey(draft.entryId, draft.challengeId),
        draft,
      ]),
    );
    for (const key of [...locks.keys()].sort()) {
      const draft = locks.get(key)!;
      await lockGrading(tx, draft.entryId, draft.challengeId);
    }

    const retain = (draftId: string) =>
      tx
        .update(judgingEvaluationDrafts)
        .set({ deadlineAt: null })
        .where(eq(judgingEvaluationDrafts.id, draftId));

    for (const draft of drafts) {
      const deadlineAt = draft.deadlineAt as Date;
      const kind = kindOf.get(draft.judgeId);

      if (
        !kind ||
        !draft.appointmentId ||
        (kind === "guest" &&
          !(await guestSeatedAt(tx, draft.judgeId, deadlineAt))) ||
        !(await entryStillJudged(tx, draft.entryId, draft.challengeId))
      ) {
        await retain(draft.id);
        continue;
      }

      const [existing] = await tx
        .select({ id: judgingEvaluations.id })
        .from(judgingEvaluations)
        .where(
          and(
            eq(judgingEvaluations.entryId, draft.entryId),
            eq(judgingEvaluations.challengeId, draft.challengeId),
          ),
        )
        .limit(1);
      if (existing) {
        // Never overwrite a result the judge submitted themselves, and a
        // project another judge graded is graded.
        await retain(draft.id);
        continue;
      }

      const check = checkAnswers(rubric, draft, kind, "lenient");
      if (
        !check.ok ||
        (check.answers.ratings.length === 0 &&
          check.answers.responses.length === 0)
      ) {
        await retain(draft.id);
        continue;
      }

      await writeEvaluation(tx, {
        hackathonId,
        judgeId: draft.judgeId,
        entryId: draft.entryId,
        challengeId: draft.challengeId,
        appointmentId: draft.appointmentId,
        answers: check.answers,
        existing: null,
        at: deadlineAt,
        auto: true,
      });
      await tx
        .delete(judgingEvaluationDrafts)
        .where(eq(judgingEvaluationDrafts.id, draft.id));
    }
  });
}

/** Whether a guest judge still held a live session when `at` came. */
async function guestSeatedAt(tx: JudgingTx, judgeId: string, at: Date) {
  const [session] = await tx
    .select({ id: judgingGuestSessions.id })
    .from(judgingGuestSessions)
    .innerJoin(
      judgingRoomLinks,
      eq(judgingRoomLinks.id, judgingGuestSessions.linkId),
    )
    .where(
      and(
        eq(judgingGuestSessions.judgeId, judgeId),
        gt(judgingGuestSessions.expiresAt, at),
        or(
          isNull(judgingGuestSessions.revokedAt),
          gt(judgingGuestSessions.revokedAt, at),
        ),
        or(
          isNull(judgingRoomLinks.revokedAt),
          gt(judgingRoomLinks.revokedAt, at),
        ),
      ),
    )
    .limit(1);
  return !!session;
}

async function entryStillJudged(
  tx: JudgingTx,
  entryId: string,
  challengeId: string,
) {
  const [row] = await tx
    .select({ id: judgingEntries.id })
    .from(judgingEntries)
    .innerJoin(
      judgingEntryChallenges,
      and(
        eq(judgingEntryChallenges.entryId, judgingEntries.id),
        eq(judgingEntryChallenges.challengeId, challengeId),
      ),
    )
    .where(
      and(eq(judgingEntries.id, entryId), isNull(judgingEntries.deletedAt)),
    )
    .limit(1);
  return !!row;
}
