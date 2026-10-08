import { and, eq, isNull, sql } from "drizzle-orm";
import { isOverTarget } from "@panel/core";
import type { TimerConfig } from "@panel/core";
import type { PanelDb } from "@panel/db";
import { eventConfig, judge, project, visit, vote } from "@panel/db";

export type FloorState = "idle" | "walking" | "at table";

export function judgeFloorState(
  open: { arrivedAt: Date | null } | null,
  now: Date,
  config: TimerConfig,
): { state: FloorState; overtime: boolean } {
  if (!open) return { state: "idle", overtime: false };
  if (!open.arrivedAt) return { state: "walking", overtime: false };
  return {
    state: "at table",
    overtime: isOverTarget(open.arrivedAt, now, config),
  };
}

export async function organizerFloor(db: PanelDb, eventId: string, now: Date) {
  const [config] = await db
    .select({
      targetSeconds: eventConfig.targetSeconds,
      hardLimitSeconds: eventConfig.hardLimitSeconds,
      walkLimitSeconds: eventConfig.walkLimitSeconds,
      submitGraceSeconds: eventConfig.submitGraceSeconds,
    })
    .from(eventConfig)
    .where(eq(eventConfig.eventId, eventId));
  if (!config) return null;

  const projects = await db
    .select({ id: project.id, tableNumber: project.tableNumber })
    .from(project)
    .where(and(eq(project.eventId, eventId), isNull(project.withdrawnAt)));
  const looks = await db
    .select({ projectId: vote.projectId, count: sql<number>`count(*)::int` })
    .from(vote)
    .where(eq(vote.eventId, eventId))
    .groupBy(vote.projectId);
  const lookOf = new Map(looks.map((item) => [item.projectId, item.count]));

  const open = await db
    .select({
      judgeId: visit.judgeId,
      arrivedAt: visit.arrivedAt,
      tableNumber: project.tableNumber,
    })
    .from(visit)
    .innerJoin(project, eq(project.id, visit.projectId))
    .where(and(eq(visit.eventId, eventId), isNull(visit.completedAt), isNull(visit.voidedAt)));
  const openOf = new Map(open.map((item) => [item.judgeId, item]));

  const people = await db
    .select({ id: judge.id, name: judge.name })
    .from(judge)
    .where(and(eq(judge.eventId, eventId), eq(judge.status, "approved")));

  return {
    tables: projects
      .map((item) => ({
        tableNumber: item.tableNumber,
        looks: lookOf.get(item.id) ?? 0,
      }))
      .sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0)),
    judges: people.map((person) => {
      const current = openOf.get(person.id) ?? null;
      const state = judgeFloorState(current, now, config);
      return {
        name: person.name,
        state: state.state,
        overtime: state.overtime,
        tableNumber: current?.tableNumber ?? null,
      };
    }),
  };
}
