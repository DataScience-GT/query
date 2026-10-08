import { and, eq, inArray, sql } from "drizzle-orm";
import { hackathonProjects, hackathonResults, hackathons, judges, judgingProjects } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { publishedPlacements } from "@query/judging-server";
import { panel, panelAsPortal } from "./panel";

/**
 * Copies an edition into judging when that edition has opted in.
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
    const caller = panelAsPortal();
    for (const row of rows) {
      await caller.project.upsert({
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
    await panelAsPortal().judge.upsert({
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
  const eventId = process.env.PANEL_EVENT_ID;
  if (!eventId) return null;
  const [row] = await db
    .select({ backend: hackathons.judgingBackend })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));
  if (row?.backend !== "panel") return null;
  return { eventId };
}

export async function pullPanelResults(db: DrizzleDB, hackathonId: string) {
  const target = await panelTarget(db, hackathonId);
  if (!target) return 0;
  const body = await publishedPlacements(panel().db, target.eventId);
  if (!body) throw new Error("Panel event not found");
  if (!body.published) throw new Error("Panel results are not published");
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
  const org = process.env.PANEL_ORG_SLUG;
  const eventSlug = process.env.PANEL_EVENT_SLUG;
  if (!org || !eventSlug) return { url: null as string | null };
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
  return { url: `/judge/panel/${org}/${eventSlug}` };
}

export async function panelConsoleUrl(db: DrizzleDB, hackathonId: string) {
  const org = process.env.PANEL_ORG_SLUG;
  const eventSlug = process.env.PANEL_EVENT_SLUG;
  if (!org || !eventSlug) return { url: null as string | null };
  const [row] = await db
    .select({ backend: hackathons.judgingBackend })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));
  if (row?.backend !== "panel") return { url: null };
  return { url: `/admin/judging/panel/${org}/${eventSlug}` };
}
