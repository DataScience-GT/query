import type { BoardPresence } from "./board";
import type { JudgeInput } from "./judges";
import type { SavedAppointment } from "./judge-plan";

// Re-balancing judges while judging runs: who has gone, and which open
// appointments are freed for the assigner to give again. No database in here.

/** The judge desk heartbeats every 60 seconds; three missed ones is gone. */
export const ABSENT_AFTER_MS = 3 * 60_000;

/** A judge never seen is only missed once a presentation of theirs is this close. */
const NEVER_SEEN_WITHIN_MS = 10 * 60_000;

/**
 * The member judges who are not here: they left their room, or their
 * heartbeat is older than ABSENT_AFTER_MS, or they never joined and a
 * presentation of theirs that is still open starts within 10 minutes (or
 * should have). Guests are pinned to their room and always count as here.
 */
export function absentJudgeIds(source: {
  judges: readonly Pick<JudgeInput, "id" | "kind">[];
  presence: readonly Pick<
    BoardPresence,
    "judgeId" | "joinedAt" | "lastSeenAt" | "leftAt"
  >[];
  appointments: readonly {
    assignedJudgeId: string | null;
    startsAt: Date;
    open: boolean;
  }[];
  now: Date;
}): Set<string> {
  const now = source.now.getTime();
  const rowsOf = new Map<string, typeof source.presence[number][]>();
  for (const row of source.presence) {
    const list = rowsOf.get(row.judgeId);
    if (list) list.push(row);
    else rowsOf.set(row.judgeId, [row]);
  }

  const absent = new Set<string>();
  for (const judge of source.judges) {
    if (judge.kind !== "member") continue;
    const rows = rowsOf.get(judge.id) ?? [];
    const open = rows.filter((row) => !row.leftAt);
    if (open.length > 0) {
      const lastSeen = Math.max(...open.map((row) => row.lastSeenAt.getTime()));
      if (now - lastSeen > ABSENT_AFTER_MS) absent.add(judge.id);
    } else if (rows.length > 0) {
      absent.add(judge.id);
    } else if (
      source.appointments.some(
        (a) =>
          a.open &&
          a.assignedJudgeId === judge.id &&
          a.startsAt.getTime() <= now + NEVER_SEEN_WITHIN_MS,
      )
    ) {
      absent.add(judge.id);
    }
  }
  return absent;
}

/**
 * What to give again: the open appointments with no judge, or whose judge is
 * not in `here`. Every other open appointment stays with its judge, so
 * `keep` is those, to hand the assigner next to the judges of the ones that
 * are no longer open.
 */
export function rebalancePlan(
  appointments: readonly SavedAppointment[],
  here: ReadonlySet<string>,
) {
  const open = appointments.filter((a) => a.open && !a.removed);
  const stays = (a: SavedAppointment) =>
    a.assignedJudgeId !== null && here.has(a.assignedJudgeId);
  return {
    free: open.filter((a) => !stays(a)),
    keep: open.filter(stays).map((a) => ({
      entryId: a.entryId,
      challengeId: a.challengeId,
      judgeId: a.assignedJudgeId!,
    })),
  };
}
