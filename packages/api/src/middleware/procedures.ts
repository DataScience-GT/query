import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";
import { admins, judges } from "@query/db";
import { eq, and } from "drizzle-orm";
import { CacheKeys } from "./cache";

/**
 * Middleware that verifies the current user is an active admin.
 * Result is cached for 60s per user to avoid a DB round-trip on every request.
 */
export const isAdmin = protectedProcedure.use(async ({ ctx, next }) => {
  const cacheKey = `${CacheKeys.admin(ctx.userId!)}:role`;
  let admin = ctx.cache.get<typeof admins.$inferSelect>(cacheKey);

  if (!admin) {
    admin = await ctx.db!.query.admins.findFirst({
      where: and(
        eq(admins.userId, ctx.userId!),
        eq(admins.isActive, true)
      ),
    }) ?? null;

    if (admin) ctx.cache.set(cacheKey, admin, 60);
  }

  if (!admin) {
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
 * Middleware that verifies the current user is an active judge.
 * Result is cached for 60s per user to avoid a DB round-trip on every request.
 */
export const isJudge = protectedProcedure.use(async ({ ctx, next }) => {
  const cacheKey = `${CacheKeys.judge(ctx.userId!)}:role`;
  let judge = ctx.cache.get<typeof judges.$inferSelect>(cacheKey);

  if (!judge) {
    judge = await ctx.db!.query.judges.findFirst({
      where: and(
        eq(judges.userId, ctx.userId!),
        eq(judges.isActive, true)
      ),
    }) ?? null;

    if (judge) ctx.cache.set(cacheKey, judge, 60);
  }

  if (!judge) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Judge access required",
    });
  }

  return next({ ctx: { ...ctx, judge } });
});
