import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { isOverTarget } from "@panel/core";
import type { TimerConfig } from "@panel/core";
import type { PanelDb } from "@panel/db";
import { eventConfig, visit } from "@panel/db";

export type OpenVisit = {
  visitId: string;
  eventId: string;
  judgeId: string;
  arrivedAt: Date | null;
  config: TimerConfig;
};

/** Visits where the judge has arrived and is past the target time. */
export function visitsOverTarget(rows: readonly OpenVisit[], now: Date): OpenVisit[] {
  return rows.filter(
    (row) => row.arrivedAt !== null && isOverTarget(row.arrivedAt, now, row.config),
  );
}

export async function loadOpenVisits(db: PanelDb): Promise<OpenVisit[]> {
  const rows = await db
    .select({
      visitId: visit.id,
      eventId: visit.eventId,
      judgeId: visit.judgeId,
      arrivedAt: visit.arrivedAt,
      targetSeconds: eventConfig.targetSeconds,
      hardLimitSeconds: eventConfig.hardLimitSeconds,
      walkLimitSeconds: eventConfig.walkLimitSeconds,
      submitGraceSeconds: eventConfig.submitGraceSeconds,
    })
    .from(visit)
    .innerJoin(eventConfig, eq(eventConfig.eventId, visit.eventId))
    .where(and(isNull(visit.completedAt), isNull(visit.voidedAt), isNotNull(visit.arrivedAt)));
  return rows.map((row) => ({
    visitId: row.visitId,
    eventId: row.eventId,
    judgeId: row.judgeId,
    arrivedAt: row.arrivedAt,
    config: {
      targetSeconds: row.targetSeconds,
      hardLimitSeconds: row.hardLimitSeconds,
      walkLimitSeconds: row.walkLimitSeconds,
      submitGraceSeconds: row.submitGraceSeconds,
    },
  }));
}
