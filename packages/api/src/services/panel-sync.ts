import { and, eq, inArray, sql } from "drizzle-orm";
import { hackathonProjects, hackathonResults, hackathons, judges, judgingProjects } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { judge as panelJudge } from "@query/judging-db";
import { publishedPlacements } from "@query/judging-server";
import { panel, panelAsPortal, panelEventFor } from "./panel";

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

/**
 * Mirrors a portal judge into the edition's judging event. Approval in the
 * portal is approval in judging; deactivating suspends them there.
 */
export async function syncJudgeToPanel(
  db: DrizzleDB,
  judge: { hackathonId: string; email: string | null; isActive: boolean },
) {
  try {
    if (!judge.email) return;
    const target = await panelTarget(db, judge.hackathonId);
    if (!target) return;
    await mirrorJudge(target.eventId, judge.email, judge.isActive);
  } catch {
    return;
  }
}

async function mirrorJudge(eventId: string, email: string, isActive: boolean) {
  const caller = panelAsPortal();
  // Upsert is refused once judging is closed; a judge already there can
  // still be suspended or reinstated.
  const stored = await caller.judge
    .upsert({ eventId, email, name: email, externalId: null })
    .catch(() => undefined);
  let judgeId = stored?.id;
  if (!judgeId) {
    const [row] = await panel()
      .db.select({ id: panelJudge.id })
      .from(panelJudge)
      .where(and(eq(panelJudge.eventId, eventId), eq(panelJudge.email, email.toLowerCase())));
    judgeId = row?.id;
  }
  if (!judgeId) return;
  await caller.judge.setStatus({
    eventId,
    judgeId,
    status: isActive ? "approved" : "suspended",
  });
}

/**
 * Moves an edition onto panel judging: creates its event, then copies in the
 * submitted projects and the judges the portal has approved. Switching back
 * leaves the panel event in place, so switching again resumes it.
 */
export async function setJudgingBackend(
  db: DrizzleDB,
  hackathonId: string,
  backend: "legacy" | "panel",
) {
  await db.update(hackathons).set({ judgingBackend: backend }).where(eq(hackathons.id, hackathonId));
  if (backend === "legacy") return;
  const target = await panelTarget(db, hackathonId);
  if (!target) return;
  await syncProjectsToPanel(db, hackathonId);
  const rows = await db
    .select({ email: judges.email, isActive: judges.isActive })
    .from(judges)
    .where(eq(judges.hackathonId, hackathonId));
  for (const row of rows) {
    if (row.email) await mirrorJudge(target.eventId, row.email, row.isActive);
  }
}

async function panelTarget(db: DrizzleDB, hackathonId: string) {
  const [row] = await db
    .select({ id: hackathons.id, name: hackathons.name, backend: hackathons.judgingBackend })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));
  if (row?.backend !== "panel") return null;
  return panelEventFor(row);
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
  const [row] = await db
    .select({ hackathonId: judges.hackathonId })
    .from(judges)
    .innerJoin(hackathons, eq(hackathons.id, judges.hackathonId))
    .where(
      and(
        eq(judges.userId, userId),
        eq(judges.isActive, true),
        eq(hackathons.judgingBackend, "panel"),
      ),
    );
  if (!row) return { url: null as string | null };
  return { url: `/judge/panel/${row.hackathonId}` };
}

export async function panelConsoleUrl(db: DrizzleDB, hackathonId: string) {
  const [row] = await db
    .select({ backend: hackathons.judgingBackend })
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId));
  const backend = row?.backend ?? "legacy";
  return {
    backend,
    url: backend === "panel" ? `/admin/judging/panel/${hackathonId}` : null,
  };
}
