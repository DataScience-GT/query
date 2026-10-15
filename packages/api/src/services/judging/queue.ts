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

/** The next project for the judge to grade: the first open one in their queue. */
export function nextToGrade(
  judgeId: string,
  challengeId: string,
  candidates: readonly { entryId: string; grading: GradingState }[],
): string | null {
  const open = candidates
    .filter((candidate) => candidate.grading === "open")
    .map((candidate) => candidate.entryId);
  return queueOrder(judgeId, challengeId, open)[0] ?? null;
}
