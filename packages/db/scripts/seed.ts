import { db } from "../src/index";
import { users, admins, members, hackathons, judgingProjects, judges, judgeAssignments, judgeQueue } from "../src/schemas";
import { eq } from "drizzle-orm";

async function ensureUser(email: string, name: string) {
  const normalizedEmail = email.toLowerCase();

  let user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  });

  if (!user) {
    console.log(`📝 Creating user record for: ${normalizedEmail}`);

    const [newUser] = await db.insert(users).values({
      id: `user_${normalizedEmail.split('@')[0]}_${Date.now()}`,
      email: normalizedEmail,
      name: name,
      emailVerified: null,
      image: null,
    }).returning();

    user = newUser;
    console.log(`✅ Created user: ${normalizedEmail}`);
  } else {
    console.log(`✅ Found existing user: ${normalizedEmail}`);
  }

  return user;
}

async function ensureAdmin(email: string, name: string) {
  const user = await ensureUser(email, name);

  const existingAdmin = await db.query.admins.findFirst({
    where: eq(admins.userId, user.id),
  });

  if (!existingAdmin) {
    await db.insert(admins).values({
      userId: user.id,
      role: "super_admin",
      permissions: [],
      isActive: true,
    });
    console.log(`✅ Added super_admin role to ${email}`);
  } else {
    console.log(`ℹ️  ${email} already admin (${existingAdmin.role})`);
  }

  return user;
}

async function ensureMember(email: string, name: string) {
  const user = await ensureUser(email, name);

  const existingMember = await db.query.members.findFirst({
    where: eq(members.userId, user.id),
  });

  if (!existingMember) {
    const membershipStartDate = new Date();
    const membershipEndDate = new Date();
    membershipEndDate.setFullYear(membershipEndDate.getFullYear() + 1);

    await db.insert(members).values({
      userId: user.id,
      memberType: "new",
      firstName: name.split(' ')[0] || "Member",
      lastName: name.split(' ')[1] || "",
      phoneNumber: null,
      school: "Georgia Institute of Technology",
      major: null,
      graduationYear: null,
      skills: [],
      interests: [],
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      membershipStartDate,
      membershipEndDate,
      isActive: true,
    });
    console.log(`✅ Added member status to ${email}`);
  } else {
    console.log(`ℹ️  ${email} already a member`);
  }
}

async function ensureJudge(email: string, name: string) {
  const user = await ensureUser(email, name);

  let judge = await db.query.judges.findFirst({
    where: eq(judges.userId, user.id),
  });

  if (!judge) {
    const [newJudge] = await db.insert(judges).values({
      userId: user.id,
      name: name,
      isActive: true,
    }).returning();
    judge = newJudge;
    console.log(`✅ Added judge role to ${email}`);
  } else {
    console.log(`ℹ️  ${email} already a judge`);
  }

  return judge;
}

async function ensureHackathon(name: string) {
  let hackathon = await db.query.hackathons.findFirst({
    where: eq(hackathons.name, name),
  });

  if (!hackathon) {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 2); // 2 days long

    const [newHackathon] = await db.insert(hackathons).values({
      name,
      description: "The premier student-run hackathon at Georgia Tech.",
      location: "Exhibition Hall",
      startDate,
      endDate,
      status: "in_progress",
      prizes: [
        { place: "1st", amount: 1000, description: "Grand Prize" },
        { place: "2nd", amount: 500, description: "Runner Up" }
      ],
      isPublic: true,
    }).returning();

    hackathon = newHackathon;
    console.log(`✅ Created hackathon: ${name}`);
  } else {
    console.log(`ℹ️  Hackathon ${name} already exists`);
  }

  return hackathon;
}

