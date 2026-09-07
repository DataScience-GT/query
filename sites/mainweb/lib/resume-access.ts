import { auth } from "@query/auth";
import { db, admins, memberResumes, members, users } from "@query/db";
import { and, eq } from "drizzle-orm";
import { isStaffRole, isExpiredAdmin } from "@query/api/portal-context";
import { cache } from "@query/api";
import type { DrizzleDB } from "@query/db";

// Pure file rules live next door so tests need no auth or database.
export { MAX_RESUME_BYTES, looksLikePdf, resumeFileName } from "./resume-file";

/** Same answer the isAdmin middleware gives, for route handlers it cannot reach. */
export async function resumeCaller() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId || !db) return { userId: null, isStaff: false };

  // Same key and TTL the isAdmin middleware uses, so a role change evicts both
  // through the `admin:<id>*` sweep the admin mutations already run. Every
  // resume request — upload, preview, book — asked this question again.
  const cacheKey = `admin:${userId}:role`;
  let admin = cache.get<typeof admins.$inferSelect>(cacheKey);

  if (!admin) {
    admin =
      (await (db as DrizzleDB).query.admins.findFirst({
        where: and(eq(admins.userId, userId), eq(admins.isActive, true)),
      })) ?? null;

    if (admin) cache.set(cacheKey, admin, 60);
  }

  return {
    userId,
    isStaff: !!admin && isStaffRole(admin.role) && !isExpiredAdmin(admin),
  };
}

/** Metadata for one person's resume, with the name to file it under. */
export async function loadResume(userId: string) {
  const rows = await (db as DrizzleDB)
    .select({
      storageKey: memberResumes.storageKey,
      fileName: memberResumes.fileName,
      firstName: members.firstName,
      lastName: members.lastName,
      name: users.name,
    })
    .from(memberResumes)
    .innerJoin(users, eq(users.id, memberResumes.userId))
    .leftJoin(members, eq(members.userId, memberResumes.userId))
    .where(eq(memberResumes.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    storageKey: row.storageKey,
    displayName:
      row.firstName && row.lastName
        ? `${row.firstName} ${row.lastName}`
        : (row.name ?? "resume"),
  };
}
