import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { PanelDb } from "@panel/db";
import { event, eventConfig, judge, organization, prize, project, result, resultRun, track, visit, vote } from "@panel/db";

export async function liveSnapshot(db: PanelDb, orgSlug: string, eventSlug: string) {
  const [row] = await db
    .select({
      eventId: event.id,
      phase: event.phase,
      name: event.name,
      leaderboardPublic: eventConfig.leaderboardPublic,
      pollSeconds: eventConfig.boardPollSeconds,
    })
    .from(event)
    .innerJoin(organization, eq(organization.id, event.orgId))
    .innerJoin(eventConfig, eq(eventConfig.eventId, event.id))
    .where(and(eq(organization.slug, orgSlug), eq(event.slug, eventSlug)));
  if (!row) return null;

  const prizes = await db
    .select({
      title: prize.title,
      place: prize.place,
      amount: prize.amount,
      track: track.name,
    })
    .from(prize)
    .innerJoin(track, eq(track.id, prize.trackId))
    .where(eq(track.eventId, row.eventId))
    .orderBy(track.position, prize.place);

  const published = row.phase === "published";
  const showFloor = published || row.leaderboardPublic;
  if (!showFloor) {
    return {
      eventId: row.eventId,
      name: row.name,
      phase: row.phase,
      pollSeconds: row.pollSeconds,
      projects: [],
      placements: [],
      prizes,
    };
  }

  const projects = await db
    .select({
      id: project.id,
      name: project.name,
      tableNumber: project.tableNumber,
    })
    .from(project)
    .where(and(eq(project.eventId, row.eventId), isNull(project.withdrawnAt)));

  const looks = await db
    .select({
      projectId: vote.projectId,
      count: sql<number>`count(*)::int`,
    })
    .from(vote)
    .where(eq(vote.eventId, row.eventId))
    .groupBy(vote.projectId);
  const lookOf = new Map(looks.map((item) => [item.projectId, item.count]));

  const open = await db
    .select({ judgeId: visit.judgeId, projectId: visit.projectId, arrivedAt: visit.arrivedAt })
    .from(visit)
    .where(
      and(eq(visit.eventId, row.eventId), isNull(visit.completedAt), isNull(visit.voidedAt)),
    );
  const judges = await db
    .select({ id: judge.id, name: judge.name })
    .from(judge)
    .where(eq(judge.eventId, row.eventId));
  const nameOf = new Map(judges.map((item) => [item.id, item.name]));

  let placements: {
    projectId: string;
    projectName: string;
    trackId: string;
    placement: number | null;
  }[] = [];
  if (published) {
    const [run] = await db
      .select({ id: resultRun.id })
      .from(resultRun)
      .where(and(eq(resultRun.eventId, row.eventId), isNotNull(resultRun.publishedAt)));
    if (run) {
      placements = await db
        .select({
          projectId: result.projectId,
          projectName: project.name,
          trackId: result.trackId,
          placement: result.placement,
        })
        .from(result)
        .innerJoin(project, eq(project.id, result.projectId))
        .where(eq(result.runId, run.id));
    }
  }

  return {
    eventId: row.eventId,
    name: row.name,
    phase: row.phase,
    pollSeconds: row.pollSeconds,
    projects: projects.map((item) => ({
      id: item.id,
      name: published ? item.name : null,
      tableNumber: item.tableNumber,
      looks: lookOf.get(item.id) ?? 0,
    })),
    floor: open.map((item) => ({
      judgeId: item.judgeId,
      judgeName: nameOf.get(item.judgeId) ?? "",
      projectId: item.projectId,
      arrived: item.arrivedAt !== null,
    })),
    placements,
    prizes,
  };
}
