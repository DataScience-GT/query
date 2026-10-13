import { z } from "zod";
import type { Placement, PlanInputs } from "./inputs";
import { scoreSchedule, validateSchedule } from "./rules";
import type { PlanScore, ReducedBreak } from "./rules";

// The fallback for when the in-app solver cannot build a schedule: the
// organiser downloads the problem, runs the CP-SAT script on a laptop
// (packages/api/scripts/judging-schedule/cpsat.py), and uploads what it
// writes. Nothing in the upload is trusted: it must answer the problem as it
// stands now (same fingerprint) and pass validateSchedule like any schedule
// the server builds.

export const CPSAT_PROBLEM_FORMAT = "query-judging-schedule-problem";
export const CPSAT_SOLUTION_FORMAT = "query-judging-schedule-solution";

/** The command shown next to the download. */
export const CPSAT_COMMAND =
  "uv run packages/api/scripts/judging-schedule/cpsat.py problem.json -o solution.json";

/**
 * The problem file cpsat.py reads. `hint` is a schedule to start from, such
 * as the best partial one the in-app solver found.
 */
export function cpsatProblem(
  inputs: PlanInputs,
  fingerprint: string,
  hint?: readonly Placement[],
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
});

export type CpsatImport =
  | {
      ok: true;
      /** "optimal" when CP-SAT proved no schedule beats this one. */
      status: "optimal" | "feasible";
      relaxed: boolean;
      placements: Placement[];
      score: PlanScore;
      reducedBreaks: ReducedBreak[];
    }
  | { ok: false; reason: string };

/** Reads and checks an uploaded solution.json against the current problem. */
export function readCpsatSolution(
  inputs: PlanInputs,
  fingerprint: string,
  text: string,
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
        "Projects, rooms or timing changed since that problem was downloaded. Download it again and re-run the script.",
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
  };
}
