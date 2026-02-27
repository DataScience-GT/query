import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, uploadProcedure } from "../trpc";
import { users, userProfiles } from "@query/db";
import { eq } from "drizzle-orm";
import { imageSize } from "image-size";

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
      website: user.profile?.website,
      location: user.profile?.location,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100).optional(),
        image: z.string().url().optional(),
        bio: z.string().max(500).optional(),
        website: z.string().url().max(500).optional(),
        location: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.name !== undefined || input.image !== undefined) {
        await ctx.db!
          .update(users)
          .set({
            name: input.name,
            image: input.image,
          })
          .where(eq(users.id, ctx.userId!));
      }
      if (input.bio !== undefined || input.website !== undefined || input.location !== undefined) {
        const existingProfile = await ctx.db!.query.userProfiles.findFirst({
          where: eq(userProfiles.userId, ctx.userId!),
        });

        if (existingProfile) {
          await ctx.db!
            .update(userProfiles)
            .set({
              bio: input.bio !== undefined ? input.bio : existingProfile.bio,
              website: input.website !== undefined ? input.website : existingProfile.website,
              location: input.location !== undefined ? input.location : existingProfile.location,
              updatedAt: new Date(),
            })
            .where(eq(userProfiles.userId, ctx.userId!));
        } else {
          await ctx.db!.insert(userProfiles).values({
            userId: ctx.userId!,
            bio: input.bio,
            website: input.website,
            location: input.location,
          });
        }
      }

      const updatedUser = await ctx.db!.query.users.findFirst({
        where: eq(users.id, ctx.userId!),
        with: {
          profile: true,
        },
      });

      ctx.cache.deletePattern(`user:${ctx.userId}*`);
      ctx.cache.deletePattern(`query:user.*:${ctx.userId}`);

      return { success: true, user: updatedUser };
    }),

  updateProfileImage: uploadProcedure
    .input(
      z.object({
        base64Image: z.string()
          .regex(/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/]+={0,2}$/, "Invalid image format")
          .max(2 * 1024 * 1024), // Approx 2MB
      })
    )
    .mutation(async ({ ctx, input }) => {
      const base64Data = input.base64Image.split(",")[1];
      if (!base64Data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid base64 payload",
        });
      }

      const buffer = Buffer.from(base64Data, "base64");

      try {
        const dimensions = imageSize(buffer);
        if (!dimensions.width || !dimensions.height) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid image dimensions. File may be corrupt.",
          });
        }

        // Prevent image bombs: 2000x2000 max resolution
        if (dimensions.width > 2000 || dimensions.height > 2000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Image dimensions exceed the maximum allowed size of 2000x2000 pixels.",
          });
        }

        // Validate image type using image-size instead of manual magic bytes
        const allowedTypes = ['jpg', 'jpeg', 'png', 'webp'];
        if (!dimensions.type || !allowedTypes.includes(dimensions.type)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Malicious payload detected: File signature does not match expected image formats.",
          });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not parse image. File may be corrupt or malicious.",
        });
      }

      await ctx.db!
        .update(users)
        .set({
          image: input.base64Image,
        })
        .where(eq(users.id, ctx.userId!));

      ctx.cache.deletePattern(`user:${ctx.userId}*`);
      ctx.cache.deletePattern(`query:user.*:${ctx.userId}`);

      return { success: true };
    }),
});