async function ensureJudgingProjects(hackathonId: string) {
  // Check if we already have projects for this hackathon
  const existingProjects = await db.query.judgingProjects.findMany({
    where: eq(judgingProjects.hackathonId, hackathonId),
  });

  if (existingProjects.length > 0) {
    console.log(`ℹ️  Found ${existingProjects.length} existing projects`);
    return existingProjects;
  }

  const projectsToCreate = [
    { name: "HealthLink", description: "AI-powered healthcare coordination", tableNumber: 101, teamMembers: "Alice, Bob, Charlie" },
    { name: "EduVance", description: "Personalized learning platform", tableNumber: 102, teamMembers: "Dave, Eve" },
    { name: "EcoTrack", description: "Carbon footprint monitoring", tableNumber: 103, teamMembers: "Frank, Grace, Heidi" },
    { name: "FinFlow", description: "Financial literacy for students", tableNumber: 104, teamMembers: "Ivan, Judy" },
    { name: "SafeStreets", description: "Community safety reporting", tableNumber: 105, teamMembers: "Mallory, Niaj" },
    { name: "QuickCode", description: "Real-time collaborative IDE", tableNumber: 106, teamMembers: "Oscar, Peggy" },
    { name: "FitLife", description: "Social fitness tracking", tableNumber: 107, teamMembers: "Romeo, Juliet" },
    { name: "MindfulMe", description: "Mental health and meditation", tableNumber: 108, teamMembers: "Sybil, Ted" },
    { name: "AgriTech", description: "IoT for sustainable farming", tableNumber: 109, teamMembers: "Victor, Walter" },
    { name: "SpaceXplore", description: "VR space exploration", tableNumber: 110, teamMembers: "Xena, Yves" },
  ];

  const createdProjects = await db.insert(judgingProjects).values(
    projectsToCreate.map(p => ({
      hackathonId,
      ...p
    }))
  ).returning();

  console.log(`✅ Created ${createdProjects.length} sample projects`);
  return createdProjects;
}

async function ensureJudgeAssignment(judgeId: string, hackathonId: string, projects: any[]) {
  // 1. Assign judge to hackathon
  const assignment = await db.query.judgeAssignments.findFirst({
    where: (assignments, { and, eq }) => and(
      eq(assignments.judgeId, judgeId),
      eq(assignments.hackathonId, hackathonId)
    ),
  });

  if (!assignment) {
    await db.insert(judgeAssignments).values({
      judgeId,
      hackathonId,
      isLead: true,
    });
    console.log(`✅ Assigned judge to hackathon`);
  } else {
    console.log(`ℹ️  Judge already assigned to hackathon`);
  }

  // 2. Populate Queue
  // Check if queue exists
  const queueCount = await db.query.judgeQueue.findMany({
    where: (queue, { and, eq }) => and(
      eq(queue.judgeId, judgeId),
      eq(queue.hackathonId, hackathonId)
    ),
  });

  if (queueCount.length === 0) {
    console.log(`📝 Populating judge queue with ${projects.length} projects...`);

    await db.insert(judgeQueue).values(
      projects.map((p, idx) => ({
        judgeId,
        hackathonId,
        projectId: p.id,
        order: idx + 1,
        isCompleted: false, // Ensure they start as not completed
      }))
    );
    console.log(`✅ Created judge queue`);
  } else {
    console.log(`ℹ️  Judge queue already exists with ${queueCount.length} items`);
  }
}

async function seed() {
  console.log("🌱 Seeding database...");

  // Add admins
  const aamogh = await ensureAdmin("aamoghsawantt@gmail.com", "Aamogh Sawant");

  // Make Aamogh a judge
  const judge = await ensureJudge("aamoghsawantt@gmail.com", "Aamogh Sawant");

  // Add members
  await ensureMember("unku708@gmail.com", "Unku User");

  // Create Hackathon
  const hackathon = await ensureHackathon("HackGT 12");

  // Create Projects
  const projects = await ensureJudgingProjects(hackathon.id);

  // Assign Judge & Populate Queue
  await ensureJudgeAssignment(judge.id, hackathon.id, projects);

  console.log("🎉 Seeding complete!");
  console.log("");
  console.log("✅ SUCCESS: Data seeded for testing.");
  console.log("   - Hackathon: HackGT 12");
  console.log("   - Judge: Aamogh Sawant");
  console.log("   - Projects: 10 sample projects");
  console.log("");
}

seed()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
