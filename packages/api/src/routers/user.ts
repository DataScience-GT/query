import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, uploadProcedure } from "../trpc";
import { users, userProfiles } from "@query/db";
import { eq } from "drizzle-orm";
import { CacheKeys } from "../middleware/cache";
import type { DrizzleDB } from "@query/db";
import { fetchPortalContext } from "../services/portal-context";

// z.string().url() is backed by new URL(), which accepts any scheme — a stored
// data: or javascript: URI is handed straight back to whoever renders it.
// The settings form resubmits every field it holds on each save, so this is a
// denylist of the schemes that execute rather than an http(s) allowlist: an
// allowlist would let one legacy mailto:/ftp: entry block edits to every other
// field, with no way for the owner to get out of it.
const EXECUTABLE_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];
// Parsing rather than pattern-matching the scheme: the URL parser drops the
// embedded tabs/newlines a browser would also ignore in "java\nscript:".
const hasSafeScheme = (value: string) => {
  try {
    return !EXECUTABLE_SCHEMES.includes(new URL(value).protocol.toLowerCase());
  } catch {
    return false;
  }
};
const SAFE_URL_MESSAGE = "URL scheme is not allowed";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = CacheKeys.userProfile(ctx.userId as string);
    const cached = ctx.cache.get<{
      id: string;
      email: string | null;
      name: string | null;
      image: string | null;
      bio: string | null | undefined;
      website: string | null | undefined;
      location: string | null | undefined;
    }>(cacheKey);
    if (cached) return cached;

    const user = await (
      ctx.db as NonNullable<typeof ctx.db>
    ).query.users.findFirst({
      where: eq(users.id, ctx.userId as string),
      columns: { id: true, email: true, name: true, image: true },
      with: {
        profile: {
          columns: { bio: true, website: true, location: true },
        },
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    const result = {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      bio: user.profile?.bio,
      website: user.profile?.website,
      location: user.profile?.location,
    };

    ctx.cache.set(cacheKey, result, 120);
    return result;
  }),

  getPortalContext: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId as string;
    const cacheKey = CacheKeys.portalContext(userId);
    const cached = ctx.cache.get<Awaited<ReturnType<typeof fetchPortalContext>>>(
      cacheKey,
    );
    if (cached) return cached;

    if (!ctx.db) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Database unavailable",
      });
    }

    const result = await fetchPortalContext(ctx.db as DrizzleDB, userId);
    ctx.cache.set(cacheKey, result, 300);
    return result;
  }),

  updateProfile: protectedProcedure
    .input(
      z
        .object({
          name: z.string().min(1).max(100).optional(),
          image: z
            .string()
            .url()
            .refine(hasSafeScheme, SAFE_URL_MESSAGE)
            .optional(),
          bio: z.string().max(500).optional(),
          // "" is how the client says "clear this", so it has to get past url().
          website: z
            .string()
            .url()
            .max(500)
            .refine(hasSafeScheme, SAFE_URL_MESSAGE)
            .or(z.literal(""))
            .optional(),
          location: z.string().max(200).optional(),
        })
        .refine(
          (fields) => Object.values(fields).some((v) => v !== undefined),
          {
            message: "At least one field must be provided",
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const { name, image, bio, website, location } = input;

      // Run user update and profile upsert in parallel when both are needed
      const ops: Promise<unknown>[] = [];

      if (name !== undefined || image !== undefined) {
        ops.push(
          (ctx.db as NonNullable<typeof ctx.db>)
            .update(users)
            .set({ name, image })
            .where(eq(users.id, ctx.userId as string)),
        );
      }

      if (
        bio !== undefined ||
        website !== undefined ||
        location !== undefined
      ) {
        // Use upsert instead of check-then-insert (eliminates one round-trip)
        ops.push(
          (ctx.db as NonNullable<typeof ctx.db>)
            .insert(userProfiles)
            .values({ userId: ctx.userId as string, bio, website, location })
            .onConflictDoUpdate({
              target: userProfiles.userId,
              set: {
                bio: bio ?? undefined,
                website: website ?? undefined,
                location: location ?? undefined,
                updatedAt: new Date(),
              },
            }),
        );
      }

      await Promise.all(ops);

      ctx.cache.deletePattern(`user:${ctx.userId as string}*`);

      return { success: true };
    }),

  updateProfileImage: uploadProcedure
    .input(
      z.object({
        base64Image: z
          .string()
          .regex(
            /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/]+={0,2}$/,
            "Invalid image format",
          )
          .max(2 * 1024 * 1024),
      }),
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
        const { imageSize } = await import("image-size");
        const dimensions = imageSize(buffer);
        if (!dimensions.width || !dimensions.height) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid image dimensions. File may be corrupt.",
          });
        }
        if (dimensions.width > 2000 || dimensions.height > 2000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Image dimensions exceed the maximum allowed size of 2000x2000 pixels.",
          });
        }
        const allowedTypes = ["jpg", "jpeg", "png", "webp"];
        if (!dimensions.type || !allowedTypes.includes(dimensions.type)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Malicious payload detected: File signature does not match expected image formats.",
          });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not parse image. File may be corrupt or malicious.",
        });
      }

      await (ctx.db as NonNullable<typeof ctx.db>)
        .update(users)
        .set({ image: input.base64Image })
        .where(eq(users.id, ctx.userId as string));

      ctx.cache.deletePattern(`user:${ctx.userId as string}*`);

      return { success: true };
    }),
});
