import { z } from "zod";
import { candidateKey, taskKey } from "./inputs";
import type { Placement, PlanInputs } from "./inputs";
import {
  MAX_CONSECUTIVE,
  assignJudges,
  scoreJudgeAssignment,
  validateJudgeAssignment,
} from "./judges";
import type { JudgeAssignment, JudgeInput, JudgeMetrics } from "./judges";
import { scoreSchedule, validateSchedule } from "./rules";
import type { PlanScore, ReducedBreak } from "./rules";

// The fallback for when the in-app solver cannot build a schedule: the
// organiser downloads the problem, runs the CP-SAT script on a laptop
// (packages/api/scripts/judging-schedule/cpsat.py), and uploads what it
// writes. Nothing in the upload is trusted: it must answer the problem as it
// stands now (same fingerprint) and pass validateSchedule like any schedule
// the server builds. A server with Python and OR-Tools can run the script
// itself (cpsat-runner.ts); what it prints is read here the same way.

export const CPSAT_PROBLEM_FORMAT = "query-judging-schedule-problem";
export const CPSAT_SOLUTION_FORMAT = "query-judging-schedule-solution";

/** The command shown next to the download. */
export const CPSAT_COMMAND =
  "uv run packages/api/scripts/judging-schedule/cpsat.py problem.json -o solution.json";

const judgesOf = (judges: readonly JudgeInput[]) =>
  judges.map((judge) => ({
    id: judge.id,
    kind: judge.kind,
    challengeIds: [...judge.challengeIds],
    roomId: judge.roomId,
    maxConsecutive: judge.maxConsecutive ?? MAX_CONSECUTIVE,
  }));

const assignmentsOf = (rows: readonly JudgeAssignment[]) =>
  rows.map((row) => ({
    entryId: row.entryId,
    challengeId: row.challengeId,
    judgeId: row.judgeId,
  }));

/**
 * The problem file cpsat.py reads. `hint` is a schedule to start from, such
 * as the best partial one the in-app solver found. `judges`, when there are
 * any, asks for a judge for every presentation as well, and also keeps each
 * challenge's presentations in any slot within its judges.
 */
export function cpsatProblem(
  inputs: PlanInputs,
  fingerprint: string,
  hint?: readonly Placement[],
  judges: readonly JudgeInput[] = [],
) {
  const sponsorChallenges = new Set(
    inputs.tasks.filter((t) => t.sponsor).map((t) => t.challengeId),
  );
  return {
    format: CPSAT_PROBLEM_FORMAT,
    version: 1,
    fingerprint,
    slotCount: inputs.slots,
    sameGap: inputs.sameGap,
    crossGap: inputs.crossGap,
    rooms: inputs.rooms.map((room) => ({
      id: room.id,
      challengeId: room.challengeId,
      buildingId: room.buildingId,
      sponsor: sponsorChallenges.has(room.challengeId),
    })),
    tasks: inputs.tasks.map((task) => ({
      entryId: task.entryId,
      challengeId: task.challengeId,
      sponsor: task.sponsor,
    })),
    ...(hint && hint.length > 0
      ? {
          hint: hint.map((p) => ({
            entryId: p.entryId,
            challengeId: p.challengeId,
            roomId: p.roomId,
            slot: p.slot,
          })),
        }
      : {}),
    ...(judges.length > 0
      ? {
          judges: judgesOf(judges),
          // Where the in-app assignment would put the judges for that hint,
          // for CP-SAT to improve on.
          ...(hint && hint.length > 0
            ? {
                assignmentHint: assignmentsOf(
                  assignJudges(inputs, hint, judges).assignment,
                ),
              }
            : {}),
        }
      : {}),
  };
}

/** Binds an assignment-only run to the placements it assigns judges to. */
const assignmentFingerprint = (placements: readonly Placement[]) =>
  candidateKey("judges", false, placements);

/**
 * A problem that only assigns judges: the schedule is given and CP-SAT leaves
 * it alone. `keep` stays as it is, such as the presentations already under
 * way. `inputs` hold just the presentations in `placements`.
 */
export function cpsatAssignmentProblem(
  inputs: PlanInputs,
  placements: readonly Placement[],
  judges: readonly JudgeInput[],
  keep: readonly JudgeAssignment[] = [],
) {
  const base = cpsatProblem(inputs, assignmentFingerprint(placements), undefined, judges);
  return {
    ...base,
    placements: placements.map((p) => ({
      entryId: p.entryId,
      challengeId: p.challengeId,
      roomId: p.roomId,
      slot: p.slot,
    })),
    ...(keep.length > 0 ? { locked: assignmentsOf(keep) } : {}),
    assignmentHint: assignmentsOf(
      assignJudges(inputs, placements, judges, { keep }).assignment,
    ),
  };
}

const solutionSchema = z.object({
  format: z.literal(CPSAT_SOLUTION_FORMAT),
  version: z.literal(1),
  fingerprint: z.string(),
  status: z.enum(["optimal", "feasible", "infeasible", "unknown"]),
  relaxed: z.boolean(),
  placements: z.array(
    z.object({
      entryId: z.string(),
      challengeId: z.string(),
      roomId: z.string(),
      slot: z.number().int(),
    }),
  ),
  reasons: z.array(z.string()).optional(),
  assignments: z
    .array(
      z.object({
        entryId: z.string(),
        challengeId: z.string(),
        judgeId: z.string(),
      }),
    )
    .optional(),
});

/** Who grades what for a schedule, and who worked it out. */
export type JudgeOutcome = {
  assignments: JudgeAssignment[];
  metrics: JudgeMetrics;
  /** "cp-sat" when the file's own assignments passed the checks. */
  source: "cp-sat" | "in-app";
};

