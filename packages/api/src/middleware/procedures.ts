import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../trpc";
import { admins, judges } from "@query/db";
import { eq, and } from "drizzle-orm";

/**
 * Middleware that verifies the current user is an active admin.
 * Adds the admin object to the context.
 */
export const isAdmin = protectedProcedure.use(async ({ ctx, next }) => {
  const admin = await ctx.db!.query.admins.findFirst({
    where: and(
      eq(admins.userId, ctx.userId!),
      eq(admins.isActive, true)
    ),
  });

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
 * Adds the judge object to the context.
 */
export const isJudge = protectedProcedure.use(async ({ ctx, next }) => {
  const judge = await ctx.db!.query.judges.findFirst({
    where: and(
      eq(judges.userId, ctx.userId!),
      eq(judges.isActive, true)
    ),
  });

  if (!judge) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Judge access required",
    });
  }

  return next({ ctx: { ...ctx, judge } });
});
