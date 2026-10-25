/**
 * Fills a LOCAL database with fake data covering the main features.
 *
 *   pnpm --filter @query/db db:seed
 *
 * Idempotent: people, events and status samples are keyed on stable ids and
 * skipped when present; the hackathon and its judging setup are written once,
 * with the edition. To start clean, run `pnpm local:reset` then `pnpm local:up`.
 * Never deletes. Refuses a non-local DATABASE_URL via tooling/scripts/src/guard-local.ts.
 *
 * Everyone signs in with an email code, which lands in Mailpit. Sign in as
 * admin@example.test for staff access. Nothing here is a real person.
 */
import * as dotenv from "dotenv";
import path from "path";
import { spawnSync } from "node:child_process";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

const ADMIN_EMAIL = "admin@example.test";
const DAY = 24 * 60 * 60 * 1000;

type PersonSeed = {
  id: string;
  name: string;
  member?: "active" | "lapsed";
  memberType?: "new" | "continuous";
  bootcamp?: boolean;
  admin?: boolean;
};

const PEOPLE: PersonSeed[] = [
  {
    id: "seed-admin",
    name: "Ada Admin",
    member: "active",
    memberType: "continuous",
    admin: true,
  },
  {
    id: "seed-member-new",
    name: "Priya Raman",
    member: "active",
    memberType: "new",
    bootcamp: true,
  },
  {
    id: "seed-member-cont",
    name: "Marcus Lee",
    member: "active",
    memberType: "continuous",
  },
  {
    id: "seed-member-lapsed",
    name: "Sofia Alvarez",
    member: "lapsed",
    memberType: "continuous",
  },
  { id: "seed-visitor-1", name: "Noah Kim" },
  { id: "seed-visitor-2", name: "Ava Chen" },
];

const HACKERS = [
  { id: "seed-hacker-1", name: "Jordan Blake", status: "checked_in" },
  { id: "seed-hacker-2", name: "Riley Okafor", status: "checked_in" },
  { id: "seed-hacker-3", name: "Sam Whitaker", status: "approved" },
  { id: "seed-hacker-4", name: "Taylor Nguyen", status: "approved" },
  { id: "seed-hacker-5", name: "Casey Moreno", status: "approved" },
  { id: "seed-hacker-6", name: "Devon Patel", status: "pending" },
  { id: "seed-hacker-7", name: "Quinn Hart", status: "waitlisted" },
  { id: "seed-hacker-8", name: "Rowan Ellis", status: "rejected" },
] as const;

const emailFor = (id: string) =>
  id === "seed-admin" ? ADMIN_EMAIL : `${id.replace(/^seed-/, "")}@example.test`;

// Rows come back from RETURNING as arrays; this names the one we expect.
const one = <T>(rows: readonly T[], index = 0): T => {
  const row = rows[index];
  if (row === undefined) throw new Error(`Expected a row at ${index}`);
  return row;
};

const splitName = (name: string) => {
  const [first = name, ...rest] = name.split(" ");
  return { first, last: rest.join(" ") || "Seed" };
};

