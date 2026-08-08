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
import { isStaffRole } from "../types/portal-context";
import type { Context } from "../context";

/**
 * Admin check for a publicProcedure that widens its response for staff.
 *
 * Unlike the isAdmin middleware below, this caches the NEGATIVE answer too.
 * Ordinary participants are the overwhelming majority of signed-in callers on
 * the public endpoints that use this (hackathon.list, hackathon.projects), and
 * caching only the positive turned every one of their requests into an
 * `admins` round-trip that the response cache used to avoid entirely.
 */
export const callerIsAdmin = async (ctx: Context) => {
  if (!ctx.userId || !ctx.db) return false;

  const cacheKey = `${CacheKeys.admin(ctx.userId)}:is-admin`;
  const cached = ctx.cache.get<boolean>(cacheKey);
  if (cached !== null) return cached;

  const admin = await ctx.db.query.admins.findFirst({
    where: and(eq(admins.userId, ctx.userId), eq(admins.isActive, true)),
  });

  const isStaff = !!admin && admin.role !== "volunteer";

  ctx.cache.set(cacheKey, isStaff, 60);

  return isStaff;
};


/**
 * Loads the caller's active admin row, cached 60s per user.
 *
 * Shared by isScanner and isAdmin so a check-in station and a staff action
 * cost the same single lookup.
 */
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

  return admin;
};

/**
 * Anyone staffing the event, volunteers included.
 *
 * Scoped to badge scanning and its undo. A 2000-person event runs several
 * check-in stations, and the people on them should not need the role that can
 * delete the hackathon and cascade every participant, team and vote with it.
 */
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

/**
 * Full staff. Volunteers are deliberately rejected here — they hold an admins
 * row, so without the role check they would pass every admin gate in the API.
 * Result is cached for 60s per user to avoid a DB round-trip on every request.
 */
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

/**
 * Middleware that verifies the current user is a super admin.
 * Must be used after isAdmin.
 */
export const isSuperAdmin = isAdmin.use(async ({ ctx, next }) => {
  if (ctx.admin.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super admin access required",
    });
  }
  return next({ ctx });
});

/**
 * Verifies the caller runs club initiatives.
 *
 * Not scoped to a hackathon: the club and the hackathon are separate aspects,
 * and leading is a standing appointment rather than something re-granted every
 * edition. It used to resolve the current edition first, which meant the gate
 * refused every leader outright whenever no hackathon row existed — a club
 * with no event scheduled had no project leaders at all.
 *
 * Admins pass without a project_leader row: staff cover for a leader who has
 * gone quiet. The reverse is deliberately not true — this grants nothing under
 * isAdmin. Holding the role is only half the gate; every procedure that touches
 * one initiative also checks who leads it, and an admin is the only caller
 * allowed to skip that.
 */
export const isProjectLeader = protectedProcedure.use(async ({ ctx, next }) => {
  const db = ctx.db as NonNullable<typeof ctx.db>;
  const userId = ctx.userId as string;

  const cacheKey = `${CacheKeys.projectLeader(userId)}:role`;
  let leader = ctx.cache.get<typeof projectLeaders.$inferSelect>(cacheKey);

  if (!leader) {
    leader =
      (await db.query.projectLeaders.findFirst({
        where: and(
          eq(projectLeaders.userId, userId),
          eq(projectLeaders.isActive, true),
        ),
      })) ?? null;

    if (leader) ctx.cache.set(cacheKey, leader, 60);
  }

  // Resolved even when a leader row exists: somebody can be both, and the
  // ownership checks downstream need to know whether to let them past another
  // leader's initiative. callerIsAdmin caches both answers, so this is cheap.
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
      projectLeader: leader ?? null,
      isPlatformAdmin,
    },
  });
});

/**
 * Middleware that verifies the current user is an active judge for a specific hackathon.
 * Result is cached for 60s per user per hackathon to avoid a DB round-trip on every request.
 */
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
  // single definition of "the current hackathon" — the edition actually
  // running, and only once nothing is running the newest one. Ordering by start
  // date alone picks next year's draft the day staff create it, which would
  // authorize this judge against an edition they were never assigned to.
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
});
