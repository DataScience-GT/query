import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { phaseAllows, rank } from "@query/judging-core";
import type { PanelDb } from "@query/judging-db";
import {
  comparison,
  event,
  eventConfig,
  eventLog,
  judge,
  outbox,
  project,
  projectTrack,
  result,
  resultRun,
  track,
  vote,
} from "@query/judging-db";

export type Placement = {
  projectId: string;
  trackId: string;
  placement: number | null;
  score: number;
  rubricComponent: number;
  pairwiseComponent: number;
};

/** Projects whose place or blend components changed between two runs. */
export function diffPlacements(left: readonly Placement[], right: readonly Placement[]) {
  const later = new Map(right.map((row) => [`${row.trackId}:${row.projectId}`, row]));
  return left.flatMap((row) => {
    const other = later.get(`${row.trackId}:${row.projectId}`);
    const to = other?.placement ?? null;
    const score = other?.score ?? row.score;
    const rubricTo = other?.rubricComponent ?? row.rubricComponent;
    const pairwiseTo = other?.pairwiseComponent ?? row.pairwiseComponent;
    if (
      row.placement === to &&
      row.score === score &&
      row.rubricComponent === rubricTo &&
      row.pairwiseComponent === pairwiseTo
    ) {
      return [];
    }
    return [
      {
        projectId: row.projectId,
        trackId: row.trackId,
        from: row.placement,
        to,
        score,
        rubricFrom: row.rubricComponent,
        rubricTo,
        pairwiseFrom: row.pairwiseComponent,
        pairwiseTo,
      },
    ];
  });
}

export async function computeResults(
  db: PanelDb,
  input: { eventId: string; actorEmail: string; now: Date },
) {
  return db.transaction(async (tx) => {
    const [evt] = await tx
      .select({ phase: event.phase })
      .from(event)
      .where(eq(event.id, input.eventId));
    const [config] = await tx
      .select()
      .from(eventConfig)
      .where(eq(eventConfig.eventId, input.eventId));
    if (!evt || !config) throw new Error("Event not found");
    if (!phaseAllows(evt.phase, "compute")) {
      throw new Error(`compute is not allowed while the event is ${evt.phase}`);
    }

    const projects = await tx
      .select()
      .from(project)
      .where(and(eq(project.eventId, input.eventId), isNull(project.withdrawnAt)));
    const links = await tx
      .select({ projectId: projectTrack.projectId, trackId: projectTrack.trackId })
      .from(projectTrack)
      .innerJoin(project, eq(project.id, projectTrack.projectId))
      .where(eq(project.eventId, input.eventId));
    const tracks = await tx
      .select({ id: track.id, judgeGroup: track.judgeGroup })
      .from(track)
      .where(eq(track.eventId, input.eventId));
    const judges = await tx
      .select({ id: judge.id, trackId: judge.trackId })
      .from(judge)
      .where(eq(judge.eventId, input.eventId));
    const groupOf = new Map(
      judges.map((row) => [
        row.id,
        tracks.find((item) => item.id === row.trackId)?.judgeGroup ?? "main",
      ]),
    );
    const votes = await tx
      .select()
      .from(vote)
      .where(eq(vote.eventId, input.eventId));
    const comparisons = await tx
      .select()
      .from(comparison)
      .where(eq(comparison.eventId, input.eventId));

    const byProject = new Map<string, string[]>();
    for (const link of links) {
      const list = byProject.get(link.projectId) ?? [];
      list.push(link.trackId);
      byProject.set(link.projectId, list);
    }

    const ranked = rank(
      projects.map((row) => ({
        id: row.id,
        trackIds: byProject.get(row.id) ?? [],
      })),
      votes.map((row) => ({
        judgeId: row.judgeId,
        projectId: row.projectId,
        judgeGroup: groupOf.get(row.judgeId) ?? "main",
        total: row.total,
        isCalibration: row.isCalibration,
      })),
      comparisons.map((row) => ({
        judgeId: row.judgeId,
        judgeGroup: row.judgeGroup,
        a: row.aProjectId,
        b: row.bProjectId,
        outcome: row.outcome,
      })),
      {
        bayesianC: config.bayesianC,
        pairwiseWeight: config.pairwiseEnabled ? config.pairwiseWeight : 0,
        calibrationWeight: config.calibrationWeight,
      },
    );

    const [run] = await tx
      .insert(resultRun)
      .values({
        eventId: input.eventId,
        computedAt: input.now,
        configSnapshot: {
          bayesianC: config.bayesianC,
          pairwiseWeight: config.pairwiseWeight,
          pairwiseEnabled: config.pairwiseEnabled,
          calibrationWeight: config.calibrationWeight,
        },
      })
      .returning({ id: resultRun.id });
    if (!run) throw new Error("Result run was not stored");

    const placed = ranked.filter((row) => row.placement !== null);
    if (placed.length > 0) {
      await tx.insert(result).values(
        placed.map((row) => ({
          runId: run.id,
          projectId: row.projectId,
          trackId: row.trackId,
          placement: row.placement,
          score: row.score,
          rubricComponent: row.rubricComponent,
          pairwiseComponent: row.pairwiseComponent,
          voteCount: row.voteCount,
          comparisonCount: row.comparisonCount,
          flags: [],
        })),
      );
    }

    await tx.insert(eventLog).values({
      eventId: input.eventId,
      kind: "results.computed",
      actor: { email: input.actorEmail },
      subject: { runId: run.id },
      payload: { rows: placed.length },
    });

    return { runId: run.id, rows: placed.length };
  });
}

