import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { PanelDb } from "@panel/db";
import {
  apiKey,
  criterion,
  event,
  eventConfig,
  eventLog,
  floorTable,
  judge,
  organization,
  prize,
  project,
  projectTrack,
  result,
  resultRun,
  rubric,
  track,
  vote,
  voteScore,
  webhook,
  zone,
} from "@panel/db";
import { randomBytes } from "node:crypto";
import type { Actor } from "../auth";
import { hashApiKey, roleForScopes } from "../auth";
import { feedbackStatus, median } from "./feedback";

async function placementsForProject(db: PanelDb, projectId: string) {
  const links = await db
    .select({ trackId: track.id, track: track.name })
    .from(projectTrack)
    .innerJoin(track, eq(track.id, projectTrack.trackId))
    .where(eq(projectTrack.projectId, projectId));
  const placed = await db
    .select({ trackId: result.trackId, placement: result.placement })
    .from(result)
    .innerJoin(resultRun, eq(resultRun.id, result.runId))
    .where(and(eq(result.projectId, projectId), isNotNull(resultRun.publishedAt)));
  const placeOf = new Map(placed.map((row) => [row.trackId, row.placement]));
  return links.map((link) => ({
    track: link.track,
    placement: placeOf.get(link.trackId) ?? null,
  }));
}

/** The published card token for a project the club already knows by id. */
export async function feedbackTokenForExternal(db: PanelDb, eventId: string, externalId: string) {
  const [row] = await db
    .select({ token: project.feedbackToken, phase: event.phase })
    .from(project)
    .innerJoin(event, eq(event.id, project.eventId))
    .where(and(eq(project.eventId, eventId), eq(project.externalId, externalId)));
  if (!row?.token || row.phase !== "published") return null;
  return row.token;
}

export async function feedbackCard(db: PanelDb, token: string) {
  const [row] = await db
    .select({
      projectId: project.id,
      name: project.name,
      eventId: project.eventId,
      phase: event.phase,
      stored: project.feedbackToken,
    })
    .from(project)
    .innerJoin(event, eq(event.id, project.eventId))
    .where(eq(project.feedbackToken, token));
  if (
    feedbackStatus({
      published: row?.phase === "published",
      tokenMatches: row?.stored === token,
    }) === "forbidden" ||
    !row
  ) {
    return { status: "forbidden" as const };
  }

  const scores = await db
    .select({
      projectId: vote.projectId,
      criterionId: voteScore.criterionId,
      label: criterion.label,
      value: voteScore.value,
    })
    .from(voteScore)
    .innerJoin(vote, eq(vote.id, voteScore.voteId))
    .innerJoin(criterion, eq(criterion.id, voteScore.criterionId))
    .where(eq(vote.eventId, row.eventId));

  const byCriterion = new Map<string, { label: string; mine: number[]; all: number[] }>();
  for (const score of scores) {
    const bucket = byCriterion.get(score.criterionId) ?? {
      label: score.label,
      mine: [],
      all: [],
    };
    bucket.all.push(score.value);
    if (score.projectId === row.projectId) bucket.mine.push(score.value);
    byCriterion.set(score.criterionId, bucket);
  }

  return {
    status: "ok" as const,
    name: row.name,
    criteria: [...byCriterion.values()].map((bucket) => ({
      label: bucket.label,
      mean:
        bucket.mine.length === 0
          ? 0
          : bucket.mine.reduce((sum, value) => sum + value, 0) / bucket.mine.length,
      median: median(bucket.all),
    })),
    places: await placementsForProject(db, row.projectId),
    comments: (
      await db
        .select({ comment: vote.comment })
        .from(vote)
        .where(and(eq(vote.projectId, row.projectId), isNotNull(vote.comment)))
    )
      .map((item) => item.comment)
      .filter((comment): comment is string => Boolean(comment)),
  };
}

