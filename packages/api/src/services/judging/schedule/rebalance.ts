import type { BoardPresence } from "./board";
import type { JudgeInput } from "./judges";
import type { SavedAppointment } from "./judge-plan";

// Re-balancing judges while judging runs: who has gone, and which open
// appointments are freed for the assigner to give again. No database in here.

/** Long enough to walk to another room and join it. */
export const LEFT_GRACE_MS = 5 * 60_000;

/**
 * Phones lock between presentations and stop the heartbeat; a judge rests a
 * slot after four in a row.
 */
export const QUIET_AFTER_MS = 10 * 60_000;

/** A judge never seen is late once a presentation of theirs is this close. */
const LATE_WITHIN_MS = 10 * 60_000;

/**
 * The member judges who are not here: they left their room and did not join
 * another within LEFT_GRACE_MS; their heartbeat is older than QUIET_AFTER_MS;
 * a presentation of theirs was missed and they were not seen since it began;
 * or judging is under way, they never joined, and a presentation of theirs
 * that is still open starts within 10 minutes. Guests are pinned to their
 * room and always count as here.
 */
export function absentJudgeIds(source: {
  judges: readonly Pick<JudgeInput, "id" | "kind">[];
  presence: readonly Pick<
    BoardPresence,
    "judgeId" | "joinedAt" | "lastSeenAt" | "leftAt"
  >[];
  /** Every appointment of the edition, with its status. */
  appointments: readonly {
    assignedJudgeId: string | null;
    startsAt: Date;
    open: boolean;
    status: string;
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
  const underWay = source.appointments.some((a) => a.startsAt.getTime() <= now);

  const absent = new Set<string>();
  for (const judge of source.judges) {
    if (judge.kind !== "member") continue;
    const rows = rowsOf.get(judge.id) ?? [];
    const mine = source.appointments.filter(
      (a) => a.assignedJudgeId === judge.id,
    );
    const open = rows.filter((row) => !row.leftAt);
    const lastSeen = Math.max(
      ...rows.map((row) =>
        Math.max(row.joinedAt.getTime(), row.lastSeenAt.getTime()),
      ),
    );

    if (open.length > 0) {
      const beat = Math.max(...open.map((row) => row.lastSeenAt.getTime()));
      if (now - beat > QUIET_AFTER_MS) absent.add(judge.id);
    } else if (rows.length > 0) {
      const leftAt = Math.max(...rows.map((row) => row.leftAt!.getTime()));
      if (now - leftAt > LEFT_GRACE_MS) absent.add(judge.id);
    } else if (
      underWay &&
      mine.some(
        (a) => a.open && a.startsAt.getTime() <= now + LATE_WITHIN_MS,
      )
    ) {
      absent.add(judge.id);
    }
    if (
      !absent.has(judge.id) &&
      mine.some(
        (a) =>
          a.status === "missed" &&
          (rows.length === 0 || lastSeen < a.startsAt.getTime()),
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
