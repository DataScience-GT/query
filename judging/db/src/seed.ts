import { eq, sql } from "drizzle-orm";
import { DEFAULT_TIMERS } from "@panel/core";
import type { PanelDb, PanelTx } from "./client";
import {
  criterion,
  event,
  eventConfig,
  floorTable,
  judge,
  membership,
  organization,
  prize,
  project,
  projectTrack,
  rubric,
  track,
  user,
  zone,
} from "./schema";

const CRITERIA = [
  ["creativity", "Creativity"],
  ["impact", "Impact"],
  ["scope", "Scope"],
  ["clarity", "Clarity"],
  ["soundness", "Soundness"],
] as const;

/**
 * One event a self-hoster can click through: 40 projects, 6 judges, three
 * tracks, and a second rubric on the sponsor track. Re-running replaces the
 * demo organization.
 */
export async function seedDemo(db: PanelDb): Promise<{ eventId: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('panel:seed:demo'))`);
    return insertDemo(tx);
  });
}

async function insertDemo(db: PanelTx): Promise<{ eventId: string }> {
  const existing = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, "demo"));
  const previous = existing[0];
  if (previous) {
    await db.delete(organization).where(eq(organization.id, previous.id));
  }

  const [org] = await db
    .insert(organization)
    .values({
      slug: "demo",
      name: "Demo",
      branding: { tagline: "A practice floor" },
    })
    .returning({ id: organization.id });
  if (!org) throw new Error("demo organization was not created");

  await db.delete(user).where(eq(user.email, "organizer@demo.panel"));
  const [organizer] = await db
    .insert(user)
    .values({ email: "organizer@demo.panel", name: "Demo organizer" })
    .returning({ id: user.id });
  if (!organizer) throw new Error("demo organizer was not created");

  await db.insert(membership).values({
    userId: organizer.id,
    orgId: org.id,
    role: "owner",
  });

  const [demoEvent] = await db
    .insert(event)
    .values({
      orgId: org.id,
      slug: "demo",
      name: "Demo",
      phase: "judging_live",
    })
    .returning({ id: event.id });
  if (!demoEvent) throw new Error("demo event was not created");

  await db.insert(eventConfig).values({
    eventId: demoEvent.id,
    targetSeconds: DEFAULT_TIMERS.targetSeconds,
    hardLimitSeconds: DEFAULT_TIMERS.hardLimitSeconds,
    walkLimitSeconds: DEFAULT_TIMERS.walkLimitSeconds,
    submitGraceSeconds: DEFAULT_TIMERS.submitGraceSeconds,
    minLooksPerProject: 1,
    dispatchStrategy: "coverage",
    pairwiseEnabled: false,
    pairwiseWeight: 0,
    bayesianC: 2,
    calibrationLooks: 0,
    calibrationWeight: 1,
    feedbackCardsEnabled: false,
    leaderboardPublic: false,
    boardPollSeconds: 5,
  });

  const [mainRubric] = await db
    .insert(rubric)
    .values({ eventId: demoEvent.id, name: "Main", isDefault: true })
    .returning({ id: rubric.id });
  const [sponsorRubric] = await db
    .insert(rubric)
    .values({ eventId: demoEvent.id, name: "Sponsor", isDefault: false })
    .returning({ id: rubric.id });
  if (!mainRubric || !sponsorRubric) throw new Error("demo rubrics were not created");

  await db.insert(criterion).values(
    CRITERIA.map(([key, label], position) => ({
      rubricId: mainRubric.id,
      position,
      key,
      label,
      min: 0,
      max: 10,
      weight: 1,
    })),
  );
  await db.insert(criterion).values([
    {
      rubricId: sponsorRubric.id,
      position: 0,
      key: "fit",
      label: "Fit",
      min: 0,
      max: 10,
      weight: 1,
    },
    {
      rubricId: sponsorRubric.id,
      position: 1,
      key: "execution",
      label: "Execution",
      min: 0,
      max: 10,
      weight: 1,
    },
  ]);

  const tracks = await db
    .insert(track)
    .values([
      {
        eventId: demoEvent.id,
        slug: "general",
        name: "General",
        kind: "main" as const,
        judgeGroup: "main",
        rubricId: mainRubric.id,
        position: 0,
      },
      {
        eventId: demoEvent.id,
        slug: "sponsor",
        name: "Sponsor",
        kind: "sponsor" as const,
        judgeGroup: "sponsor",
        rubricId: sponsorRubric.id,
        position: 1,
      },
      {
        eventId: demoEvent.id,
        slug: "beginner",
        name: "Beginner",
        kind: "special" as const,
        judgeGroup: "beginner",
        rubricId: mainRubric.id,
        position: 2,
      },
    ])
    .returning({ id: track.id, slug: track.slug });

  const general = tracks.find((item) => item.slug === "general");
  const sponsor = tracks.find((item) => item.slug === "sponsor");
  const beginner = tracks.find((item) => item.slug === "beginner");
  if (!general || !sponsor || !beginner) throw new Error("demo tracks were not created");

  await db.insert(prize).values([
    { trackId: general.id, place: 1, title: "First", amount: 1000 },
    { trackId: sponsor.id, place: 1, title: "Sponsor prize", amount: 500 },
  ]);

  const [hall] = await db
    .insert(zone)
    .values({ eventId: demoEvent.id, name: "Hall", position: 0 })
    .returning({ id: zone.id });
  if (!hall) throw new Error("demo zone was not created");

  await db.insert(floorTable).values(
    Array.from({ length: 40 }, (_, index) => ({
      eventId: demoEvent.id,
      number: index + 1,
      zoneId: hall.id,
    })),
  );

  const projects = await db
    .insert(project)
    .values(
      Array.from({ length: 40 }, (_, index) => ({
        eventId: demoEvent.id,
        name: `Project ${index + 1}`,
        teamName: `Team ${index + 1}`,
        tableNumber: index + 1,
        zoneId: hall.id,
      })),
    )
    .returning({ id: project.id, tableNumber: project.tableNumber });

  await db.insert(projectTrack).values(
    projects.flatMap((item) => {
      const links = [{ projectId: item.id, trackId: general.id }];
      const number = item.tableNumber ?? 0;
      if (number % 5 === 0) links.push({ projectId: item.id, trackId: sponsor.id });
      if (number % 4 === 0) links.push({ projectId: item.id, trackId: beginner.id });
      return links;
    }),
  );

  const sponsorTrack = tracks.find((item) => item.slug === "sponsor");
  await db.insert(judge).values(
    Array.from({ length: 6 }, (_, index) => ({
      eventId: demoEvent.id,
      name: `Judge ${index + 1}`,
      email: `judge${index + 1}@demo.panel`,
      status: "approved" as const,
      trackId: index === 5 ? sponsorTrack?.id : null,
      zoneId: hall.id,
    })),
  );

  return { eventId: demoEvent.id };
}
