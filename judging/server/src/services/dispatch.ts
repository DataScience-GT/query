import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { isLive, pickNext } from "@panel/core";
import type { TimerConfig } from "@panel/core";
import type { PanelDb, PanelTx } from "@panel/db";
import {
  event,
  eventConfig,
  eventLog,
  judge,
  outbox,
  project,
  projectTrack,
  track,
  visit,
  vote,
} from "@panel/db";
import { isDeliveredTopic, logsForHandout } from "./logs";

export type DispatchOutcome =
  | { done: true }
  | {
      done: false;
      reused: boolean;
      visitId: string;
      projectId: string;
      projectName: string;
      tableNumber: number | null;
      zoneId: string | null;
      handedOutAt: Date;
      arrivedAt: Date | null;
    };

type VisitRow = typeof visit.$inferSelect;
type ProjectRow = typeof project.$inferSelect;

export async function dispatchNext(
  db: PanelDb,
  input: { eventId: string; judgeId: string; now: Date },
): Promise<DispatchOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`dispatch:${input.eventId}`}))`,
    );

    const phase = await loadPhase(tx, input.eventId);
    if (phase !== "judging_live") {
      throw new Error(`dispatch is not allowed while the event is ${phase}`);
    }
    const config = await loadConfig(tx, input.eventId);
    const judgeRow = await loadJudge(tx, input.judgeId, input.eventId);
    if (judgeRow.status !== "approved") {
      throw new Error("This judge is not approved");
    }

    const projects = await loadPool(tx, input.eventId, judgeRow.trackId);
    const poolIds = new Set(projects.map((item) => item.id));
    const mine = await tx
      .select()
      .from(visit)
      .where(
        and(eq(visit.judgeId, input.judgeId), eq(visit.eventId, input.eventId)),
      );

    const lapsed = mine.filter(
      (row) =>
        !row.completedAt &&
        !row.voidedAt &&
        (row.handedOutAt || row.arrivedAt) &&
        (!isLive(clock(row), input.now, config) || !poolIds.has(row.projectId)),
    );
    if (lapsed.length > 0) {
      for (const row of lapsed) {
        await tx
          .update(visit)
          .set({
            voidedAt: input.now,
            voidReason: poolIds.has(row.projectId) ? "lapsed" : "withdrawn",
          })
          .where(eq(visit.id, row.id));
      }
    }

    const open = mine.find(
      (row) =>
        !lapsed.includes(row) &&
        !row.completedAt &&
        !row.voidedAt &&
        isLive(clock(row), input.now, config),
    );
    if (open) {
      const current = projects.find((item) => item.id === open.projectId);
      return {
        done: false as const,
        reused: true,
        visitId: open.id,
        projectId: open.projectId,
        projectName: current?.name ?? "",
        tableNumber: current?.tableNumber ?? null,
        zoneId: current?.zoneId ?? null,
        handedOutAt: open.handedOutAt,
        arrivedAt: open.arrivedAt,
      };
    }

    const seen = new Set(
      mine.filter((row) => !row.voidedAt).map((row) => row.projectId),
    );
    for (const row of lapsed) seen.add(row.projectId);
    const unseen = projects.filter((item) => !seen.has(item.id));
    const myGroup = await groupOf(tx, judgeRow.trackId);
    if (unseen.length === 0) {
      await record(
        tx,
        input,
        lapsed.map((row) => row.id),
        null,
      );
      return { done: true as const };
    }

    const picked = await choose(
      tx,
      input,
      unseen,
      mine,
      projects,
      myGroup,
      config,
    );
    const choice = picked ? unseen.find((item) => item.id === picked.id) : undefined;
    if (!choice) {
      await record(
        tx,
        input,
        lapsed.map((row) => row.id),
        null,
      );
      return { done: true as const };
    }

    const [created] = await tx
      .insert(visit)
      .values({
        eventId: input.eventId,
        judgeId: input.judgeId,
        projectId: choice.id,
        judgeGroup: myGroup,
        handedOutAt: input.now,
      })
      .returning();
    if (!created) throw new Error("visit was not created");

    await record(tx, input, lapsed.map((row) => row.id), {
      visitId: created.id,
      projectId: choice.id,
    });

    return {
      done: false as const,
      reused: false,
      visitId: created.id,
      projectId: choice.id,
      projectName: choice.name,
      tableNumber: choice.tableNumber,
      zoneId: choice.zoneId,
      handedOutAt: created.handedOutAt,
      arrivedAt: null,
    };
  });
}

async function record(
  tx: PanelTx,
  input: { eventId: string; judgeId: string },
  voidedVisitIds: readonly string[],
  handout: { visitId: string; projectId: string } | null,
) {
  const drafts = handout
    ? logsForHandout(voidedVisitIds)
    : voidedVisitIds.map((visitId) => ({
        kind: "visit.voided" as const,
        subject: { visitId } as Record<string, unknown>,
        payload: {} as Record<string, unknown>,
      }));
  if (handout) {
    const handed = drafts[drafts.length - 1];
    if (handed) handed.subject = handout;
  }
  if (drafts.length === 0) return;

  await tx.insert(eventLog).values(
    drafts.map((draft) => ({
      eventId: input.eventId,
      kind: draft.kind,
      actor: { judgeId: input.judgeId },
      subject: draft.subject,
      payload: draft.payload,
    })),
  );
  const topics = drafts.filter((draft) => isDeliveredTopic(draft.kind));
  if (topics.length === 0) return;
  await tx.insert(outbox).values(
    topics.map((draft) => ({
      eventId: input.eventId,
      topic: draft.kind,
      payload: { ...draft.subject, judgeId: input.judgeId },
    })),
  );
}

function clock(row: VisitRow) {
  return {
    handedOutAt: row.handedOutAt,
    arrivedAt: row.arrivedAt,
    completedAt: row.completedAt ?? row.voidedAt,
  };
}

async function loadPhase(tx: PanelDb | PanelTx, eventId: string) {
  const [row] = await tx
    .select({ phase: event.phase })
    .from(event)
    .where(eq(event.id, eventId));
  if (!row) throw new Error("Event not found");
  return row.phase;
}

async function loadConfig(tx: PanelTx, eventId: string): Promise<TimerConfig & {
  strategy: "coverage" | "uncertainty";
  minLooksPerProject: number;
}> {
  const [row] = await tx
    .select()
    .from(eventConfig)
    .where(eq(eventConfig.eventId, eventId));
  if (!row) throw new Error("Event config not found");
  return {
    targetSeconds: row.targetSeconds,
    hardLimitSeconds: row.hardLimitSeconds,
    walkLimitSeconds: row.walkLimitSeconds,
    submitGraceSeconds: row.submitGraceSeconds,
    strategy: row.dispatchStrategy,
    minLooksPerProject: row.minLooksPerProject,
  };
}

async function loadJudge(tx: PanelDb | PanelTx, judgeId: string, eventId: string) {
  const [row] = await tx
    .select()
    .from(judge)
    .where(and(eq(judge.id, judgeId), eq(judge.eventId, eventId)));
  if (!row) throw new Error("Judge not found");
  return row;
}

async function loadPool(tx: PanelDb | PanelTx, eventId: string, trackId: string | null) {
  const projects = await tx
    .select()
    .from(project)
    .where(and(eq(project.eventId, eventId), isNull(project.withdrawnAt)));
  if (!trackId) return projects;
  const links = await tx
    .select({ projectId: projectTrack.projectId })
    .from(projectTrack)
    .where(eq(projectTrack.trackId, trackId));
  const allowed = new Set(links.map((link) => link.projectId));
  return projects.filter((item) => allowed.has(item.id));
}

async function groupOf(tx: PanelTx, trackId: string | null) {
  if (!trackId) return "main";
  const [row] = await tx
    .select({ judgeGroup: track.judgeGroup })
    .from(track)
    .where(eq(track.id, trackId));
  return row?.judgeGroup ?? "main";
}

async function choose(
  tx: PanelTx,
  input: { eventId: string; judgeId: string; now: Date },
  unseen: ProjectRow[],
  mine: VisitRow[],
  projects: ProjectRow[],
  myGroup: string,
  config: TimerConfig & {
    strategy: "coverage" | "uncertainty";
    minLooksPerProject: number;
  },
) {
  const judges = await tx
    .select({ id: judge.id, trackId: judge.trackId })
    .from(judge)
    .where(eq(judge.eventId, input.eventId));
  const tracks = await tx
    .select({ id: track.id, judgeGroup: track.judgeGroup })
    .from(track)
    .where(eq(track.eventId, input.eventId));
  const groupByJudge = new Map(
    judges.map((item) => [
      item.id,
      tracks.find((entry) => entry.id === item.trackId)?.judgeGroup ?? "main",
    ]),
  );

  const coverage = new Map<string, number>();
  const bump = (projectId: string) =>
    coverage.set(projectId, (coverage.get(projectId) ?? 0) + 1);

  const votes = await tx
    .select({ judgeId: vote.judgeId, projectId: vote.projectId })
    .from(vote)
    .where(eq(vote.eventId, input.eventId));
  for (const row of votes) {
    if (groupByJudge.get(row.judgeId) === myGroup) bump(row.projectId);
  }

  const open = await tx
    .select()
    .from(visit)
    .where(and(eq(visit.eventId, input.eventId), isNull(visit.completedAt), isNull(visit.voidedAt)));
  const claimedAt = new Map<string, number>();
  for (const row of open) {
    if (row.judgeId === input.judgeId) continue;
    if (!isLive(clock(row), input.now, config)) continue;
    if (groupByJudge.get(row.judgeId) !== myGroup) continue;
    bump(row.projectId);
    const at = (row.arrivedAt ?? row.handedOutAt).getTime();
    claimedAt.set(row.projectId, Math.max(claimedAt.get(row.projectId) ?? 0, at));
  }

  const byId = new Map(projects.map((item) => [item.id, item]));
  const last = [...mine].sort(
    (a, b) => b.handedOutAt.getTime() - a.handedOutAt.getTime(),
  )[0];
  const lastProject = last ? byId.get(last.projectId) : undefined;

  return pickNext(
    unseen.map((item) => ({
      id: item.id,
      tableNumber: item.tableNumber ?? 0,
      zoneId: item.zoneId,
      coverage: coverage.get(item.id) ?? 0,
      claimedAt: claimedAt.get(item.id) ?? null,
    })),
    {
      lastTable: lastProject?.tableNumber ?? null,
      zoneId: lastProject?.zoneId ?? null,
    },
    {
      strategy: config.strategy,
      minLooksPerProject: config.minLooksPerProject,
    },
    (n) => randomInt(0, n),
  );
}

/** Pass on the open table without a score. It stays seen, so this judge is not sent back. */
export async function skipVisit(
  db: PanelDb,
  input: { eventId: string; judgeId: string; visitId: string; now: Date },
) {
  return db.transaction(async (tx) => {
    const phase = await loadPhase(tx, input.eventId);
    if (phase !== "judging_live") {
      throw new Error(`skip is not allowed while the event is ${phase}`);
    }
    const [row] = await tx
      .select()
      .from(visit)
      .where(
        and(
          eq(visit.id, input.visitId),
          eq(visit.judgeId, input.judgeId),
          eq(visit.eventId, input.eventId),
        ),
      );
    if (!row || row.voidedAt || row.completedAt) {
      throw new Error("This visit cannot be skipped");
    }
    await tx.update(visit).set({ completedAt: input.now }).where(eq(visit.id, row.id));
    await tx.insert(eventLog).values({
      eventId: input.eventId,
      kind: "visit.skipped",
      actor: { judgeId: input.judgeId },
      subject: { visitId: row.id, projectId: row.projectId },
      payload: {},
    });
    return { projectId: row.projectId };
  });
}

export async function judgeProgress(
  db: PanelDb,
  input: { eventId: string; judgeId: string },
) {
  const person = await loadJudge(db, input.judgeId, input.eventId);
  if (person.status !== "approved") throw new Error("This judge is not approved");
  const pool = await loadPool(db, input.eventId, person.trackId);
  const [scored] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vote)
    .where(and(eq(vote.judgeId, input.judgeId), eq(vote.eventId, input.eventId)));
  const total = pool.length;
  const completed = scored?.n ?? 0;
  return {
    judgeId: input.judgeId,
    total,
    completed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
