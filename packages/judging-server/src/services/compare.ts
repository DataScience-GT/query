import { and, desc, eq, isNull } from "drizzle-orm";
import { phaseAllows } from "@query/judging-core";
import type { PanelDb } from "@query/judging-db";
import { comparison, event, eventLog, visit } from "@query/judging-db";

/** The judge's previous table against the one they are at. */
export async function castComparison(
  db: PanelDb,
  input: {
    eventId: string;
    judgeId: string;
    outcome: "a" | "b" | "tie";
    now: Date;
  },
) {
  const [evt] = await db
    .select({ phase: event.phase })
    .from(event)
    .where(eq(event.id, input.eventId));
  if (!evt) throw new Error("Event not found");
  if (!phaseAllows(evt.phase, "vote")) {
    throw new Error(`vote is not allowed while the event is ${evt.phase}`);
  }

  const visits = await db
    .select()
    .from(visit)
    .where(
      and(
        eq(visit.eventId, input.eventId),
        eq(visit.judgeId, input.judgeId),
        isNull(visit.voidedAt),
      ),
    )
    .orderBy(desc(visit.handedOutAt));
  const current = visits.find((row) => !row.completedAt);
  const earlier = visits.find((row) => row.completedAt);
  if (!current) throw new Error("No table is in hand");
  if (!earlier) throw new Error("Compare after a finished table");

  const [row] = await db
    .insert(comparison)
    .values({
      eventId: input.eventId,
      judgeId: input.judgeId,
      judgeGroup: current.judgeGroup,
      aProjectId: earlier.projectId,
      bProjectId: current.projectId,
      outcome: input.outcome,
      createdAt: input.now,
    })
    .returning({ id: comparison.id });
  if (!row) throw new Error("Comparison was not stored");

  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "comparison.cast",
    actor: { judgeId: input.judgeId },
    subject: { comparisonId: row.id },
    payload: { outcome: input.outcome },
  });
  return { id: row.id };
}
