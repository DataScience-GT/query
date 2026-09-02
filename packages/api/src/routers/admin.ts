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
  members,
} from "@query/db";
import { eq, and, count, gte, inArray } from "drizzle-orm";
import { CacheKeys, invalidatePortalContext } from "../middleware/cache";
import { isAdmin, isSuperAdmin } from "../middleware/procedures";
import { currentTerm } from "@query/db/services/membership";
import { isExpiredAdmin } from "../types/portal-context";
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

    const expired = isExpiredAdmin(admin);

    const result = {
      isAdmin: !!admin && !expired,
      role: expired ? null : admin?.role || null,
      permissions: expired ? [] : admin?.permissions || [],
    };

    ctx.cache.set(cacheKey, result, 60);

    return result;
  }),

  analyticsOverview: isAdmin.query(async ({ ctx }) => {
    // The analytics page polls this every 5s and stays open all weekend. Five
    // uncached aggregates per poll per tab is a standing load for numbers nobody
    // watches change second by second; a 15s entry caps it at one round per 15s.
    const cacheKey = "admin:analytics-overview";

    // getOrSet, not get/set: one key, every open tab polling it, and five
    // aggregates behind each miss. On a plain miss every tab that polled
    // inside the same tick ran all five, so the entry that exists to cap the
    // load was multiplying it at each expiry instead.
    return await ctx.cache.getOrSet<{
      totalParticipants: number;
      totalEvents: number;
      totalHackathons: number;
      checkinsToday: number;
    }>(
      cacheKey,
      async () => {
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
          // table depending on which: hackathon badge scans in hackathonEventAttendees,
          // club door check-ins in eventCheckIns.
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
            (badgeScansResult[0]?.count ?? 0) +
            (doorCheckinsResult[0]?.count ?? 0),
        };

        return result;
      },
      15,
    );
  }),

  // Membership growth for the Insights page. One pass over the member table
  // instead of a bucket query per month: the club is a few thousand rows, and
  // the cumulative series has to see everything before the window anyway.
  growth: isAdmin.query(async ({ ctx }) => {
    return await ctx.cache.getOrSet<{
      months: {
        month: string;
        joined: number;
        joinedBootcamp: number;
        members: number;
        bootcampMembers: number;
      }[];
      terms: { term: string; enrolled: number }[];
      totals: {
        members: number;
        activeMembers: number;
        bootcampAllTime: number;
        bootcampThisTerm: number;
        currentTerm: string;
      };
    }>(
      "admin:growth",
      async () => {
        const rows = await (ctx.db as DrizzleDB)
          .select({
            createdAt: members.createdAt,
            isActive: members.isActive,
            bootcampMember: members.bootcampMember,
            bootcampTerm: members.bootcampTerm,
          })
          .from(members);

        // UTC throughout: the bucket a member lands in must not depend on which
        // timezone the browser asking happens to be in.
        const monthKey = (date: Date) =>
          `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

        const now = new Date();
        const window: string[] = [];
        for (let back = 11; back >= 0; back--) {
          window.push(
            monthKey(
              new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1),
              ),
            ),
          );
        }
        const firstMonth = window[0] as string;

        const joined = new Map<string, number>();
        const joinedBootcamp = new Map<string, number>();
        const termCounts = new Map<string, number>();

        // Everyone who joined before the window still counts in the running
        // totals; they just have no bar of their own.
        let priorMembers = 0;
        let priorBootcamp = 0;

        for (const row of rows) {
          const key = monthKey(row.createdAt);
          if (key < firstMonth) {
            priorMembers++;
            if (row.bootcampMember) priorBootcamp++;
          } else {
            joined.set(key, (joined.get(key) ?? 0) + 1);
            if (row.bootcampMember) {
              joinedBootcamp.set(key, (joinedBootcamp.get(key) ?? 0) + 1);
            }
          }
          if (row.bootcampTerm) {
            termCounts.set(
              row.bootcampTerm,
              (termCounts.get(row.bootcampTerm) ?? 0) + 1,
            );
          }
        }

        let runningMembers = priorMembers;
        let runningBootcamp = priorBootcamp;
        const months = window.map((month) => {
          const monthJoined = joined.get(month) ?? 0;
          const monthBootcamp = joinedBootcamp.get(month) ?? 0;
          runningMembers += monthJoined;
          runningBootcamp += monthBootcamp;
          return {
            month,
            joined: monthJoined,
            joinedBootcamp: monthBootcamp,
            members: runningMembers,
            bootcampMembers: runningBootcamp,
          };
        });

        const term = currentTerm();

        return {
          months,
          // Newest term first is how the bootcamp page lists them; the chart
          // reverses it so time runs left to right.
          terms: [...termCounts.entries()]
            .map(([value, enrolled]) => ({ term: value, enrolled }))
            .sort((a, b) => a.term.localeCompare(b.term)),
          totals: {
            members: rows.length,
            activeMembers: rows.filter((row) => row.isActive).length,
            bootcampAllTime: rows.filter((row) => row.bootcampMember).length,
            bootcampThisTerm: termCounts.get(term) ?? 0,
            currentTerm: term,
          },
        };
      },
      // Nobody watches a membership curve move minute to minute, and every
      // open tab would otherwise re-scan the member table.
      300,
    );
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
    return await ctx.cache.getOrSet<Awaited<ReturnType<typeof fetchAdmins>>>(
      cacheKey,
      fetchAdmins,
      60,
    );
  }),

  // Finds the person a staff role is about to be granted to, by their exact
  // sign-in address. Exact rather than a prefix search: a partial match list is
  // how the wrong Alex ends up with scanner access, and it also means this
  // cannot enumerate the user table — it confirms an address already known.
  findUserByEmail: isSuperAdmin
    .input(z.object({ email: z.string().trim().email().max(255) }))
    .query(async ({ ctx, input }) => {
      const user = await (ctx.db as DrizzleDB).query.users.findFirst({
        // Stored lowercased by every writer.
        where: eq(users.email, input.email.toLowerCase()),
        columns: { id: true, name: true, email: true, image: true },
      });

      if (!user) return null;

      const existing = await (ctx.db as DrizzleDB).query.admins.findFirst({
        where: eq(admins.userId, user.id),
        columns: { id: true, role: true, isActive: true, expiresAt: true },
      });

      return { ...user, existingRole: existing ?? null };
    }),

  create: isSuperAdmin
    .input(
      z.object({
        userId: z.string().min(1).max(255),
        // "volunteer" is the check-in desk tier: an active admins row that isAdmin
        // deliberately rejects, so it grants badge scanning and nothing else. Without
        // it the only way to staff a scan station is a hand-written INSERT.
        role: z.enum(["super_admin", "admin", "moderator", "volunteer"]),
        permissions: z.array(z.string().max(100)).max(50).optional(),
        // Fixed-term appointment. Omitted means standing, which is what the people
        // who run the club hold.
        expiresAt: z.coerce.date().optional(),
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
          expiresAt: input.expiresAt,
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
        // Same set as create — otherwise an existing admin could be made a volunteer
        // but a volunteer could never be promoted back.
        role: z
          .enum(["super_admin", "admin", "moderator", "volunteer"])
          .optional(),
        permissions: z.array(z.string().max(100)).max(50).optional(),
        isActive: z.boolean().optional(),
        // How a term is renewed or made standing. null clears the end date; omitted
        // leaves it alone.
        expiresAt: z.coerce.date().nullable().optional(),
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

      // Only a super admin can hand the role back out, so demoting the last one
      // locks the org out of admin management with no in-app recovery.
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
          expiresAt: input.expiresAt,
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
