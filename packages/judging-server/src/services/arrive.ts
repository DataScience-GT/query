import { and, eq, isNull } from "drizzle-orm";
import type { PanelDb } from "@query/judging-db";
import { event, eventLog, outbox, project, visit } from "@query/judging-db";
import { phaseAllows } from "@query/judging-core";

export async function arrive(
  db: PanelDb,
  input: {
    eventId: string;
    judgeId: string;
    qrToken?: string;
    tableNumber?: number;
    now: Date;
  },
): Promise<{ visitId: string; projectId: string }> {
  return db.transaction(async (tx) => {
    const [evt] = await tx
      .select({ phase: event.phase })
      .from(event)
      .where(eq(event.id, input.eventId));
    if (!evt) throw new Error("Event not found");
    if (!phaseAllows(evt.phase, "dispatch")) {
      throw new Error(`dispatch is not allowed while the event is ${evt.phase}`);
    }

    const [row] = await tx
      .select()
      .from(visit)
      .where(
        and(
          eq(visit.judgeId, input.judgeId),
          eq(visit.eventId, input.eventId),
          isNull(visit.completedAt),
          isNull(visit.voidedAt),
        ),
      );
    if (!row) throw new Error("No table is in hand");

    const [current] = await tx
      .select()
      .from(project)
      .where(eq(project.id, row.projectId));
    if (!current) throw new Error("Project not found");

    const qrOk = input.qrToken !== undefined && input.qrToken === current.qrToken;
    const tableOk =
      input.tableNumber !== undefined && input.tableNumber === current.tableNumber;
    if (!qrOk && !tableOk) throw new Error("That is not the table you were sent to");

    if (row.arrivedAt) return { visitId: row.id, projectId: row.projectId };

    await tx
      .update(visit)
      .set({ arrivedAt: input.now })
      .where(eq(visit.id, row.id));
    if (!current.arrivedFirstAt) {
      await tx
        .update(project)
        .set({ arrivedFirstAt: input.now })
        .where(eq(project.id, current.id));
    }
    await tx.insert(eventLog).values({
      eventId: input.eventId,
      kind: "visit.arrived",
      actor: { judgeId: input.judgeId },
      subject: { visitId: row.id, projectId: row.projectId },
      payload: {},
    });
    await tx.insert(outbox).values({
      eventId: input.eventId,
      topic: "visit.arrived",
      payload: { visitId: row.id, judgeId: input.judgeId },
    });
    return { visitId: row.id, projectId: row.projectId };
  });
}
