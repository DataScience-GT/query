import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { assignTables, phaseAllows } from "@query/judging-core";
import type { PanelDb } from "@query/judging-db";
import { event, eventLog, floorTable, judge, outbox, project, projectTrack, visit } from "@query/judging-db";

async function phaseOf(db: PanelDb, eventId: string) {
  const [row] = await db
    .select({ phase: event.phase })
    .from(event)
    .where(eq(event.id, eventId));
  if (!row) throw new Error("Event not found");
  return row.phase;
}

export async function upsertProject(
  db: PanelDb,
  input: {
    eventId: string;
    externalId: string;
    name: string;
    teamName: string | null;
    tableNumber: number | null;
    actorEmail: string;
  },
) {
  const phase = await phaseOf(db, input.eventId);
  if (phase === "archived" || phase === "published") {
    throw new Error(`submit is not allowed while the event is ${phase}`);
  }
  const [existing] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.eventId, input.eventId), eq(project.externalId, input.externalId)));

  if (existing) {
    await db
      .update(project)
      .set({
        name: input.name,
        teamName: input.teamName,
        tableNumber: input.tableNumber,
      })
      .where(eq(project.id, existing.id));
    await db.insert(eventLog).values({
      eventId: input.eventId,
      kind: "project.upserted",
      actor: { email: input.actorEmail },
      subject: { projectId: existing.id },
      payload: { externalId: input.externalId },
    });
    return { id: existing.id };
  }

  const [created] = await db
    .insert(project)
    .values({
      eventId: input.eventId,
      externalId: input.externalId,
      name: input.name,
      teamName: input.teamName,
      tableNumber: input.tableNumber,
    })
    .returning({ id: project.id });
  if (!created) throw new Error("Project was not stored");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "project.upserted",
    actor: { email: input.actorEmail },
    subject: { projectId: created.id },
    payload: { externalId: input.externalId },
  });
  return { id: created.id };
}

export async function withdrawProject(
  db: PanelDb,
  input: { eventId: string; projectId: string; now: Date; actorEmail: string },
) {
  const phase = await phaseOf(db, input.eventId);
  if (!phaseAllows(phase, "submit") && phase !== "judging_live" && phase !== "submissions_closed") {
    throw new Error(`submit is not allowed while the event is ${phase}`);
  }
  await db
    .update(project)
    .set({ withdrawnAt: input.now })
    .where(and(eq(project.id, input.projectId), eq(project.eventId, input.eventId)));
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "project.withdrawn",
    actor: { email: input.actorEmail },
    subject: { projectId: input.projectId },
    payload: {},
  });
}

export async function upsertJudge(
  db: PanelDb,
  input: {
    eventId: string;
    email: string;
    name: string;
    externalId: string | null;
    actorEmail: string;
  },
) {
  const phase = await phaseOf(db, input.eventId);
  if (!phaseAllows(phase, "apply") && phase !== "judging_live") {
    throw new Error(`apply is not allowed while the event is ${phase}`);
  }
  const email = input.email.toLowerCase();
  const [existing] = await db
    .select({ id: judge.id })
    .from(judge)
    .where(and(eq(judge.eventId, input.eventId), eq(judge.email, email)));
  if (existing) {
    await db
      .update(judge)
      .set({ name: input.name, externalId: input.externalId })
      .where(eq(judge.id, existing.id));
    return { id: existing.id };
  }
  const [created] = await db
    .insert(judge)
    .values({
      eventId: input.eventId,
      email,
      name: input.name,
      externalId: input.externalId,
      status: "invited",
    })
    .returning({ id: judge.id });
  if (!created) throw new Error("Judge was not stored");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "judge.upserted",
    actor: { email: input.actorEmail },
    subject: { judgeId: created.id },
    payload: {},
  });
  return { id: created.id };
}

export async function applyAsJudge(
  db: PanelDb,
  input: { eventId: string; email: string; name: string },
) {
  const phase = await phaseOf(db, input.eventId);
  if (!phaseAllows(phase, "apply")) {
    throw new Error(`apply is not allowed while the event is ${phase}`);
  }
  const email = input.email.toLowerCase();
  const [existing] = await db
    .select({ id: judge.id, status: judge.status })
    .from(judge)
    .where(and(eq(judge.eventId, input.eventId), eq(judge.email, email)));
  if (existing) {
    if (existing.status === "invited") {
      await db.update(judge).set({ status: "applied", name: input.name }).where(eq(judge.id, existing.id));
    }
    await db.insert(eventLog).values({
      eventId: input.eventId,
      kind: "judge.upserted",
      actor: { email },
      subject: { judgeId: existing.id },
      payload: { status: existing.status === "invited" ? "applied" : existing.status },
    });
    return { id: existing.id, status: existing.status === "invited" ? "applied" : existing.status };
  }
  const [created] = await db
    .insert(judge)
    .values({
      eventId: input.eventId,
      email,
      name: input.name,
      status: "applied",
    })
    .returning({ id: judge.id });
  if (!created) throw new Error("Judge was not stored");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "judge.upserted",
    actor: { email },
    subject: { judgeId: created.id },
    payload: { status: "applied" },
  });
  return { id: created.id, status: "applied" as const };
}

