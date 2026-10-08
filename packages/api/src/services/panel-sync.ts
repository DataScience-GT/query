import { and, eq, inArray, sql } from "drizzle-orm";
import { hackathonProjects, hackathonResults, hackathons, judges, judgingProjects } from "@query/db";
import { createHmac } from "node:crypto";
import type { DrizzleDB } from "@query/db";

/**
 * Copies an edition into the panel service when that edition has opted in.
 * A failure here does not undo the club write. The portal stays the source
 * of registration, and the same action can be run again.
 */
export async function syncProjectsToPanel(db: DrizzleDB, hackathonId: string) {
  try {
    const target = await panelTarget(db, hackathonId);
    if (!target) return;
    const rows = await db
      .select({
        id: hackathonProjects.id,
        name: hackathonProjects.name,
      })
      .from(hackathonProjects)
      .where(
        and(
          eq(hackathonProjects.hackathonId, hackathonId),
          inArray(hackathonProjects.status, ["submitted", "judging"]),
        ),
      );
    for (const row of rows) {
      await post(target, "project.upsert", {
        eventId: target.eventId,
        externalId: row.id,
        name: row.name,
        teamName: null,
        tableNumber: null,
      });
    }
  } catch {
    return;
  }
}

export async function syncJudgeToPanel(
  db: DrizzleDB,
  judge: { hackathonId: string; email: string | null },
) {
  try {
    if (!judge.email) return;
    const target = await panelTarget(db, judge.hackathonId);
    if (!target) return;
    await post(target, "judge.upsert", {
      eventId: target.eventId,
      email: judge.email,
      name: judge.email,
      externalId: null,
    });
  } catch {
    return;
  }
}

async function panelTarget(db: DrizzleDB, hackathonId: string) {
  const url = process.env.PANEL_URL;
  const token = process.env.PANEL_SERVICE_TOKEN;
  const eventId = process.env.PANEL_EVENT_ID;
  if (!url || !token || !eventId) return null;
  const [row] = await db
    .select({ backend: hackathons.judgingBackend })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));
  if (row?.backend !== "panel") return null;
  return { url, token, eventId };
}

async function post(
  target: { url: string; token: string },
  procedure: string,
  body: unknown,
) {
  const response = await fetch(`${target.url.replace(/\/$/, "")}/trpc/${procedure}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${target.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`panel ${procedure} returned ${response.status}`);
  }
}

export async function pullPanelResults(db: DrizzleDB, hackathonId: string) {
  const target = await panelTarget(db, hackathonId);
  if (!target) return 0;
  const response = await fetch(
    `${target.url.replace(/\/$/, "")}/v1/results/${target.eventId}`,
    { headers: { authorization: `Bearer ${target.token}` } },
  );
  if (response.status === 403) throw new Error("Panel results are not published");
  if (!response.ok) throw new Error(`panel results returned ${response.status}`);
  const body = (await response.json()) as {
    rows: {
      externalId: string | null;
      placement: number | null;
      score: number;
      track: string;
      voteCount: number;
    }[];
  };
  const judging = await db
    .select({ id: judgingProjects.id, sourceProjectId: judgingProjects.sourceProjectId })
    .from(judgingProjects)
    .where(eq(judgingProjects.hackathonId, hackathonId));
  const bySource = new Map(
    judging.flatMap((row) =>
      row.sourceProjectId ? [[row.sourceProjectId, row.id] as const] : [],
    ),
  );
  let written = 0;
  for (const row of body.rows) {
    if (!row.externalId || row.placement === null) continue;
    const projectId = bySource.get(row.externalId);
    if (!projectId) continue;
    await db
      .insert(hackathonResults)
      .values({
        hackathonId,
        projectId,
        sourceProjectId: row.externalId,
        track: row.track || "overall",
        placement: row.placement,
        weightedScore: row.score.toFixed(2),
        voteCount: row.voteCount,
      })
      .onConflictDoUpdate({
        target: [
          hackathonResults.hackathonId,
          hackathonResults.projectId,
          hackathonResults.track,
        ],
        set: {
          placement: sql`excluded.placement`,
          weightedScore: sql`excluded.weighted_score`,
          voteCount: sql`excluded.vote_count`,
          sourceProjectId: row.externalId,
        },
      });
    written += 1;
  }
  return written;
}

export async function panelDeskUrl(db: DrizzleDB, userId: string) {
  const web = process.env.PANEL_WEB_URL;
  const secret = process.env.PANEL_JWT_SECRET;
  const org = process.env.PANEL_ORG_SLUG;
  const eventSlug = process.env.PANEL_EVENT_SLUG;
  if (!web || !secret || !org || !eventSlug) return { url: null as string | null };
  const [row] = await db
    .select({ email: judges.email })
    .from(judges)
    .innerJoin(hackathons, eq(hackathons.id, judges.hackathonId))
    .where(
      and(
        eq(judges.userId, userId),
        eq(judges.isActive, true),
        eq(hackathons.judgingBackend, "panel"),
      ),
    );
  if (!row?.email) return { url: null };
  const now = Math.floor(Date.now() / 1000);
  const ticket = signHs256(
    {
      sub: userId,
      email: row.email,
      name: row.email,
      org,
      role: null,
      judge_external_id: null,
      iat: now,
      exp: now + 60 * 30,
    },
    secret,
  );
  const url = `${web.replace(/\/$/, "")}/j/${org}/${eventSlug}?ticket=${encodeURIComponent(ticket)}`;
  return { url };
}

export async function panelConsoleUrl(
  db: DrizzleDB,
  input: { hackathonId: string; userId: string; email: string; name: string },
) {
  const web = process.env.PANEL_WEB_URL;
  const secret = process.env.PANEL_JWT_SECRET;
  const org = process.env.PANEL_ORG_SLUG;
  const eventSlug = process.env.PANEL_EVENT_SLUG;
  if (!web || !secret || !org || !eventSlug) return { url: null as string | null };
  const [row] = await db
    .select({ backend: hackathons.judgingBackend })
    .from(hackathons)
    .where(eq(hackathons.id, input.hackathonId));
  if (row?.backend !== "panel") return { url: null };
  const now = Math.floor(Date.now() / 1000);
  const ticket = signHs256(
    {
      sub: input.userId,
      email: input.email,
      name: input.name,
      org,
      role: "organizer",
      judge_external_id: null,
      iat: now,
      exp: now + 60 * 30,
    },
    secret,
  );
  const url = `${web.replace(/\/$/, "")}/o/${org}/${eventSlug}?ticket=${encodeURIComponent(ticket)}`;
  return { url };
}

function signHs256(payload: Record<string, unknown>, secret: string) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}