export async function saveTrack(
  db: PanelDb,
  input: {
    eventId: string;
    slug: string;
    name: string;
    kind: "main" | "sponsor" | "special";
    judgeGroup: string;
    actorEmail: string;
  },
) {
  const [created] = await db
    .insert(track)
    .values(input)
    .returning({ id: track.id });
  if (!created) throw new Error("Track was not stored");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "track.saved",
    actor: { email: input.actorEmail },
    subject: { trackId: created.id },
    payload: { slug: input.slug },
  });
  return created;
}

export async function listTracks(db: PanelDb, eventId: string) {
  return db.select().from(track).where(eq(track.eventId, eventId));
}

export async function savePrize(
  db: PanelDb,
  input: {
    trackId: string;
    place: number;
    title: string;
    amount: number | null;
    actorEmail: string;
  },
) {
  const [created] = await db
    .insert(prize)
    .values({
      trackId: input.trackId,
      place: input.place,
      title: input.title,
      amount: input.amount,
    })
    .returning({ id: prize.id });
  if (!created) throw new Error("Prize was not stored");
  const [owner] = await db
    .select({ eventId: track.eventId })
    .from(track)
    .where(eq(track.id, input.trackId));
  if (owner) {
    await db.insert(eventLog).values({
      eventId: owner.eventId,
      kind: "prize.saved",
      actor: { email: input.actorEmail },
      subject: { prizeId: created.id, trackId: input.trackId },
      payload: { title: input.title, place: input.place },
    });
  }
  return created;
}

export async function saveZone(
  db: PanelDb,
  input: { eventId: string; name: string; position: number; actorEmail: string },
) {
  const [created] = await db
    .insert(zone)
    .values({ eventId: input.eventId, name: input.name, position: input.position })
    .returning({ id: zone.id });
  if (!created) throw new Error("Zone was not stored");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "zone.saved",
    actor: { email: input.actorEmail },
    subject: { zoneId: created.id },
    payload: { name: input.name },
  });
  return created;
}

export async function placeTable(
  db: PanelDb,
  input: {
    eventId: string;
    number: number;
    zoneId: string | null;
    x: number | null;
    y: number | null;
    actorEmail: string;
  },
) {
  await db
    .insert(floorTable)
    .values(input)
    .onConflictDoUpdate({
      target: [floorTable.eventId, floorTable.number],
      set: { zoneId: input.zoneId, x: input.x, y: input.y },
    });
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "table.placed",
    actor: { email: input.actorEmail },
    subject: { number: input.number },
    payload: { x: input.x, y: input.y },
  });
}

export async function saveRubric(
  db: PanelDb,
  input: {
    eventId: string;
    name: string;
    isDefault: boolean;
    criteria: { key: string; label: string; min: number; max: number; weight: number }[];
    actorEmail: string;
  },
) {
  const [created] = await db
    .insert(rubric)
    .values({
      eventId: input.eventId,
      name: input.name,
      isDefault: input.isDefault,
    })
    .returning({ id: rubric.id });
  if (!created) throw new Error("Rubric was not stored");
  if (input.criteria.length > 0) {
    await db.insert(criterion).values(
      input.criteria.map((item, position) => ({
        rubricId: created.id,
        position,
        key: item.key,
        label: item.label,
        min: item.min,
        max: item.max,
        weight: item.weight,
      })),
    );
  }
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "rubric.saved",
    actor: { email: input.actorEmail },
    subject: { rubricId: created.id },
    payload: {},
  });
  return created;
}

export async function saveWebhook(
  db: PanelDb,
  input: {
    eventId: string;
    url: string;
    secret: string;
    topics: string[];
    actorEmail: string;
  },
) {
  const [evt] = await db
    .select({ orgId: event.orgId })
    .from(event)
    .where(eq(event.id, input.eventId));
  if (!evt) throw new Error("Event not found");
  const [created] = await db
    .insert(webhook)
    .values({
      orgId: evt.orgId,
      url: input.url,
      secret: input.secret,
      topics: input.topics,
    })
    .returning({ id: webhook.id });
  if (!created) throw new Error("Webhook was not stored");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "webhook.saved",
    actor: { email: input.actorEmail },
    subject: { webhookId: created.id },
    payload: { url: input.url },
  });
  return created;
}

