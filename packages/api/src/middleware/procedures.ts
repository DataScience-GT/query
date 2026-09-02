import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";
import {
  admins,
  judges,
  judgingProjects,
  judgeQueue,
  projectLeaders,
} from "@query/db";
import { eq, and } from "drizzle-orm";
import { CacheKeys } from "./cache";
import { resolveHackathonId } from "../services/portal-context";
import { isStaffRole, isExpiredAdmin } from "../types/portal-context";
import type { Context } from "../context";

// Admin check for a publicProcedure that widens its response for staff.
// Unlike the isAdmin middleware, this caches the NEGATIVE answer too:
// ordinary participants are the overwhelming majority of signed-in callers on
// hackathon.list and hackathon.projects, and caching only the positive turned
// every one of their requests into an `admins` round trip.
export const callerIsAdmin = async (ctx: Context) => {
  if (!ctx.userId || !ctx.db) return false;

  const cacheKey = `${CacheKeys.admin(ctx.userId)}:is-admin`;
  const cached = ctx.cache.get<boolean>(cacheKey);
  if (cached !== null) return cached;

  const admin = await ctx.db.query.admins.findFirst({
    where: and(eq(admins.userId, ctx.userId), eq(admins.isActive, true)),
  });

  const isStaff =
    !!admin && admin.role !== "volunteer" && !isExpiredAdmin(admin);

  ctx.cache.set(cacheKey, isStaff, 60);

  return isStaff;
};


// Loads the caller's active admin row, cached 60s per user. Shared by
// isScanner and isAdmin so a check-in station and a staff action cost the
// same single lookup.
const loadAdminRow = async (ctx: Context) => {
  const cacheKey = `${CacheKeys.admin(ctx.userId as string)}:role`;
  let admin = ctx.cache.get<typeof admins.$inferSelect>(cacheKey);

  if (!admin) {
    admin =
      (await (ctx.db as NonNullable<typeof ctx.db>).query.admins.findFirst({
        where: and(
          eq(admins.userId, ctx.userId as string),
          eq(admins.isActive, true),
        ),
      })) ?? null;

    if (admin) ctx.cache.set(cacheKey, admin, 60);
  }

  // Applied after the cache read too: a fixed term can lapse inside the 60s
  // window the row is held for.
  if (isExpiredAdmin(admin)) return null;

  return admin;
};

// Anyone staffing the event, volunteers included. Scoped to badge scanning
// and its undo: a 2000-person event runs several check-in stations, and those
// people should not hold the role that can delete the hackathon.
export const isScanner = protectedProcedure.use(async ({ ctx, next }) => {
  const admin = await loadAdminRow(ctx);

  if (!admin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Event staff access required",
    });
  }

  return next({ ctx: { ...ctx, admin } });
});

// Full staff. Volunteers are rejected here — they hold an admins row, so
// without the role check they would pass every admin gate in the API. Cached
// 60s per user to avoid a round trip on every request.
export const isAdmin = protectedProcedure.use(async ({ ctx, next }) => {
  const admin = await loadAdminRow(ctx);

  if (!admin || !isStaffRole(admin.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({ ctx: { ...ctx, admin } });
});

// Super admin. Must be used after isAdmin.
export const isSuperAdmin = isAdmin.use(async ({ ctx, next }) => {
  if (ctx.admin.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super admin access required",
    });
  }
  return next({ ctx });
});

// Verifies the caller runs club initiatives. Not scoped to a hackathon:
// leading is a standing appointment, and resolving the current edition first
// meant the gate refused every leader whenever no hackathon row existed.
// Admins pass without a project_leader row, since staff cover for a leader
// who has gone quiet; the reverse is not true. Holding the role is half the
// gate — every procedure also checks who leads that initiative, and an admin
// is the only caller allowed to skip it.
export const isProjectLeader = protectedProcedure.use(async ({ ctx, next }) => {
  const db = ctx.db as NonNullable<typeof ctx.db>;
  const userId = ctx.userId as string;

  const cacheKey = `${CacheKeys.projectLeader(userId)}:role`;
  // The absent row is cached too, as `false`. An admin passes this gate
  // without a project_leader row, so every initiative call staff make used to
  // pay a lookup that was never going to return anything. Grants clear
  // `project-leader:<id>*`, which covers the negative as well.
  let leader = ctx.cache.get<typeof projectLeaders.$inferSelect | false>(
    cacheKey,
  );

  if (leader === null) {
    leader =
      (await db.query.projectLeaders.findFirst({
        where: and(
          eq(projectLeaders.userId, userId),
          eq(projectLeaders.isActive, true),
        ),
      })) ?? false;

    ctx.cache.set(cacheKey, leader, 60);
  }

  // Resolved even when a leader row exists: somebody can be both, and the
  // ownership checks downstream need to know whether to let them past another
  // leader's initiative. callerIsAdmin caches both answers.
  const isPlatformAdmin = await callerIsAdmin(ctx);

  if (!leader && !isPlatformAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Project leader access required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      projectLeader: leader || null,
      isPlatformAdmin,
    },
  });
});

// Verifies the caller is an active judge for a specific hackathon. Cached 60s
// per user per hackathon.
export const isJudge = protectedProcedure.use(async ({ ctx, next, getRawInput }) => {
  const db = ctx.db as NonNullable<typeof ctx.db>;

  // Try to resolve hackathonId from rawInput
  const rawInput = await getRawInput();
  let hackathonId: string | undefined;
  if (rawInput && typeof rawInput === "object") {
    const inputObj = rawInput as Record<string, unknown>;
    if (typeof inputObj.hackathonId === "string") {
      hackathonId = inputObj.hackathonId;
    } else if (typeof inputObj.projectId === "string") {
      const project = await db.query.judgingProjects.findFirst({
        where: eq(judgingProjects.id, inputObj.projectId),
        columns: { hackathonId: true },
      });
      hackathonId = project?.hackathonId;
    } else if (typeof inputObj.queueId === "string") {
      const queue = await db.query.judgeQueue.findFirst({
        where: eq(judgeQueue.id, inputObj.queueId),
        columns: { hackathonId: true },
      });
      hackathonId = queue?.hackathonId;
    }
  }

  // Fallback when the input names nothing that resolves. Shares the platform's
  // single definition of "the current hackathon": ordering by start date alone
  // picks next year's draft the day staff create it, which would authorize this
  // judge against an edition they were never assigned to.
  if (!hackathonId) {
    hackathonId = await resolveHackathonId(db);
  }

  if (!hackathonId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No hackathon context found for judging",
    });
  }

  const cacheKey = `${CacheKeys.judge(ctx.userId as string)}:${hackathonId}:role`;
  let judge = ctx.cache.get<typeof judges.$inferSelect>(cacheKey);

  if (!judge) {
    judge =
      (await db.query.judges.findFirst({
        where: and(
          eq(judges.userId, ctx.userId as string),
          eq(judges.hackathonId, hackathonId),
          eq(judges.isActive, true),
        ),
      })) ?? null;

    if (judge) ctx.cache.set(cacheKey, judge, 60);
  }

  if (!judge) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Judge access required for this hackathon",
      });
    }

    return next({ ctx: { ...ctx, judge } });
  },
);