async function main() {
  // Loaded here, not at the top: the client reads DATABASE_URL at import, and a
  // static import would run before dotenv above.
  const S = await import("../src");
  const { currentTerm } = await import("../src/services/membership");
  const db = S.db;

  if (!db) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const now = new Date();
  const term = currentTerm();

  // People -----------------------------------------------------------------
  const allPeople: PersonSeed[] = [
    ...PEOPLE,
    ...HACKERS.map((h) => ({ id: h.id, name: h.name })),
    { id: "seed-judge", name: "Dr. Elena Park" },
  ];

  await db
    .insert(S.users)
    .values(
      allPeople.map((p) => ({
        id: p.id,
        name: p.name,
        email: emailFor(p.id),
        emailVerified: now,
      })),
    )
    .onConflictDoNothing();

  for (const person of PEOPLE) {
    if (person.admin) {
      await db
        .insert(S.admins)
        .values({ userId: person.id, role: "super_admin" })
        .onConflictDoNothing();
    }
    if (!person.member) continue;

    const lapsed = person.member === "lapsed";
    const { first, last } = splitName(person.name);
    const start = new Date(now.getTime() - (lapsed ? 400 : 60) * DAY);
    const end = new Date(start.getTime() + 365 * DAY);

    const [member] = await db
      .insert(S.members)
      .values({
        userId: person.id,
        memberType: person.memberType ?? "new",
        firstName: first,
        lastName: last,
        school: "Georgia Tech",
        major: "Computer Science",
        graduationYear: 2027,
        isActive: !lapsed,
        bootcampMember: Boolean(person.bootcamp),
        bootcampTerm: person.bootcamp ? term : null,
        membershipStartDate: start,
        membershipEndDate: end,
        skills: ["Python", "SQL"],
        interests: ["Machine Learning"],
      })
      .onConflictDoNothing()
      .returning({ id: S.members.id });

    if (member) {
      await db.insert(S.membershipHistory).values({
        memberId: member.id,
        action: lapsed ? "expired" : "joined",
        startDate: start,
        endDate: end,
      });
    }
  }

  // Club events and bootcamp sessions --------------------------------------
  const eventRows = [
    { qr: "seed-general-meeting", title: "General Body Meeting", days: -10, location: "Klaus 1456" },
    { qr: "seed-social", title: "Spring Social", days: 3, location: "Tech Green" },
    { qr: "seed-speaker", title: "Speaker Night: Data in Sports", days: 14, location: "Scheller 100" },
  ].map((e) => ({
    title: e.title,
    description: "Fake event for local testing.",
    location: e.location,
    eventDate: new Date(now.getTime() + e.days * DAY),
    qrCode: e.qr,
    createdById: "seed-admin",
  }));

  const sessionRows = [1, 2, 3, 4].map((week) => ({
    title: `Bootcamp Week ${week}`,
    description: "Fake bootcamp session for local testing.",
    location: "Klaus 2443",
    // Week 3 is this week, so there is a past, a current and a future session.
    eventDate: new Date(now.getTime() + (week - 3) * 7 * DAY),
    qrCode: `seed-bootcamp-${term}-w${week}`,
    bootcampWeek: week,
    bootcampTerm: term,
    bootcampOnly: true,
    createdById: "seed-admin",
  }));

  await db
    .insert(S.events)
    .values([...eventRows, ...sessionRows])
    .onConflictDoNothing();

  await db
    .insert(S.bootcampWorkshops)
    .values(
      [1, 2, 3, 4].map((week) => ({
        term,
        week,
        title: one(["Python and Pandas", "Visualization", "Regression", "Classification"], week - 1),
        isPublished: week <= 3,
      })),
    )
    .onConflictDoNothing();

  // Attendance: the past general meeting and bootcamp week 1.
  const attended = await db
    .select({ id: S.events.id })
    .from(S.events)
    .where(
      S.inArray(S.events.qrCode, [
        "seed-general-meeting",
        `seed-bootcamp-${term}-w1`,
      ]),
    );
  const memberRows = await db
    .select({ id: S.members.id, userId: S.members.userId })
    .from(S.members)
    .where(
      S.inArray(S.members.userId, [
        "seed-admin",
        "seed-member-new",
        "seed-member-cont",
      ]),
    );
  await db
    .insert(S.eventCheckIns)
    .values(
      attended.flatMap((event) =>
        memberRows.map((m) => ({
          eventId: event.id,
          userId: m.userId,
          memberId: m.id,
        })),
      ),
    )
    .onConflictDoNothing();

  // Hackathon, registrations, teams, project -------------------------------
  const [hackathon] = await db
    .insert(S.hackathons)
    .values({
      name: "Hacklytics Local",
      description: "Fake edition for local testing.",
      location: "Klaus Advanced Computing Building",
      startDate: new Date(now.getTime() - DAY),
      endDate: new Date(now.getTime() + DAY),
      registrationDeadline: new Date(now.getTime() - 7 * DAY),
      hackingStartTime: new Date(now.getTime() - DAY),
      maxParticipants: 300,
      // Seats are held by approved and checked-in rows only, as
      // syncCurrentParticipants counts them.
      currentParticipants: HACKERS.filter(
        (h) => h.status === "approved" || h.status === "checked_in",
      ).length,
      status: "in_progress",
      theme: "Data for good",
      tracks: ["Healthcare", "Sports", "Finance"],
      judgingActive: true,
    })
    .onConflictDoNothing()
    .returning({ id: S.hackathons.id });

  if (hackathon) {
    const hackathonId = hackathon.id;

    const teams = await db
      .insert(S.hackathonTeams)
      .values([
        { hackathonId, name: "Gradient Descenders", captainId: "seed-hacker-1", currentMembers: 3 },
        { hackathonId, name: "Overfit Club", captainId: "seed-hacker-4", currentMembers: 2 },
      ])
      .returning({ id: S.hackathonTeams.id });
    const teamA = one(teams, 0);
    const teamB = one(teams, 1);
    const teamOf = (id: string) =>
      ["seed-hacker-1", "seed-hacker-2", "seed-hacker-3"].includes(id)
        ? teamA.id
        : ["seed-hacker-4", "seed-hacker-5"].includes(id)
          ? teamB.id
          : null;

    const participants = await db
      .insert(S.hackathonParticipants)
      .values(
        HACKERS.map((h) => {
          const { first, last } = splitName(h.name);
          return {
            hackathonId,
            userId: h.id,
            registrationStatus: h.status,
            teamId: teamOf(h.id),
            firstName: first,
            lastName: last,
            school: "Georgia Tech",
            major: "Data Science",
            levelOfStudy: "Junior" as const,
            agreeToCodeOfConduct: true,
            checkedInAt: h.status === "checked_in" ? now : null,
          };
        }),
      )
      .returning({
        id: S.hackathonParticipants.id,
        userId: S.hackathonParticipants.userId,
      });

    const projects = await db
      .insert(S.hackathonProjects)
      .values(
        [teamA, teamB].map((team, i) => ({
          hackathonId,
          teamId: team.id,
          submittedById: participants.find(
            (p) => p.userId === (i === 0 ? "seed-hacker-1" : "seed-hacker-4"),
          )?.id,
          name: one(["ClinicFlow", "PlayCaller"], i),
          description: one(
            ["Predicts clinic wait times.", "Suggests play calls from tracking data."],
            i,
          ),
          technologies: ["Python", "PyTorch"],
          tracks: one([["Healthcare"], ["Sports"]], i),
          status: "submitted" as const,
          submittedAt: now,
        })),
      )
      .returning({
        id: S.hackathonProjects.id,
        name: S.hackathonProjects.name,
      });

    // Judging setup --------------------------------------------------------
    await db
      .insert(S.judgingConfigs)
      .values({ hackathonId, state: "open", openedAt: now });

    const challenges = await db
      .insert(S.judgingChallenges)
      .values([
        { hackathonId, label: "General", isGeneral: true, displayOrder: 0 },
        { hackathonId, label: "Healthcare", displayOrder: 1 },
      ])
      .returning({ id: S.judgingChallenges.id });
    const general = one(challenges, 0);
    const healthcare = one(challenges, 1);
    const buildings = await db
      .insert(S.judgingBuildings)
      .values({ hackathonId, name: "Klaus" })
      .returning({ id: S.judgingBuildings.id });
    const building = one(buildings);
    await db.insert(S.judgingRooms).values([
      { hackathonId, challengeId: general.id, buildingId: building.id, name: "1447", displayOrder: 0 },
      { hackathonId, challengeId: healthcare.id, buildingId: building.id, name: "2443", displayOrder: 1 },
    ]);
    await db.insert(S.judgingRubricItems).values([
      { hackathonId, kind: "rating", label: "Technical depth", displayOrder: 0 },
      { hackathonId, kind: "rating", label: "Impact", displayOrder: 1 },
      { hackathonId, kind: "response", label: "Feedback for the team", displayOrder: 2, required: false },
    ]);
    await db.insert(S.judgingJudges).values([
      { hackathonId, kind: "member", userId: "seed-admin", displayName: "Ada Admin" },
      { hackathonId, kind: "member", userId: "seed-judge", displayName: "Dr. Elena Park" },
    ]);
    // Desk access needs an approved roster row too; the admin gets in as staff.
    await db
      .insert(S.judges)
      .values({
        hackathonId,
        userId: "seed-judge",
        name: "Dr. Elena Park",
        email: "judge@example.test",
        isActive: true,
      })
      .onConflictDoNothing();

    const entries = await db
      .insert(S.judgingEntries)
      .values(
        projects.map((project, i) => ({
          hackathonId,
          source: "portal" as const,
          sourceProjectId: project.id,
          title: project.name,
          description: "Promoted from a portal submission.",
          demoLinks: [],
          technologies: ["Python"],
          universities: ["Georgia Tech"],
          prizeCategories: i === 0 ? ["Healthcare"] : [],
          participantCount: i === 0 ? 3 : 2,
          submittedAt: now,
        })),
      )
      .returning({ id: S.judgingEntries.id });
    await db.insert(S.judgingEntryChallenges).values([
      { entryId: one(entries, 0).id, challengeId: general.id, hackathonId, isOptIn: false },
      { entryId: one(entries, 0).id, challengeId: healthcare.id, hackathonId },
      { entryId: one(entries, 1).id, challengeId: general.id, hackathonId, isOptIn: false },
    ]);
    await db.insert(S.judgingEntryMembers).values(
      HACKERS.slice(0, 5).map((h, i) => ({
        entryId: one(entries, i < 3 ? 0 : 1).id,
        hackathonId,
        name: h.name,
        email: emailFor(h.id),
        displayOrder: i,
        userId: h.id,
        claimedAt: now,
      })),
    );
  }

  // /status page: twelve hours of five-minute samples ----------------------
  const bucket = Math.floor(now.getTime() / (5 * 60 * 1000)) * 5 * 60 * 1000;
  await db
    .insert(S.statusSample)
    .values(
      Array.from({ length: 144 }, (_, i) => ({
        bucketStart: new Date(bucket - i * 5 * 60 * 1000),
        instanceId: "local-seed",
        requests: 40 + ((i * 7) % 60),
        errors: i % 37 === 0 ? 1 : 0,
        p50Ms: 60 + ((i * 3) % 40),
        p95Ms: 220 + ((i * 11) % 180),
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(S.systemSettings)
    .values({ id: "default" })
    .onConflictDoNothing();

  // Club projects: reuse the roster script, owned by the seeded admin.
  const roster = spawnSync("pnpm db:seed:club-projects", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    shell: true,
    env: { ...process.env, CLUB_PROJECT_OWNER_EMAIL: ADMIN_EMAIL },
  });
  if (roster.status !== 0) process.exit(roster.status ?? 1);

  console.log(`\nSeeded local data for ${term}. Sign in as ${ADMIN_EMAIL}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
