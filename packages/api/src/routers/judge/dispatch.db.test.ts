/**
 * The judging pool against a real Postgres, at Hacklytics scale.
 *
 * Mocks cannot show what matters here: that the dispatch lock keeps two
 * judges off one table under real concurrency, and that coverage evens out
 * over hundreds of projects whatever the head count. Runs only when
 * JUDGING_TEST_DATABASE_URL points at a disposable database with the schema
 * pushed (drizzle-kit push). Every test seeds its own hackathon.
 *
 *   docker run -d --name judging-test -e POSTGRES_PASSWORD=pw -p 5498:5432 postgres:18
 *   DATABASE_URL=postgresql://postgres:pw@localhost:5498/postgres pnpm --filter @query/db exec drizzle-kit push
 *   JUDGING_TEST_DATABASE_URL=postgresql://postgres:pw@localhost:5498/postgres pnpm --filter @query/api test dispatch.db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  JUDGE_HARD_LIMIT_SECONDS,
  JUDGE_WALK_LIMIT_SECONDS,
  dispatchNext,
} from "./dispatch";

const URL = process.env.JUDGING_TEST_DATABASE_URL;

const {
  users,
  hackathons,
  judges,
  judgeAssignments,
  judgingProjects,
  judgeQueue,
  judgeVotes,
} = schema;

let db: DrizzleDB;

const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

async function seed(opts: {
  projects: number;
  judges: number;
  tracks?: string[];
  projectTracks?: (i: number) => { tracks?: string[]; challenges?: string[] };
  judgeTrack?: (i: number) => string | null;
}) {
  const hackathonId = randomUUID();
  await db.insert(hackathons).values({
    id: hackathonId,
    name: `pool-test-${hackathonId.slice(0, 8)}`,
    startDate: new Date(),
    endDate: new Date(),
    judgingActive: true,
    tracks: opts.tracks ?? [],
  } as typeof hackathons.$inferInsert);

  const projectIds: string[] = [];
  const projectRows = Array.from({ length: opts.projects }, (_, i) => {
    const id = randomUUID();
    projectIds.push(id);
    const t = opts.projectTracks?.(i) ?? {};
    return {
      id,
      hackathonId,
      name: `Project ${i + 1}`,
      tableNumber: i + 1,
      tracks: t.tracks ?? null,
      challenges: t.challenges ?? null,
    } as typeof judgingProjects.$inferInsert;
  });
  for (let i = 0; i < projectRows.length; i += 200) {
    await db.insert(judgingProjects).values(projectRows.slice(i, i + 200));
  }

  const judgeIds: string[] = [];
  for (let i = 0; i < opts.judges; i++) {
    const userId = randomUUID();
    const judgeId = randomUUID();
    judgeIds.push(judgeId);
    await db.insert(users).values({
      id: userId,
      email: `judge-${userId}@test.local`,
    } as typeof users.$inferInsert);
    await db.insert(judges).values({
      id: judgeId,
      userId,
      hackathonId,
      isActive: true,
    } as typeof judges.$inferInsert);
    await db.insert(judgeAssignments).values({
      judgeId,
      hackathonId,
      track: opts.judgeTrack?.(i) ?? null,
    } as typeof judgeAssignments.$inferInsert);
  }

  return { hackathonId, projectIds, judgeIds };
}

const dispatch = (judgeId: string, hackathonId: string, now: Date) =>
  db.transaction((tx) => dispatchNext(tx as unknown as DrizzleDB, judgeId, hackathonId, now));

/** What completeAndNext does for a score inside the window. */
async function score(judgeId: string, queueId: string, projectId: string, now: Date) {
  await db.insert(judgeVotes).values({
    judgeId,
    projectId,
    score: 30,
    scoreCreativity: 6,
    scoreImpact: 6,
    scoreScope: 6,
    scoreClarity: 6,
    scoreSoundness: 6,
  });
  await db
    .update(judgeQueue)
    .set({ isCompleted: true, completedAt: now })
    .where(eq(judgeQueue.id, queueId));
}

async function arrive(queueId: string, now: Date) {
  await db.update(judgeQueue).set({ arrivedAt: now }).where(eq(judgeQueue.id, queueId));
}

