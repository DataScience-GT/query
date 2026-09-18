import { auth } from "@query/auth";
import { admins, db, members } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { and, eq } from "drizzle-orm";
import { cache } from "@query/api";
import { isExpiredAdmin, isStaffRole } from "@query/api/portal-context";
import { currentTerm } from "@query/db/services/membership";

/** Same staff and enrolment answers the tRPC gates use, for route handlers. */
export async function bootcampCaller() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId || !db) {
    return { userId: null, isStaff: false, isEnrolled: false };
  }

  // The exact isAdmin key and TTL make role invalidation cover byte routes too.
  const cacheKey = `admin:${userId}:role`;
  let admin = cache.get<typeof admins.$inferSelect>(cacheKey);
  if (!admin) {
    admin =
      (await (db as DrizzleDB).query.admins.findFirst({
        where: and(eq(admins.userId, userId), eq(admins.isActive, true)),
      })) ?? null;
    if (admin) cache.set(cacheKey, admin, 60);
  }

  const member = await (db as DrizzleDB).query.members.findFirst({
    where: eq(members.userId, userId),
    columns: { bootcampTerm: true },
  });

  return {
    userId,
    isStaff: !!admin && isStaffRole(admin.role) && !isExpiredAdmin(admin),
    isEnrolled: member?.bootcampTerm === currentTerm(),
  };
}
