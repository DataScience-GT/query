import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { users, userProfiles } from "@query/db";
import { eq } from "drizzle-orm";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db!.query.users.findFirst({
      where: eq(users.id, ctx.userId!),
      with: {
        profile: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found"
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      bio: user.profile?.bio,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        image: z.string().url().optional(),
        bio: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Update user name/image if provided
      if (input.name !== undefined || input.image !== undefined) {
        await ctx.db!
          .update(users)
          .set({
            name: input.name,
            image: input.image,
          })
          .where(eq(users.id, ctx.userId!));
      }
      if (input.bio !== undefined) {
        const existingProfile = await ctx.db!.query.userProfiles.findFirst({
          where: eq(userProfiles.userId, ctx.userId!),
        });

        if (existingProfile) {
          await ctx.db!
            .update(userProfiles)
            .set({
              bio: input.bio,
              updatedAt: new Date(),
            })
            .where(eq(userProfiles.userId, ctx.userId!));
        } else {
          await ctx.db!.insert(userProfiles).values({
            userId: ctx.userId!,
            bio: input.bio,
          });
        }
      }

      const updatedUser = await ctx.db!.query.users.findFirst({
        where: eq(users.id, ctx.userId!),
        with: {
          profile: true,
        },
      });

      // Invalidate user cache
      ctx.cache.deletePattern(`user:${ctx.userId}*`);
      ctx.cache.deletePattern(`query:user.*:${ctx.userId}`);

      return { success: true, user: updatedUser };
    }),
});