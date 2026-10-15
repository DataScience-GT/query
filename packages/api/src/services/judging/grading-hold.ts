// Each project is graded once per (root) challenge, by one judge. Pure: the
// desk loads the rows, this decides.
//
// A project is closed to other judges once someone has submitted an evaluation
// of it. Until then a judge who is writing one holds it: their draft keeps
// other judges off for GRADING_HOLD_MS after its last save, and a scheduled
// presentation's draft holds until its deadline. A draft left alone past that
// holds nothing, and a judge who starts afterwards takes the hold over.
// Evaluations that already exist twice, from before this rule, are left as they
// are.

/** How long after its last save a draft keeps other judges off the project. */
export const GRADING_HOLD_MS = 10 * 60_000;

/**
 * Where a project stands for one judge: "mine" (they graded it, or hold it),
 * "graded" (another judge did), "in_progress" (another judge holds it), or
 * "open".
 */
export type GradingState = "mine" | "graded" | "in_progress" | "open";

type HeldDraft = { updatedAt: Date; deadlineAt: Date | null };

/** Whether a draft still keeps other judges off its project. */
export function holdsGrade(draft: HeldDraft, now: Date): boolean {
  return (
    now.getTime() - draft.updatedAt.getTime() < GRADING_HOLD_MS ||
    (draft.deadlineAt !== null && draft.deadlineAt.getTime() > now.getTime())
  );
}

/**
 * One project's state for `judgeId`, from its evaluations and drafts for the
 * challenge (every judge's, theirs included). A judge's own evaluation wins
 * over another's, so a project both graded stays theirs to edit.
 */
export function gradingStateOf(
  judgeId: string,
  evaluations: readonly { judgeId: string }[],
  drafts: readonly (HeldDraft & { judgeId: string })[],
  now: Date,
): GradingState {
  if (evaluations.some((evaluation) => evaluation.judgeId === judgeId)) {
    return "mine";
  }
  if (evaluations.length > 0) return "graded";

  const holding = drafts.filter((draft) => holdsGrade(draft, now));
  if (holding.some((draft) => draft.judgeId === judgeId)) return "mine";
  return holding.length > 0 ? "in_progress" : "open";
}

/** The state of each of `entryIds`, from the rows of one challenge. */
export function gradingStates(
  judgeId: string,
  entryIds: readonly string[],
  evaluations: readonly { entryId: string; judgeId: string }[],
  drafts: readonly (HeldDraft & { entryId: string; judgeId: string })[],
  now: Date,
): Map<string, GradingState> {
  const evaluationsOf = new Map<string, (typeof evaluations)[number][]>();
  for (const evaluation of evaluations) {
    const list = evaluationsOf.get(evaluation.entryId) ?? [];
    list.push(evaluation);
    evaluationsOf.set(evaluation.entryId, list);
  }
  const draftsOf = new Map<string, (typeof drafts)[number][]>();
  for (const draft of drafts) {
    const list = draftsOf.get(draft.entryId) ?? [];
    list.push(draft);
    draftsOf.set(draft.entryId, list);
  }

  return new Map(
    entryIds.map((entryId) => [
      entryId,
      gradingStateOf(
        judgeId,
        evaluationsOf.get(entryId) ?? [],
        draftsOf.get(entryId) ?? [],
        now,
      ),
    ]),
  );
}

/** Why a judge cannot write to a project in this state, or null if they can. */
export function gradingRefusal(
  state: GradingState,
  challengeLabel: string,
): string | null {
  if (state === "graded") {
    return `Another judge has already graded this project for ${challengeLabel}. Each project is graded once.`;
  }
  if (state === "in_progress") {
    return "Another judge is grading this project right now. Pick another one.";
  }
  return null;
}

/** What writers of one project's grade for one challenge lock on. */
export function gradingLockKey(entryId: string, challengeId: string): string {
  return `grading:${entryId}:${challengeId}`;
}
