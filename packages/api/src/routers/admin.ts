import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  admins,
  users,
  events,
  eventCheckIns,
  hackathons,
  hackathonParticipants,
  hackathonEventAttendees,
} from "@query/db";
import { eq, and, count, gte, inArray } from "drizzle-orm";
import { CacheKeys, invalidatePortalContext } from "../middleware/cache";
import { isAdmin, isSuperAdmin } from "../middleware/procedures";
import type { DrizzleDB } from "@query/db";

export const adminRouter = createTRPCRouter({
  isAdmin: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot create an admin",
      });
    }
    const cacheKey = CacheKeys.admin(ctx.userId);
    const cached = ctx.cache.get<{
      isAdmin: boolean;
      role: string | null;
      permissions: string[];
    }>(cacheKey);
    if (cached) return cached;

    if (!ctx.db) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Cannot cache the admin",
      });
    }
    const admin = await (ctx.db as DrizzleDB).query.admins.findFirst({
      where: and(
        eq(admins.userId, ctx.userId as string),
        eq(admins.isActive, true),
      ),
    });

    const result = {
      isAdmin: !!admin,
      role: admin?.role || null,
      permissions: admin?.permissions || [],
    };

    ctx.cache.set(cacheKey, result, 60);

    return result;
  }),

  analyticsOverview: isAdmin.query(async ({ ctx }) => {
    // The analytics page polls this every 5s and leaves it open all weekend.
    // Five uncached aggregates per poll per open dashboard is a standing load
    // for numbers nobody watches change second by second; a 15s entry means at
    // most one round of aggregates per 15s no matter how many tabs are up.
    const cacheKey = "admin:analytics-overview";
    const cached = ctx.cache.get<{
      totalParticipants: number;
      totalEvents: number;
      totalHackathons: number;
      checkinsToday: number;
    }>(cacheKey);
    if (cached !== null) return cached;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      participantsResult,
      eventsResult,
      hackathonsResult,
      badgeScansResult,
      doorCheckinsResult,
    ] = await Promise.all([
      (ctx.db as DrizzleDB)
        .select({ count: count() })
        .from(hackathonParticipants),
      (ctx.db as DrizzleDB).select({ count: count() }).from(events),
      (ctx.db as DrizzleDB)
        .select({ count: count() })
        .from(hackathons)
        .where(inArray(hackathons.status, ["open", "in_progress"])),
      // This dashboard covers both domains, and a QR scan lands in a different
      // table depending on which one it came from: hackathon badge scans in
      // hackathonEventAttendees, club door check-ins in eventCheckIns.
      (ctx.db as DrizzleDB)
        .select({ count: count() })
        .from(hackathonEventAttendees)
        .where(gte(hackathonEventAttendees.checkedInAt, startOfToday)),
      (ctx.db as DrizzleDB)
        .select({ count: count() })
        .from(eventCheckIns)
        .where(gte(eventCheckIns.checkedInAt, startOfToday)),
    ]);

    const result = {
      totalParticipants: participantsResult[0]?.count ?? 0,
      totalEvents: eventsResult[0]?.count ?? 0,
      totalHackathons: hackathonsResult[0]?.count ?? 0,
      checkinsToday:
        (badgeScansResult[0]?.count ?? 0) + (doorCheckinsResult[0]?.count ?? 0),
    };

    ctx.cache.set(cacheKey, result, 15);

    return result;
  }),

  list: isAdmin.query(async ({ ctx }) => {
    const fetchAdmins = () =>
      (ctx.db as DrizzleDB).query.admins.findMany({
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: (admins, { desc }) => [desc(admins.createdAt)],
        limit: 100,
      });

    const cacheKey = `admins:list`;
    const cached =
      ctx.cache.get<Awaited<ReturnType<typeof fetchAdmins>>>(cacheKey);
    if (cached) return cached;

    const allAdmins = await fetchAdmins();
    ctx.cache.set(cacheKey, allAdmins, 60);

    return allAdmins;
  }),

  create: isSuperAdmin
    .input(
      z.object({
        userId: z.string().min(1).max(255),
        role: z.enum(["super_admin", "admin", "moderator"]),
        permissions: z.array(z.string().max(100)).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Parallel check: user exists AND not already admin
      const [user, existingAdmin] = await Promise.all([
        (ctx.db as DrizzleDB).query.users.findFirst({
          where: eq(users.id, input.userId),
          columns: { id: true },
        }),
        (ctx.db as DrizzleDB).query.admins.findFirst({
          where: eq(admins.userId, input.userId),
          columns: { id: true },
        }),
      ]);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      if (existingAdmin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already an admin",
        });
      }

      const result = await (ctx.db as DrizzleDB)
        .insert(admins)
        .values({
          userId: input.userId,
          role: input.role,
          permissions: input.permissions || [],
        })
        .returning();

      const newAdmin = result[0];
      if (!newAdmin) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create admin",
        });
      }

      // Invalidate admin caches after creation
      ctx.cache.deletePattern(`${CacheKeys.admin(input.userId)}*`);
      ctx.cache.delete(`admins:list`);
      invalidatePortalContext(input.userId);

      return newAdmin;
    }),

  update: isSuperAdmin
    .input(
      z.object({
        adminId: z.string().uuid(),
        role: z.enum(["super_admin", "admin", "moderator"]).optional(),
        permissions: z.array(z.string().max(100)).max(50).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const targetAdmin = await (ctx.db as DrizzleDB).query.admins.findFirst({
        where: eq(admins.id, input.adminId),
      });

      if (!targetAdmin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Admin not found" });
      }
      if (targetAdmin.userId === ctx.userId && input.isActive === false) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot deactivate your own admin account",
        });
      }

      // Only a super admin can hand the role back out, so demoting the last
      // one locks the org out of admin management with no in-app recovery.
      if (
        targetAdmin.role === "super_admin" &&
        input.role &&
        input.role !== "super_admin"
      ) {
        const superAdmins = await (ctx.db as DrizzleDB).query.admins.findMany({
          where: and(eq(admins.role, "super_admin"), eq(admins.isActive, true)),
          columns: { id: true },
        });

        if (!superAdmins.some((other) => other.id !== targetAdmin.id)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot demote the last super admin",
          });
        }
      }

      const result = await (ctx.db as DrizzleDB)
        .update(admins)
        .set({
          role: input.role,
          permissions: input.permissions,
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(eq(admins.id, input.adminId))
        .returning();

      const updatedAdmin = result[0];
      if (!updatedAdmin) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update admin",
        });
      }

      // Bust the affected user's admin cache so next request re-checks
      ctx.cache.deletePattern(`${CacheKeys.admin(targetAdmin.userId)}*`);
      ctx.cache.delete(`admins:list`);
      invalidatePortalContext(targetAdmin.userId);

      return updatedAdmin;
    }),

  remove: isSuperAdmin
    .input(z.object({ adminId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const targetAdmin = await (ctx.db as DrizzleDB).query.admins.findFirst({
        where: eq(admins.id, input.adminId),
      });

      if (!targetAdmin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Admin not found" });
      }
      if (targetAdmin.userId === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot remove your own admin account",
        });
      }

      await (ctx.db as DrizzleDB)
        .delete(admins)
        .where(eq(admins.id, input.adminId));

      ctx.cache.deletePattern(`${CacheKeys.admin(targetAdmin.userId)}*`);
      ctx.cache.delete(`admins:list`);
      invalidatePortalContext(targetAdmin.userId);

      return { success: true };
    }),
});
