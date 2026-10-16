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
//
// A presentation assigned to another judge is reserved for them until its
// takeover time (timing.ts). An open project in that window reads "reserved".
// Once the assigned judge has a draft it reads "in_progress" like any other
// held project, so a judge who takes over after the window cannot take one the
// assigned judge started.

/** How long after its last save a draft keeps other judges off the project. */
export const GRADING_HOLD_MS = 10 * 60_000;

/**
 * Where a project stands for one judge: "mine" (they graded it, or hold it),
 * "graded" (another judge did), "in_progress" (another judge holds it),
 * "reserved" (free, but kept for the judge assigned to it until a time), or
 * "open".
 */
export type GradingState =
  "mine" | "graded" | "in_progress" | "reserved" | "open";

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
 * `reservedUntil` is when the project opens to this judge, if it is held back
 * for another judge until then (timing.ts reservedUntil); it only shows on a
 * project nobody has graded or holds.
 */
export function gradingStateOf(
  judgeId: string,
  evaluations: readonly { judgeId: string }[],
  drafts: readonly (HeldDraft & { judgeId: string })[],
  now: Date,
  reservedUntil: Date | null = null,
): GradingState {
  if (evaluations.some((evaluation) => evaluation.judgeId === judgeId)) {
    return "mine";
  }
  if (evaluations.length > 0) return "graded";

  const holding = drafts.filter((draft) => holdsGrade(draft, now));
  if (holding.some((draft) => draft.judgeId === judgeId)) return "mine";
  if (holding.length > 0) return "in_progress";
  return reservedUntil ? "reserved" : "open";
}

/**
 * The state of each of `entryIds`, from the rows of one challenge.
 * `reservedUntil` holds the entries kept back for another judge, with when
 * each opens to this one.
 */
export function gradingStates(
  judgeId: string,
  entryIds: readonly string[],
  evaluations: readonly { entryId: string; judgeId: string }[],
  drafts: readonly (HeldDraft & { entryId: string; judgeId: string })[],
  now: Date,
  reservedUntil: ReadonlyMap<string, Date> = new Map(),
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
        reservedUntil.get(entryId) ?? null,
      ),
    ]),
  );
}

/**
 * Why a judge cannot write to a project in this state, or null if they can.
 * A reserved project is refused by the timing rules instead, which say when it
 * opens (timing.ts).
 */
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
