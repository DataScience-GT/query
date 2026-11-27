import { db, memberResumes, members, users } from "@query/db";
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

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
