import { auth } from "@query/auth";
import { db } from "@query/db";
import type { admins } from "@query/db";
import { cache } from "@query/api";
import { isExpiredAdmin, isStaffRole } from "@query/api/portal-context";

/** Same staff answer the tRPC gates use, for route handlers they cannot reach. */
export async function staffCaller() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId || !db) return { userId: null, isStaff: false };

  // The exact isAdmin key and TTL make role invalidation cover byte routes too.
  const cacheKey = `admin:${userId}:role`;
  let admin = cache.get<typeof admins.$inferSelect>(cacheKey);
  if (!admin) {
    admin =
      (await db.query.admins.findFirst({
        where: { userId, isActive: true },
      })) ?? null;
    if (admin) cache.set(cacheKey, admin, 60);
  }

  return {
    userId,
    isStaff: !!admin && isStaffRole(admin.role) && !isExpiredAdmin(admin),
  };
}
