import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { admins, users } from "@query/db";
import { eq, and } from "drizzle-orm";
import { CacheKeys } from "../middleware/cache";

const isAdmin = protectedProcedure.use(async ({ ctx, next }) => {
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

const isSuperAdmin = isAdmin.use(async ({ ctx, next }) => {
  if (ctx.admin.role !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super admin access required",
    });
  }
  return next({ ctx });
});

export const adminRouter = createTRPCRouter({
  isAdmin: protectedProcedure.query(async ({ ctx }) => {
    // Check cache first
    const cacheKey = CacheKeys.admin(ctx.userId!);
    const cached = ctx.cache.get<{
      isAdmin: boolean;
      role: string | null;
      permissions: string[];
    }>(cacheKey);
    if (cached) return cached;

    const admin = await ctx.db!.query.admins.findFirst({
      where: and(
        eq(admins.userId, ctx.userId!),
        eq(admins.isActive, true)
      ),
    });

    const result = {
      isAdmin: !!admin,
      role: admin?.role || null,
      permissions: admin?.permissions || [],
    };

    // Cache for 60 seconds
    ctx.cache.set(cacheKey, result, 60);

    return result;
  }),

  list: isAdmin.query(async ({ ctx }) => {
    const allAdmins = await ctx.db!.query.admins.findMany({
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

    return allAdmins;
  }),

  create: isSuperAdmin
    .input(
      z.object({
        userId: z.string().min(1).max(255),
        role: z.enum(["super_admin", "admin", "moderator"]),
        permissions: z.array(z.string().max(100)).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db!.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const existingAdmin = await ctx.db!.query.admins.findFirst({
        where: eq(admins.userId, input.userId),
      });

      if (existingAdmin) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already an admin",
        });
      }

      const result = await ctx.db!
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
          message: "cannot create",
        });
      }

      return newAdmin;
    }),

  update: isSuperAdmin
    .input(
      z.object({
        adminId: z.string().uuid(),
        role: z.enum(["super_admin", "admin", "moderator"]).optional(),
        permissions: z.array(z.string().max(100)).max(50).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetAdmin = await ctx.db!.query.admins.findFirst({
        where: eq(admins.id, input.adminId),
      });

      if (!targetAdmin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Admin not found",
        });
      }
      if (targetAdmin.userId === ctx.userId && input.isActive === false) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "why?",
        });
      }

      const result = await ctx.db!
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
          message: "couldnt update",
        });
      }

      return updatedAdmin;
    }),

  remove: isSuperAdmin
    .input(z.object({ adminId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const targetAdmin = await ctx.db!.query.admins.findFirst({
        where: eq(admins.id, input.adminId),
      });

      if (!targetAdmin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "not located",
        });
      }

      if (targetAdmin.userId === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "why are you trying to do this",
        });
      }

      await ctx.db!.delete(admins).where(eq(admins.id, input.adminId));

      return { success: true };
    }),
});