export async function issueApiKey(
  db: PanelDb,
  input: { eventId: string; scopes: string[]; actorEmail: string },
) {
  const [evt] = await db
    .select({ orgId: organization.id })
    .from(event)
    .innerJoin(organization, eq(organization.id, event.orgId))
    .where(eq(event.id, input.eventId));
  if (!evt) throw new Error("Event not found");
  const token = randomBytes(24).toString("hex");
  const [created] = await db
    .insert(apiKey)
    .values({
      orgId: evt.orgId,
      hashedKey: hashApiKey(token),
      scopes: input.scopes,
    })
    .returning({ id: apiKey.id });
  if (!created) throw new Error("API key was not stored");
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "api_key.created",
    actor: { email: input.actorEmail },
    subject: { apiKeyId: created.id },
    payload: {},
  });
  return { id: created.id, token };
}

export async function actorForApiKey(db: PanelDb, token: string): Promise<Actor | null> {
  const [row] = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.hashedKey, hashApiKey(token)), isNull(apiKey.revokedAt)));
  if (!row) return null;
  const granted = roleForScopes(row.scopes);
  if (!granted) return null;
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, row.orgId));
  if (!org) return null;
  return {
    sub: row.id,
    email: `key:${row.id}`,
    name: "API key",
    org: org.slug,
    role: granted,
    judgeExternalId: null,
  };
}

export async function listTables(db: PanelDb, eventId: string) {
  return db
    .select({
      number: floorTable.number,
      zoneId: floorTable.zoneId,
      x: floorTable.x,
      y: floorTable.y,
    })
    .from(floorTable)
    .where(eq(floorTable.eventId, eventId));
}

export async function listJudges(db: PanelDb, eventId: string) {
  return db
    .select({
      id: judge.id,
      name: judge.name,
      email: judge.email,
      status: judge.status,
    })
    .from(judge)
    .where(eq(judge.eventId, eventId));
}

export async function listProjects(db: PanelDb, eventId: string) {
  return db
    .select({
      id: project.id,
      name: project.name,
      tableNumber: project.tableNumber,
      zoneId: project.zoneId,
      zoneName: zone.name,
    })
    .from(project)
    .leftJoin(zone, eq(zone.id, project.zoneId))
    .where(eq(project.eventId, eventId));
}

export async function listLogs(db: PanelDb, eventId: string) {
  return db
    .select({
      id: eventLog.id,
      kind: eventLog.kind,
      createdAt: eventLog.createdAt,
    })
    .from(eventLog)
    .where(eq(eventLog.eventId, eventId))
    .orderBy(desc(eventLog.createdAt))
    .limit(40);
}

export async function saveConfig(
  db: PanelDb,
  input: {
    eventId: string;
    hardLimitSeconds: number;
    dispatchStrategy: "coverage" | "uncertainty";
    pairwiseEnabled: boolean;
    pairwiseWeight: number;
    leaderboardPublic: boolean;
    boardPollSeconds: number;
    actorEmail: string;
  },
) {
  await db
    .update(eventConfig)
    .set({
      hardLimitSeconds: input.hardLimitSeconds,
      dispatchStrategy: input.dispatchStrategy,
      pairwiseEnabled: input.pairwiseEnabled,
      pairwiseWeight: input.pairwiseWeight,
      leaderboardPublic: input.leaderboardPublic,
      boardPollSeconds: input.boardPollSeconds,
    })
    .where(eq(eventConfig.eventId, input.eventId));
  await db.insert(eventLog).values({
    eventId: input.eventId,
    kind: "config.saved",
    actor: { email: input.actorEmail },
    subject: { eventId: input.eventId },
    payload: {
      dispatchStrategy: input.dispatchStrategy,
      hardLimitSeconds: input.hardLimitSeconds,
    },
  });
}