export async function setJudgeStatus(
  db: PanelDb,
  input: {
    eventId: string;
    judgeId: string;
    status: "approved" | "suspended";
    actorEmail: string;
  },
) {
  await db
    .update(judge)
    .set({ status: input.status })
    .where(and(eq(judge.id, input.judgeId), eq(judge.eventId, input.eventId)));
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: input.status === "approved" ? "judge.approved" : "judge.suspended",
    actor: { email: input.actorEmail },
    subject: { judgeId: input.judgeId },
    payload: { status: input.status },
  });
}

export async function voidVisit(
  db: PanelDb,
  input: { eventId: string; visitId: string; now: Date; actorEmail: string; reason: string },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: visit.id, judgeId: visit.judgeId })
      .from(visit)
      .where(and(eq(visit.id, input.visitId), eq(visit.eventId, input.eventId), isNull(visit.voidedAt)));
    if (!row) throw new Error("Visit not found");
    await tx
      .update(visit)
      .set({ voidedAt: input.now, voidReason: input.reason })
      .where(eq(visit.id, row.id));
    await tx.insert(eventLog).values({
      eventId: input.eventId,
      kind: "visit.voided",
      actor: { email: input.actorEmail },
      subject: { visitId: row.id },
      payload: { reason: input.reason },
    });
    await tx.insert(outbox).values({
      eventId: input.eventId,
      topic: "visit.voided",
      payload: { visitId: row.id, judgeId: row.judgeId },
    });
    return { judgeId: row.judgeId };
  });
}

export async function recallJudge(
  db: PanelDb,
  input: { eventId: string; judgeId: string; actorEmail: string },
) {
  await db.transaction(async (tx) => {
    await tx.insert(eventLog).values({
      eventId: input.eventId,
      kind: "judge.recalled",
      actor: { email: input.actorEmail },
      subject: { judgeId: input.judgeId },
      payload: {},
    });
    await tx.insert(outbox).values({
      eventId: input.eventId,
      topic: "judge.recalled",
      payload: { judgeId: input.judgeId },
    });
  });
}

export async function assignJudge(
  db: PanelDb,
  input: {
    eventId: string;
    judgeId: string;
    trackId: string | null;
    zoneId: string | null;
    actorEmail: string;
  },
) {
  const [row] = await db
    .update(judge)
    .set({ trackId: input.trackId, zoneId: input.zoneId })
    .where(and(eq(judge.id, input.judgeId), eq(judge.eventId, input.eventId)))
    .returning({ id: judge.id });
  if (!row) throw new Error("Judge not found");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "judge.upserted",
    actor: { email: input.actorEmail },
    subject: { judgeId: input.judgeId },
    payload: { trackId: input.trackId, zoneId: input.zoneId },
  });
  return { id: row.id };
}

export async function assignProjectTrack(
  db: PanelDb,
  input: { projectId: string; trackId: string },
) {
  await db
    .insert(projectTrack)
    .values(input)
    .onConflictDoNothing();
}

export async function rotateQr(
  db: PanelDb,
  input: { eventId: string; projectId: string; actorEmail: string },
) {
  const token = randomUUID();
  const [row] = await db
    .update(project)
    .set({ qrToken: token })
    .where(and(eq(project.id, input.projectId), eq(project.eventId, input.eventId)))
    .returning({ qrToken: project.qrToken });
  if (!row) throw new Error("Project not found");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "project.qr_rotated",
    actor: { email: input.actorEmail },
    subject: { projectId: input.projectId },
    payload: {},
  });
  return { qrToken: row.qrToken };
}

export async function assignEventTables(
  db: PanelDb,
  input: { eventId: string; actorEmail: string },
) {
  const projects = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.eventId, input.eventId), isNull(project.withdrawnAt)));
  const links = await db
    .select({ projectId: projectTrack.projectId, trackId: projectTrack.trackId })
    .from(projectTrack)
    .innerJoin(project, eq(project.id, projectTrack.projectId))
    .where(eq(project.eventId, input.eventId));
  const trackOf = new Map<string, string>();
  for (const link of links) {
    if (!trackOf.has(link.projectId)) trackOf.set(link.projectId, link.trackId);
  }
  const tables = await db
    .select({ number: floorTable.number, zoneId: floorTable.zoneId })
    .from(floorTable)
    .where(eq(floorTable.eventId, input.eventId));
  const seated = assignTables(
    projects.map((row) => ({ id: row.id, trackId: trackOf.get(row.id) ?? null })),
    tables.map((row) => ({ number: row.number, zoneId: row.zoneId })),
  );
  for (const seat of seated) {
    await db
      .update(project)
      .set({ tableNumber: seat.tableNumber, zoneId: seat.zoneId })
      .where(eq(project.id, seat.projectId));
  }
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "project.table_assigned",
    actor: { email: input.actorEmail },
    subject: { eventId: input.eventId },
    payload: { assigned: seated.length },
  });
  return { assigned: seated.length };
}
