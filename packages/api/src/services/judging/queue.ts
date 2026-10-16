import { createHash } from "node:crypto";
import type { GradingState } from "./grading-hold";

// The order a judge is sent through a challenge's projects. Every judge gets
// their own shuffle of the same projects, so judges at one table draw a random
// sample each and rarely reach for the same project at once. The shuffle is a
// hash, not a random draw: it does not move between polls, and a judge who
// reloads is sent to the same project.

/** A project's place in one judge's queue for a challenge. */
function queueKey(judgeId: string, challengeId: string, entryId: string) {
  return createHash("sha256")
    .update(`${judgeId}:${entryId}:${challengeId}`)
    .digest("hex");
}

/** `entryIds` in the order `judgeId` is sent through them for the challenge. */
export function queueOrder(
  judgeId: string,
  challengeId: string,
  entryIds: readonly string[],
): string[] {
  return entryIds
    .map((entryId) => ({
      entryId,
      key: queueKey(judgeId, challengeId, entryId),
    }))
    .sort((a, b) =>
      a.key === b.key
        ? a.entryId.localeCompare(b.entryId)
        : a.key < b.key
          ? -1
          : 1,
    )
    .map((item) => item.entryId);
}

type Candidate = {
  entryId: string;
  grading: GradingState;
  /** A presentation assigned to this judge (scheduled challenges only). */
  assigned?: boolean;
};

// How many open projects at the front of their queue a judge may start at an
// untimed challenge. Calibration depends on each judge's sample being random.
// A small window lets a judge skip a team that is away from its table without
// letting them pick projects.
export const QUEUE_WINDOW = 3;

/**
 * The open projects a judge is offered: the first `window` of them in their
 * queue order, with the presentations assigned to the judge ahead of the rest
 * (each group in that order). A scheduled challenge passes Infinity, since the
 * schedule already decides who sees what.
 */
export function queueWindow(
  judgeId: string,
  challengeId: string,
  candidates: readonly Candidate[],
  window = QUEUE_WINDOW,
): string[] {
  const open = candidates.filter((candidate) => candidate.grading === "open");
  const assigned = new Set(
    open.filter((c) => c.assigned).map((c) => c.entryId),
  );
  const ordered = queueOrder(
    judgeId,
    challengeId,
    open.map((candidate) => candidate.entryId),
  );
  return [
    ...ordered.filter((entryId) => assigned.has(entryId)),
    ...ordered.filter((entryId) => !assigned.has(entryId)),
  ].slice(0, window);
}

/**
 * The next project for the judge to grade: the first of the projects their
 * queue offers that they have not skipped.
 */
export function nextToGrade(
  judgeId: string,
  challengeId: string,
  candidates: readonly Candidate[],
  options: { skip?: readonly string[]; window?: number } = {},
): string | null {
  const skip = new Set(options.skip);
  return (
    queueWindow(judgeId, challengeId, candidates, options.window).find(
      (entryId) => !skip.has(entryId),
    ) ?? null
  );
}