async function looksPerProject(projectIds: string[]) {
  const rows = await db
    .select({ projectId: judgeVotes.projectId, n: sql<number>`count(*)::int` })
    .from(judgeVotes)
    .where(inArray(judgeVotes.projectId, projectIds))
    .groupBy(judgeVotes.projectId);
  const map = new Map(projectIds.map((id) => [id, 0]));
  for (const r of rows) map.set(r.projectId, r.n);
  return [...map.values()];
}

describe.skipIf(!URL)("judging pool on Postgres", () => {
  beforeAll(() => {
    db = drizzle({ connection: { connectionString: URL!, max: 50 }, schema }) as unknown as DrizzleDB;
  });
  afterAll(async () => {
    await (db as unknown as { $client: { end: () => Promise<void> } } | undefined)?.$client.end();
  });

  it("never sends two judges to the same table when 60 ask at once", async () => {
    const { hackathonId, judgeIds } = await seed({ projects: 500, judges: 60 });
    const now = new Date();

    const handed = await Promise.all(judgeIds.map((j) => dispatch(j, hackathonId, now)));

    const projects = handed.map((h) => (h.done ? null : h.project.id));
    expect(projects.every((p) => p !== null)).toBe(true);
    expect(new Set(projects).size).toBe(60);
  }, 30_000);

  it("gives every one of 500 projects two looks before any gets a third, with judges joining late", async () => {
    const { hackathonId, projectIds, judgeIds } = await seed({ projects: 500, judges: 40 });
    const start = new Date("2027-02-28T13:00:00Z");

    // 25 judges start; the other 15 turn up 40 minutes in. Each look is a
    // minute's walk and two and a half minutes at the table.
    let clock = 0;
    const onFloor = new Set(judgeIds.slice(0, 25));
    let scored = 0;
    while (scored < 1000) {
      if (clock >= 40 * 60) judgeIds.slice(25).forEach((j) => onFloor.add(j));
      for (const judgeId of onFloor) {
        if (scored >= 1000) break;
        const t = at(start, clock);
        const next = await dispatch(judgeId, hackathonId, t);
        if (next.done) continue;
        await arrive(next.queueId, at(t, 60));
        await score(judgeId, next.queueId, next.project.id, at(t, 210));
        scored++;
      }
      clock += 210;
    }

    const looks = await looksPerProject(projectIds);
    expect(Math.min(...looks)).toBe(2);
    expect(Math.max(...looks)).toBe(2);
  }, 120_000);

  it("hands a no-show's table to someone else once the walk limit passes", async () => {
    const { hackathonId, judgeIds } = await seed({ projects: 2, judges: 2 });
    const [absent, present] = judgeIds as [string, string];
    const t0 = new Date("2027-02-28T13:00:00Z");

    const held = await dispatch(absent, hackathonId, t0);
    if (held.done) throw new Error("expected a table");

    // While the absent judge could still be walking over, their table is held.
    const other = await dispatch(present, hackathonId, at(t0, 30));
    if (other.done) throw new Error("expected a table");
    expect(other.project.id).not.toBe(held.project.id);
    await arrive(other.queueId, at(t0, 60));
    await score(present, other.queueId, other.project.id, at(t0, 200));

    // They never arrive. Past the walk limit the table is free again.
    const late = await dispatch(present, hackathonId, at(t0, JUDGE_WALK_LIMIT_SECONDS + 1));
    if (late.done) throw new Error("expected the abandoned table");
    expect(late.project.id).toBe(held.project.id);
  });

  it("voids a look that passes the hard cutoff and puts the project back in the pool", async () => {
    const { hackathonId, judgeIds } = await seed({ projects: 2, judges: 2 });
    const [slow, other] = judgeIds as [string, string];
    const t0 = new Date("2027-02-28T13:00:00Z");

    const mine = await dispatch(slow, hackathonId, t0);
    if (mine.done) throw new Error("expected a table");
    await arrive(mine.queueId, at(t0, 30));

    // Past 4:00 (plus grace) without a score: asking again closes the visit
    // and moves the judge on rather than handing back the same table.
    const after = at(t0, 30 + JUDGE_HARD_LIMIT_SECONDS + 60);
    const next = await dispatch(slow, hackathonId, after);
    if (next.done) throw new Error("expected a second table");
    expect(next.project.id).not.toBe(mine.project.id);

    const [closed] = await db
      .select()
      .from(judgeQueue)
      .where(eq(judgeQueue.id, mine.queueId));
    expect(closed?.isCompleted).toBe(true);

    // The voided project has no score, so it is the least-covered for others.
    const theirs = await dispatch(other, hackathonId, after);
    if (theirs.done) throw new Error("expected a table");
    expect(theirs.project.id).toBe(mine.project.id);
  });

  it("returns the same live table on a repeat request instead of claiming a second", async () => {
    const { hackathonId, judgeIds } = await seed({ projects: 5, judges: 1 });
    const t0 = new Date("2027-02-28T13:00:00Z");
    const a = await dispatch(judgeIds[0]!, hackathonId, t0);
    const b = await dispatch(judgeIds[0]!, hackathonId, at(t0, 20));
    if (a.done || b.done) throw new Error("expected tables");
    expect(b.queueId).toBe(a.queueId);
    const rows = await db
      .select()
      .from(judgeQueue)
      .where(and(eq(judgeQueue.hackathonId, hackathonId), eq(judgeQueue.judgeId, judgeIds[0]!)));
    expect(rows).toHaveLength(1);
  });

  it("closes a live visit to a withdrawn project instead of holding it open beside new ones", async () => {
    const { hackathonId, judgeIds } = await seed({ projects: 5, judges: 1 });
    const t0 = new Date("2027-02-28T13:00:00Z");
    const first = await dispatch(judgeIds[0]!, hackathonId, t0);
    if (first.done) throw new Error("expected a table");
    await db
      .update(judgingProjects)
      .set({ withdrawnAt: at(t0, 10) })
      .where(eq(judgingProjects.id, first.project.id));

    const second = await dispatch(judgeIds[0]!, hackathonId, at(t0, 20));
    const third = await dispatch(judgeIds[0]!, hackathonId, at(t0, 30));
    if (second.done || third.done) throw new Error("expected tables");
    expect(second.project.id).not.toBe(first.project.id);
    expect(third.queueId).toBe(second.queueId);

    const open = await db
      .select()
      .from(judgeQueue)
      .where(and(eq(judgeQueue.judgeId, judgeIds[0]!), eq(judgeQueue.isCompleted, false)));
    expect(open.map((r) => r.id)).toEqual([second.queueId]);
  });

  it("clears a list built in advance by the old assignment instead of treating it as visits", async () => {
    const { hackathonId, projectIds, judgeIds } = await seed({ projects: 3, judges: 1 });
    await db.insert(judgeQueue).values(
      projectIds.map((projectId, i) => ({
        judgeId: judgeIds[0]!,
        hackathonId,
        projectId,
        order: i + 1,
      })),
    );
    const next = await dispatch(judgeIds[0]!, hackathonId, new Date());
    expect(next.done).toBe(false);
    const rows = await db
      .select()
      .from(judgeQueue)
      .where(eq(judgeQueue.judgeId, judgeIds[0]!));
    expect(rows).toHaveLength(1);
  });

  it("keeps a sponsor judge to their challenge and counts their looks separately", async () => {
    const { hackathonId, projectIds, judgeIds } = await seed({
      projects: 6,
      judges: 2,
      tracks: ["Finance"],
      // Projects 1-3 entered the sponsor challenge.
      projectTracks: (i) => ({ tracks: ["Finance"], challenges: i < 3 ? ["Sponsor"] : [] }),
      judgeTrack: (i) => (i === 0 ? "Sponsor" : "Finance"),
    });
    const [sponsor, main] = judgeIds as [string, string];
    const t0 = new Date("2027-02-28T13:00:00Z");

    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const next = await dispatch(sponsor, hackathonId, at(t0, i * 300));
      if (next.done) break;
      seen.push(next.project.id);
      await arrive(next.queueId, at(t0, i * 300 + 10));
      await score(sponsor, next.queueId, next.project.id, at(t0, i * 300 + 100));
    }
    expect(new Set(seen)).toEqual(new Set(projectIds.slice(0, 3)));

    // The sponsor's looks do not count as main coverage: the main judge still
    // starts on a project nobody on the main panel has seen, which may be one
    // of the three the sponsor already scored.
    const next = await dispatch(main, hackathonId, at(t0, 2000));
    expect(next.done).toBe(false);
  });
});