export type CpsatImport =
  | {
      ok: true;
      /** "optimal" when CP-SAT proved no schedule beats this one. */
      status: "optimal" | "feasible";
      relaxed: boolean;
      placements: Placement[];
      score: PlanScore;
      reducedBreaks: ReducedBreak[];
      judging: JudgeOutcome;
    }
  | { ok: false; reason: string };

/**
 * The file's assignments when it has some and they keep the rules for the
 * judges as they are now; otherwise the in-app ones.
 */
function judgeOutcome(
  inputs: PlanInputs,
  placements: readonly Placement[],
  judges: readonly JudgeInput[],
  given: readonly JudgeAssignment[] | undefined,
): JudgeOutcome {
  if (
    given &&
    given.length > 0 &&
    validateJudgeAssignment(inputs, placements, judges, given).valid
  ) {
    return {
      assignments: assignmentsOf(given),
      metrics: scoreJudgeAssignment(inputs, placements, judges, given),
      source: "cp-sat",
    };
  }
  const made = assignJudges(inputs, placements, judges);
  return { assignments: made.assignment, metrics: made.metrics, source: "in-app" };
}

/**
 * Reads and checks an uploaded solution.json against the current problem.
 * `judges` are the judges as they are now, whatever the problem listed.
 */
export function readCpsatSolution(
  inputs: PlanInputs,
  fingerprint: string,
  text: string,
  judges: readonly JudgeInput[] = [],
): CpsatImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file is not JSON. Upload the solution.json the script wrote." };
  }
  const parsed = solutionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "That file is not a solution from cpsat.py. Upload the solution.json the script wrote.",
    };
  }
  const solution = parsed.data;

  if (solution.fingerprint !== fingerprint) {
    return {
      ok: false,
      reason:
        "Projects, rooms, tables or timing changed since that problem was downloaded. Download it again and re-run the script.",
    };
  }
  if (solution.status === "infeasible") {
    const why = solution.reasons?.length ? ` ${solution.reasons.join(" ")}` : "";
    return {
      ok: false,
      reason: `CP-SAT proved no schedule fits this window and these rooms.${why} Widen the window, shorten the slots or add rooms.`,
    };
  }
  if (solution.status === "unknown" || solution.placements.length === 0) {
    return {
      ok: false,
      reason: "CP-SAT ran out of time before finding a schedule. Re-run it with a larger --time-limit.",
    };
  }

  const placements: Placement[] = solution.placements.map((p) => ({
    entryId: p.entryId,
    challengeId: p.challengeId,
    roomId: p.roomId,
    slot: p.slot,
  }));
  // Judge it by the rules, not by what the file claims about itself.
  const strict = validateSchedule(inputs, placements, { relaxed: false });
  const check = strict.valid ? strict : validateSchedule(inputs, placements, { relaxed: true });
  if (!check.valid) {
    return {
      ok: false,
      reason: `That schedule breaks the rules: ${check.errors.slice(0, 3).join(" ")}`,
    };
  }
  return {
    ok: true,
    status: solution.status,
    relaxed: !strict.valid,
    placements,
    score: scoreSchedule(inputs, placements),
    reducedBreaks: check.reducedBreaks,
    judging: judgeOutcome(inputs, placements, judges, solution.assignments),
  };
}

export type CpsatAssignmentImport =
  | {
      ok: true;
      status: "optimal" | "feasible";
      assignments: JudgeAssignment[];
      metrics: JudgeMetrics;
    }
  | { ok: false; reason: string };

/**
 * Reads what cpsat.py printed for a cpsatAssignmentProblem. Unlike a new
 * schedule, nothing here is optional: the assignments must keep the rules
 * for the judges, leave every one in `keep` as it was, and break no rule that
 * `keep` did not already break.
 */
export function readCpsatAssignments(
  inputs: PlanInputs,
  placements: readonly Placement[],
  judges: readonly JudgeInput[],
  keep: readonly JudgeAssignment[],
  text: string,
): CpsatAssignmentImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "CP-SAT did not print a solution." };
  }
  const parsed = solutionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "CP-SAT did not print a solution from cpsat.py." };
  }
  const solution = parsed.data;
  if (solution.fingerprint !== assignmentFingerprint(placements)) {
    return { ok: false, reason: "CP-SAT answered a different schedule." };
  }
  if (solution.status === "infeasible" || solution.status === "unknown") {
    return { ok: false, reason: "CP-SAT found no assignment of judges in the time it had." };
  }
  if (!solution.assignments) {
    return { ok: false, reason: "CP-SAT did not assign judges." };
  }

  const assignments = assignmentsOf(solution.assignments);
  const before = new Set(
    validateJudgeAssignment(inputs, placements, judges, keep).problems,
  );
  const broken = validateJudgeAssignment(
    inputs,
    placements,
    judges,
    assignments,
  ).problems.filter((problem) => !before.has(problem));
  if (broken.length > 0) {
    return {
      ok: false,
      reason: `CP-SAT assigned judges against the rules: ${broken.slice(0, 3).join(" ")}`,
    };
  }
  const given = new Map(
    assignments.map((a) => [taskKey(a.entryId, a.challengeId), a.judgeId]),
  );
  if (keep.some((k) => given.get(taskKey(k.entryId, k.challengeId)) !== k.judgeId)) {
    return { ok: false, reason: "CP-SAT changed an assignment it was told to keep." };
  }
  return {
    ok: true,
    status: solution.status,
    assignments,
    metrics: scoreJudgeAssignment(inputs, placements, judges, assignments),
  };
}
