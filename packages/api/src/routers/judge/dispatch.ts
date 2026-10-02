import { randomInt } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  hackathons,
  judgeAssignments,
  judgeQueue,
  judgeVotes,
  judgingProjects,
} from "@query/db";
import type { DrizzleDB } from "@query/db";

/**
 * Judging runs from a shared pool, not per-judge lists built in advance.
 *
 * A judge asks for a table; the server hands them the eligible project with
 * the fewest looks so far that they have not had and nobody else is at. A
 * judge_queue row is written at that moment, so the table holds visits, not
 * plans. Judges who arrive late start contributing immediately, judges who
 * never show strand nothing, and coverage evens out on its own whatever the
 * head count turns out to be.
 */

/** Target time at a table; the judge page turns amber here. */
export const JUDGE_TARGET_SECONDS = 180;
/** Hard cutoff from the tap or scan. No score by then and the look is void. */
export const JUDGE_HARD_LIMIT_SECONDS = 240;
/** How long a handed-out table stays held while the judge walks to it. */
export const JUDGE_WALK_LIMIT_SECONDS = 240;
/** Slack on the cutoff for a submit that left the phone just before 4:00. */
export const JUDGE_SUBMIT_GRACE_SECONDS = 15;

type Slot = {
  startedAt: Date | null;
  arrivedAt: Date | null;
  isCompleted: boolean;
};

/**
 * Whether a visit still holds its table. Walking: until the walk limit after
 * hand-out. At the table: until the hard limit (plus grace) after arrival.
 */
export function isLive(slot: Slot, now: Date): boolean {
  if (slot.isCompleted) return false;
  const t = now.getTime();
  if (slot.arrivedAt) {
    return (
      t <=
      slot.arrivedAt.getTime() +
        (JUDGE_HARD_LIMIT_SECONDS + JUDGE_SUBMIT_GRACE_SECONDS) * 1000
    );
  }
  if (slot.startedAt) {
    return t <= slot.startedAt.getTime() + JUDGE_WALK_LIMIT_SECONDS * 1000;
  }
  return false;
}

/** Past the hard cutoff, with grace: a score now arrives too late to count. */
export function isPastCutoff(arrivedAt: Date, now: Date): boolean {
  return (
    now.getTime() >
    arrivedAt.getTime() +
      (JUDGE_HARD_LIMIT_SECONDS + JUDGE_SUBMIT_GRACE_SECONDS) * 1000
  );
}

export type Candidate = {
  id: string;
  tableNumber: number;
  /** Scores plus live claims from judges in the same group. */
  coverage: number;
  /** Most recent live claim by another judge, if any (ms epoch). */
  claimedAt: number | null;
};

/**
 * The next project for one judge, from the projects they are eligible for and
 * have not had. Fewest looks first; among equals the nearest table to where
 * the judge just was, since at three minutes a table the walk is real time;
 * then random. A table someone is already at is passed over while any other
 * exists; when every remaining one is taken, the one claimed longest ago,
 * because an idle judge is worse than two at a table.
 */
export function pickNext(
  candidates: Candidate[],
  lastTable: number | null,
  random: (n: number) => number = (n) => randomInt(0, n),
): Candidate | null {
  if (candidates.length === 0) return null;

  const free = candidates.filter((c) => c.claimedAt === null);
  if (free.length === 0) {
    return [...candidates].sort(
      (a, b) => (a.claimedAt ?? 0) - (b.claimedAt ?? 0),
    )[0]!;
  }

  const fewest = Math.min(...free.map((c) => c.coverage));
  const tier = free.filter((c) => c.coverage === fewest);

  if (lastTable === null) return tier[random(tier.length)]!;

  const distance = (c: Candidate) => Math.abs(c.tableNumber - lastTable);
  const nearest = Math.min(...tier.map(distance));
  const closest = tier.filter((c) => distance(c) === nearest);
  return closest[random(closest.length)]!;
}

/** Does this project fall inside a judge's track/challenge label? */
export const projectMatchesTrack = (
  project: {
    tracks: string[] | null;
    challenges: string[] | null;
    isCreateX?: boolean | null;
  },
  track: string | null,
) => {
  if (!track) return true;
  const inTracks = project.tracks?.includes(track) ?? false;
  const inChallenges = project.challenges?.includes(track) ?? false;
  const matchCreateX = track.toLowerCase() === "createx" && !!project.isCreateX;
  return inTracks || inChallenges || matchCreateX;
};

