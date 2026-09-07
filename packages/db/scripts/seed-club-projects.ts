/**
 * Seeds the public club-project roster and the portal initiatives behind it.
 *
 *   pnpm --filter @query/db db:seed:club-projects
 *
 * Idempotent and never deletes: club_project upserts on slug, initiatives match
 * on title. Initiatives are owned by OWNER_EMAIL until the real leads have
 * accounts; the public card still names the actual lead.
 */
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// `../src` is imported inside main(): its client reads DATABASE_URL at module
// load, and a static import would be hoisted above the dotenv call.
import type { ClubProjectStatus } from "../src/schemas/club-projects";

const OWNER_EMAIL =
  process.env.CLUB_PROJECT_OWNER_EMAIL ?? "aamoghsawantt@gmail.com";

type Row = {
  slug: string;
  name: string;
  status: ClubProjectStatus;
  leadName: string | null;
  summary: string;
  tech: string[];
  repoUrl?: string;
  joinUrl?: string;
  capacityNote?: string;
  term?: string;
  sortOrder: number;
  apply?: { commitment: string; maxMembers: number | null };
};

const FALL_2026 = "Fall 2026";

const ROSTER: Row[] = [
  {
    slug: "roboinvesting",
    name: "Roboinvesting",
    status: "active",
    leadName: "Andrew Hlavacek",
    summary:
      "Systematic trading research: strategy backtests, technical indicators, and a dashboard over the results.",
    tech: ["Python", "Pandas", "Backtesting", "Dashboards"],
    repoUrl: "https://github.com/DataScience-GT/RoboinvestingDashboard",
    capacityNote: "Recruiting 4-6 members",
    term: FALL_2026,
    sortOrder: 10,
    apply: { commitment: "A few hours a week", maxMembers: 6 },
  },
  {
    slug: "arc",
    name: "ARC",
    status: "active",
    leadName: "Murilo Gustineli",
    summary:
      "The club's applied research group: Kaggle competitions and CLEF/TREC research tracks, run as a seminar.",
    tech: ["Machine Learning", "PyTorch", "Competitions", "Research"],
    joinUrl: "https://dsgt-arc.org/join",
    term: FALL_2026,
    sortOrder: 20,
  },
  {
    slug: "dsgt-website",
    name: "DS@GT Website",
    status: "active",
    leadName: "Aamogh Sawant",
    summary:
      "The site you are on, plus the member portal behind it: dues, events, check-in, and bootcamp.",
    tech: ["TypeScript", "Next.js", "tRPC", "Drizzle", "Postgres"],
    repoUrl: "https://github.com/DataScience-GT/query",
    capacityNote: "Capped at 6 members",
    term: FALL_2026,
    sortOrder: 30,
    apply: { commitment: "A few hours a week", maxMembers: 6 },
  },
  {
    slug: "deep-learning-playground",
    name: "Deep Learning Playground",
    status: "revived",
    leadName: null,
    summary:
      "Restarting this term. A web app where people new to deep learning can load a dataset and try PyTorch modules without writing code. Needs a lead.",
    tech: ["PyTorch", "Django", "TypeScript", "Docker"],
    repoUrl: "https://github.com/DataScience-GT/Deep-Learning-Playground",
    term: FALL_2026,
    sortOrder: 40,
    apply: { commitment: "Flexible while it restarts", maxMembers: null },
  },
  {
    slug: "sports-analytics",
    name: "Sports Analytics",
    status: "revived",
    leadName: null,
    summary:
      "Restarting this term around the AthleticsScrapers collection work, with open-ended sports modelling once the data is flowing. Needs a lead.",
    tech: ["Python", "Web Scraping", "Statistical Modeling"],
    repoUrl: "https://github.com/DataScience-GT/DSGT-AthleticsScrapers",
    term: FALL_2026,
    sortOrder: 50,
    apply: { commitment: "Flexible while it restarts", maxMembers: null },
  },
  {
    slug: "atlcrime",
    name: "AtlCrime",
    status: "needs_lead",
    leadName: null,
    summary:
      "A heatmap of safety across Atlanta built from public crime data. Listed so somebody can pick it up: there is no lead today.",
    tech: ["Python", "Geospatial", "Data Visualization"],
    repoUrl: "https://github.com/DataScience-GT/AtlCrime",
    term: FALL_2026,
    sortOrder: 60,
    apply: { commitment: "Flexible", maxMembers: null },
  },

  // Past: history only, no application.
  {
    slug: "deep-learning-playground-2021",
    name: "Deep Learning Playground (2021-2023)",
    status: "past",
    leadName: "Noah Iversen",
    summary:
      "The original build: visualising backpropagation and architecture tweaks in the browser, in real time.",
    tech: ["AWS", "Docker", "PyTorch", "TypeScript", "Next.js", "Django"],
    repoUrl: "https://github.com/DataScience-GT/Deep-Learning-Playground",
    sortOrder: 110,
  },
  {
    slug: "ai-driven-investment-platform",
    name: "AI-Driven Investment Platform",
    status: "past",
    leadName: "Aryan Hazra",
    summary:
      "NLP that helped investors reach goals conversationally, adapting to client information rather than static robo-investing inputs.",
    tech: ["NLP", "Machine Learning", "Python", "Data Analytics"],
    sortOrder: 120,
  },
  {
    slug: "furnichanter",
    name: "Furnichanter",
    status: "past",
    leadName: "Jane Ivanova",
    summary:
      "Computer vision for interior design: search furniture by image, generate custom 3D models from text.",
    tech: ["Deep Learning", "3D Modeling", "Python", "Computer Vision"],
    sortOrder: 130,
  },
  {
    slug: "kaggle-clef",
    name: "Kaggle CLEF",
    status: "past",
    leadName: "Anthony Miyaguchi",
    summary:
      "A seminar-styled introduction to data science competitions, building ML systems for the CLEF 2025 tracks.",
    tech: ["Python", "Machine Learning", "Data Science"],
    sortOrder: 140,
  },
  {
    slug: "sports-analysis-2024",
    name: "Sports Analysis (2024)",
    status: "past",
    leadName: "Casper Guo",
    summary:
      "Open-ended sports research: NFL performance projections, optimal NBA rosters, and betting-odds differences.",
    tech: ["Python", "Machine Learning", "Statistical Modeling"],
    repoUrl: "https://github.com/DataScience-GT/FA24-Sports-Analysis",
    sortOrder: 150,
  },
];