export async function publishResults(
  db: PanelDb,
  input: { eventId: string; runId: string; actorEmail: string; now: Date },
) {
  return db.transaction(async (tx) => {
    const [evt] = await tx
      .select({ phase: event.phase })
      .from(event)
      .where(eq(event.id, input.eventId));
    if (!evt) throw new Error("Event not found");
    if (!phaseAllows(evt.phase, "publish")) {
      throw new Error(`publish is not allowed while the event is ${evt.phase}`);
    }
    const [run] = await tx
      .select({ id: resultRun.id })
      .from(resultRun)
      .where(and(eq(resultRun.id, input.runId), eq(resultRun.eventId, input.eventId)));
    if (!run) throw new Error("Result run not found");

    await tx
      .update(resultRun)
      .set({ publishedAt: input.now })
      .where(eq(resultRun.id, run.id));
    await tx.update(event).set({ phase: "published" }).where(eq(event.id, input.eventId));
    await tx.insert(eventLog).values({
      eventId: input.eventId,
      kind: "results.published",
      actor: { email: input.actorEmail },
      subject: { runId: run.id },
      payload: { from: evt.phase, to: "published" },
    });
    await tx.insert(outbox).values({
      eventId: input.eventId,
      topic: "results.published",
      payload: { runId: run.id },
    });
    await tx.execute(sql`
      update project
      set feedback_token = gen_random_uuid()
      where event_id = ${input.eventId} and feedback_token is null
    `);
    return { runId: run.id };
  });
}

export async function unpublishResults(
  db: PanelDb,
  input: { eventId: string; actorEmail: string },
) {
  return db.transaction(async (tx) => {
    const [evt] = await tx
      .select({ phase: event.phase })
      .from(event)
      .where(eq(event.id, input.eventId));
    if (!evt) throw new Error("Event not found");
    if (evt.phase !== "published") {
      throw new Error(`unpublish is not allowed while the event is ${evt.phase}`);
    }
    const [run] = await tx
      .select({ id: resultRun.id })
      .from(resultRun)
      .where(and(eq(resultRun.eventId, input.eventId), isNotNull(resultRun.publishedAt)))
      .orderBy(desc(resultRun.publishedAt))
      .limit(1);
    if (!run) throw new Error("Nothing is published");
    await tx.update(resultRun).set({ publishedAt: null }).where(eq(resultRun.id, run.id));
    await tx.update(event).set({ phase: "judging_closed" }).where(eq(event.id, input.eventId));
    await tx.insert(eventLog).values({
      eventId: input.eventId,
      kind: "results.unpublished",
      actor: { email: input.actorEmail },
      subject: { runId: run.id },
      payload: { from: "published", to: "judging_closed" },
    });
    await tx.insert(outbox).values({
      eventId: input.eventId,
      topic: "results.unpublished",
      payload: { runId: run.id },
    });
    return { runId: run.id };
  });
}

export async function placementsForRun(db: PanelDb, runId: string): Promise<Placement[]> {
  const rows = await db
    .select({
      projectId: result.projectId,
      trackId: result.trackId,
      placement: result.placement,
      score: result.score,
      rubricComponent: result.rubricComponent,
      pairwiseComponent: result.pairwiseComponent,
    })
    .from(result)
    .where(eq(result.runId, runId))
    .orderBy(desc(result.score));
  return rows;
}

export async function inspectRun(db: PanelDb, runId: string) {
  return db
    .select({
      projectId: result.projectId,
      projectName: project.name,
      trackId: result.trackId,
      placement: result.placement,
      score: result.score,
      rubricComponent: result.rubricComponent,
      pairwiseComponent: result.pairwiseComponent,
      voteCount: result.voteCount,
      comparisonCount: result.comparisonCount,
    })
    .from(result)
    .innerJoin(project, eq(project.id, result.projectId))
    .where(eq(result.runId, runId))
    .orderBy(desc(result.score));
}

export async function publishedPlacements(db: PanelDb, eventId: string) {
  const [evt] = await db
    .select({ phase: event.phase })
    .from(event)
    .where(eq(event.id, eventId));
  if (!evt) return null;
  if (evt.phase !== "published") return { published: false as const, rows: [] };
  const rows = await db
    .select({
      externalId: project.externalId,
      placement: result.placement,
      score: result.score,
      track: track.slug,
      voteCount: result.voteCount,
    })
    .from(result)
    .innerJoin(resultRun, eq(resultRun.id, result.runId))
    .innerJoin(project, eq(project.id, result.projectId))
    .innerJoin(track, eq(track.id, result.trackId))
    .where(and(eq(resultRun.eventId, eventId), isNotNull(resultRun.publishedAt)));
  return { published: true as const, rows };
}