/**
 * Serialises dispatch within one hackathon for the rest of the transaction.
 * Choosing a table reads coverage and claims and then writes one; without
 * this two judges asking at once could both be sent to the same table.
 * Dispatch is a few dozen milliseconds and runs a handful of times a minute,
 * so a single lock per hackathon costs nothing.
 */
export async function lockDispatch(tx: DrizzleDB, hackathonId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`judging:${hackathonId}`}))`,
  );
}

/**
 * Coverage is counted within a judge's group. Sponsor/special-label judges
 * cover their own pool for their own prize; looks from them do not stand in
 * for the main panel and vice versa. With no main tracks configured every
 * label counts as main, the same fallback the old assignment used.
 */
function groupOf(track: string | null, mainTracks: Set<string>) {
  return track && !mainTracks.has(track) ? `special:${track}` : "main";
}

export type DispatchResult =
  | { done: true }
  | {
      done: false;
      queueId: string;
      project: typeof judgingProjects.$inferSelect;
      startedAt: Date | null;
      arrivedAt: Date | null;
    };

/**
 * Projects this judge is eligible for (only the columns routing needs), and
 * the group they judge in. Queries run one after another: inside a
 * transaction they share one connection, which cannot run two at once.
 */
export async function loadPool(
  db: DrizzleDB,
  judgeId: string,
  hackathonId: string,
) {
  const hackathon = await db.query.hackathons.findFirst({
    where: eq(hackathons.id, hackathonId),
    columns: { tracks: true },
  });
  const assignments = await db
    .select({ judgeId: judgeAssignments.judgeId, track: judgeAssignments.track })
    .from(judgeAssignments)
    .where(eq(judgeAssignments.hackathonId, hackathonId));
  const projects = await db
    .select({
      id: judgingProjects.id,
      tableNumber: judgingProjects.tableNumber,
      tracks: judgingProjects.tracks,
      challenges: judgingProjects.challenges,
      isCreateX: judgingProjects.isCreateX,
    })
    .from(judgingProjects)
    .where(
      and(
        eq(judgingProjects.hackathonId, hackathonId),
        isNull(judgingProjects.withdrawnAt),
      ),
    );

  const mainTracks = new Set(
    hackathon?.tracks?.length
      ? hackathon.tracks
      : assignments.map((a) => a.track).filter((t): t is string => !!t),
  );
  const trackByJudge = new Map(assignments.map((a) => [a.judgeId, a.track]));
  const myTrack = trackByJudge.get(judgeId) ?? null;
  const groupByJudge = (id: string) =>
    groupOf(trackByJudge.get(id) ?? null, mainTracks);

  return {
    pool: projects.filter((p) => projectMatchesTrack(p, myTrack)),
    myGroup: groupOf(myTrack, mainTracks),
    groupByJudge,
  };
}

const fullProject = async (tx: DrizzleDB, id: string) =>
  (await tx.query.judgingProjects.findFirst({
    where: eq(judgingProjects.id, id),
  }))!;

/**
 * Hands the judge their next table. Must run inside a transaction. The pool
 * (projects and tracks, which barely move during judging) is read first; then
 * the hackathon's dispatch lock is taken for the part that has to be atomic:
 * void the judge's own visits that ran out, return a visit that is still live
 * (so a reload or a second tab gets the same table), and otherwise pick and
 * claim a new one from current coverage and claims.
 */
export async function dispatchNext(
  tx: DrizzleDB,
  judgeId: string,
  hackathonId: string,
  now: Date = new Date(),
): Promise<DispatchResult> {
  const { pool, myGroup, groupByJudge } = await loadPool(tx, judgeId, hackathonId);

  await lockDispatch(tx, hackathonId);

  const mine = await tx
    .select({
      id: judgeQueue.id,
      projectId: judgeQueue.projectId,
      isCompleted: judgeQueue.isCompleted,
      startedAt: judgeQueue.startedAt,
      arrivedAt: judgeQueue.arrivedAt,
      completedAt: judgeQueue.completedAt,
    })
    .from(judgeQueue)
    .where(
      and(
        eq(judgeQueue.judgeId, judgeId),
        eq(judgeQueue.hackathonId, hackathonId),
      ),
    );

  // A visit that ran out without a score is over; the project goes back to
  // the pool for someone else, and not to this judge again. A row that was
  // never handed out at all is a list an earlier version built in advance:
  // it is not a visit, so it goes rather than blocking that project.
  const unopened = mine.filter(
    (r) => !r.isCompleted && !r.startedAt && !r.arrivedAt,
  );
  const lapsed = mine.filter(
    (r) => !r.isCompleted && (r.startedAt || r.arrivedAt) && !isLive(r, now),
  );
  if (unopened.length > 0) {
    await tx.delete(judgeQueue).where(
      inArray(
        judgeQueue.id,
        unopened.map((r) => r.id),
      ),
    );
  }
  if (lapsed.length > 0) {
    await tx
      .update(judgeQueue)
      .set({ isCompleted: true, completedAt: now })
      .where(
        inArray(
          judgeQueue.id,
          lapsed.map((r) => r.id),
        ),
      );
  }
  const visits = mine.filter((r) => !unopened.includes(r));

  const poolById = new Map(pool.map((p) => [p.id, p]));
  const live = visits.find((r) => isLive(r, now));
  // A live visit to a project withdrawn since is dropped like any other.
  if (live && poolById.has(live.projectId)) {
    return {
      done: false,
      queueId: live.id,
      project: await fullProject(tx, live.projectId),
      startedAt: live.startedAt,
      arrivedAt: live.arrivedAt,
    };
  }

  const seen = new Set(visits.map((r) => r.projectId));
  const unseen = pool.filter((p) => !seen.has(p.id));
  if (unseen.length === 0) return { done: true };

  // Scores and open visits for the whole hackathon: a few thousand rows at
  // most, and one indexed read each rather than a 500-id parameter list.
  const votes = await tx
    .select({ judgeId: judgeVotes.judgeId, projectId: judgeVotes.projectId })
    .from(judgeVotes)
    .innerJoin(
      judgingProjects,
      and(
        eq(judgingProjects.id, judgeVotes.projectId),
        eq(judgingProjects.hackathonId, hackathonId),
      ),
    );
  const open = await tx
    .select({
      judgeId: judgeQueue.judgeId,
      projectId: judgeQueue.projectId,
      startedAt: judgeQueue.startedAt,
      arrivedAt: judgeQueue.arrivedAt,
      isCompleted: judgeQueue.isCompleted,
    })
    .from(judgeQueue)
    .where(
      and(
        eq(judgeQueue.hackathonId, hackathonId),
        eq(judgeQueue.isCompleted, false),
      ),
    );

  const coverage = new Map<string, number>();
  const bump = (projectId: string) =>
    coverage.set(projectId, (coverage.get(projectId) ?? 0) + 1);
  for (const v of votes) if (groupByJudge(v.judgeId) === myGroup) bump(v.projectId);

  const claimedAt = new Map<string, number>();
  for (const row of open) {
    if (row.judgeId === judgeId || !isLive(row, now)) continue;
    if (groupByJudge(row.judgeId) === myGroup) bump(row.projectId);
    const at = (row.arrivedAt ?? row.startedAt)!.getTime();
    claimedAt.set(row.projectId, Math.max(claimedAt.get(row.projectId) ?? 0, at));
  }

  const stamp = (r: (typeof visits)[number]) =>
    (r.completedAt ?? r.arrivedAt ?? r.startedAt ?? new Date(0)).getTime();
  const lastVisit = [...visits].sort((a, b) => stamp(b) - stamp(a))[0];

  const choice = pickNext(
    unseen.map((p) => ({
      id: p.id,
      tableNumber: p.tableNumber,
      coverage: coverage.get(p.id) ?? 0,
      claimedAt: claimedAt.get(p.id) ?? null,
    })),
    lastVisit ? (poolById.get(lastVisit.projectId)?.tableNumber ?? null) : null,
  );
  if (!choice) return { done: true };

  const [row] = await tx
    .insert(judgeQueue)
    .values({
      judgeId,
      hackathonId,
      projectId: choice.id,
      order: visits.length + 1,
      startedAt: now,
    })
    .returning({ id: judgeQueue.id });

  return {
    done: false,
    queueId: row!.id,
    project: await fullProject(tx, choice.id),
    startedAt: now,
    arrivedAt: null,
  };
}
