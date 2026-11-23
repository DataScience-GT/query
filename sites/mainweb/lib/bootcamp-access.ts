import { auth } from "@query/auth";
import { db } from "@query/db";
import type { DrizzleDB, admins } from "@query/db";
import { cache } from "@query/api";
import { isExpiredAdmin, isStaffRole } from "@query/api/portal-context";

/** Same staff answer the tRPC gates use, plus the cohort the caller paid for. */
export async function bootcampCaller() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId || !db) {
    return { userId: null, isStaff: false, bootcampTerm: null };
  }

  // The exact isAdmin key and TTL make role invalidation cover byte routes too.
  const cacheKey = `admin:${userId}:role`;
  let admin = cache.get<typeof admins.$inferSelect>(cacheKey);
  if (!admin) {
    admin =
      (await (db as DrizzleDB).query.admins.findFirst({
        where: { userId, isActive: true },
      })) ?? null;
    if (admin) cache.set(cacheKey, admin, 60);
  }

  const member = await (db as DrizzleDB).query.members.findFirst({
    where: { userId },
    columns: { bootcampTerm: true },
  });

  return {
    userId,
    isStaff: !!admin && isStaffRole(admin.role) && !isExpiredAdmin(admin),
    // Compared against the file's own term, never the current one.
    bootcampTerm: member?.bootcampTerm ?? null,
  };
}
