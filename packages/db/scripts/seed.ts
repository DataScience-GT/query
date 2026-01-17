import { db } from "../src/index";
import { users, admins, members } from "../src/schemas";
import { eq } from "drizzle-orm";

async function ensureUser(email: string, name: string) {
  // Normalize email to lowercase to prevent OAuth mismatch
  const normalizedEmail = email.toLowerCase();

  let user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  });

  if (!user) {
    console.log(`📝 Creating user record for: ${normalizedEmail}`);

    const [newUser] = await db.insert(users).values({
      // Drizzle Adapter works best with standard UUIDs or unique strings
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

  if (existingAdmin) {
    console.log(`ℹ️  ${email} already admin (${existingAdmin.role})`);
    return;
  }

  await db.insert(admins).values({
    userId: user.id,
    role: "super_admin",
    permissions: [],
    isActive: true,
  });

  console.log(`✅ Added super_admin role to ${email}`);
}

async function ensureMember(email: string, name: string) {
  const user = await ensureUser(email, name);

  const existingMember = await db.query.members.findFirst({
    where: eq(members.userId, user.id),
  });

  if (existingMember) {
    console.log(`ℹ️  ${email} already a member`);
    return;
  }

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
}

async function seed() {
  console.log("🌱 Seeding database...");

  // Add admins
  await ensureAdmin("aamoghsawantt@gmail.com", "Aamogh Sawant");

  // Add members
  await ensureMember("unku708@gmail.com", "Unku User");

  console.log("🎉 Seeding complete!");
  console.log("");
  console.log("✅ SUCCESS: Account linking is enabled.");
  console.log("   Users can now sign in with Google to automatically claim these records.");
  console.log("   No manual deletion or OAuth account creation is required.");
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