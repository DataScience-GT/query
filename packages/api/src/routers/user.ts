import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { users } from "@query/db";
import { eq } from "@query/db";

export const userRouter = createTRPCRouter({
  // Get current authenticated user (protected)
  me: protectedProcedure.query(async ({ ctx }) => {
    // ctx.userId is guaranteed to exist in protected procedures
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId!),
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
    };
  }),

  // Get all users (public, for demo - in production you'd protect this)
  list: publicProcedure.query(async ({ ctx }) => {
    const allUsers = await ctx.db.query.users.findMany({
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
      },
    });

    return allUsers;
  }),

  // Get user by ID (public)
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.id),
        columns: {
          id: true,
          email: true,
          name: true,
          image: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return user;
    }),

  // Update user profile (protected)
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        image: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updatedUser] = await ctx.db
        .update(users)
        .set({
          name: input.name,
          image: input.image,
        })
        .where(eq(users.id, ctx.userId!))
        .returning();

      return {
        success: true,
        user: updatedUser,
      };
    }),

  // Delete own account (protected)
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(users).where(eq(users.id, ctx.userId!));

    return {
      success: true,
      message: "Account deleted successfully",
    };
  }),

  // Get user stats (protected)
  stats: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.userId!),
    });

    const totalUsers = await ctx.db.query.users.findMany();

    return {
      accountCreated: user?.emailVerified || new Date(),
      totalUsers: totalUsers.length,
      userId: ctx.userId,
    };
  }),
});