type Schema = typeof import("../src");
type Database = NonNullable<Schema["db"]>;

let S: Schema;

async function resolveOwner(database: Database) {
  const [owner] = await database
    .select({ id: S.users.id })
    .from(S.users)
    .where(S.eq(S.users.email, OWNER_EMAIL))
    .limit(1);

  if (!owner) {
    throw new Error(
      `No user with email ${OWNER_EMAIL}. Set CLUB_PROJECT_OWNER_EMAIL to an account that exists.`,
    );
  }

  const [existingRole] = await database
    .select({ id: S.projectLeaders.id })
    .from(S.projectLeaders)
    .where(S.eq(S.projectLeaders.userId, owner.id))
    .limit(1);

  if (!existingRole) {
    await database.insert(S.projectLeaders).values({ userId: owner.id });
  }

  return owner.id;
}

async function upsertInitiative(database: Database, row: Row, ownerId: string) {
  if (!row.apply) return null;

  const values = {
    leaderUserId: ownerId,
    title: row.name,
    summary: row.summary.slice(0, 300),
    description: row.summary,
    commitment: row.apply.commitment,
    maxMembers: row.apply.maxMembers,
    status: "open" as const,
    updatedAt: new Date(),
  };

  const [existing] = await database
    .select({ id: S.initiatives.id })
    .from(S.initiatives)
    .where(S.eq(S.initiatives.title, row.name))
    .limit(1);

  if (existing) {
    await database
      .update(S.initiatives)
      .set(values)
      .where(S.eq(S.initiatives.id, existing.id));
    return existing.id;
  }

  const [created] = await database
    .insert(S.initiatives)
    .values(values)
    .returning({ id: S.initiatives.id });

  return created.id;
}

async function main() {
  S = await import("../src");
  const db = S.db;

  if (!db) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const ownerId = await resolveOwner(db);

  for (const row of ROSTER) {
    const initiativeId = await upsertInitiative(db, row, ownerId);

    const values = {
      slug: row.slug,
      name: row.name,
      status: row.status,
      leadName: row.leadName,
      summary: row.summary,
      tech: row.tech,
      repoUrl: row.repoUrl ?? null,
      joinUrl: row.joinUrl ?? null,
      capacityNote: row.capacityNote ?? null,
      term: row.term ?? null,
      initiativeId,
      sortOrder: row.sortOrder,
      isPublished: true,
    };

    await db
      .insert(S.clubProjects)
      .values(values)
      .onConflictDoUpdate({
        target: S.clubProjects.slug,
        set: { ...values, updatedAt: new Date() },
      });

    console.log(
      `  ${row.status.padEnd(10)} ${row.slug}${initiativeId ? " (applications open)" : ""}`,
    );
  }

  console.log(`\nSeeded ${ROSTER.length} club projects.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
