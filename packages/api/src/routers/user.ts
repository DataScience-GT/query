import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, uploadProcedure } from "../trpc";
import { users, userProfiles } from "@query/db";
import { eq } from "drizzle-orm";
import { CacheKeys } from "../middleware/cache";
import type { DrizzleDB } from "@query/db";
import { fetchPortalContext } from "../services/portal-context";
import { readImageDimensions } from "../services/image-dimensions";

// z.string().url() is backed by new URL(), which accepts any scheme, so a
// stored data: or javascript: URI is handed straight to whoever renders it.
// A denylist of executing schemes rather than an http(s) allowlist: the
// settings form resubmits every field on each save, so an allowlist would let
// one legacy mailto: entry block edits to every other field.
const EXECUTABLE_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];
// Parsing rather than pattern-matching the scheme: the URL parser drops the
// embedded tabs and newlines a browser would also ignore in "java\nscript:".
const hasSafeScheme = (value: string) => {
  try {
    return !EXECUTABLE_SCHEMES.includes(new URL(value).protocol.toLowerCase());
  } catch {
    return false;
  }
};
const SAFE_URL_MESSAGE = "URL scheme is not allowed";

// Subdomains count — cc.gatech.edu is as much a GT address as the bare
// domain. Each label before gatech.edu must be followed by its own dot, which
// is what stops a lookalike like "notgatech.edu" from matching the tail.
const GT_EMAIL_DOMAIN = /@([a-z0-9-]+\.)*gatech\.edu$/;
const GT_EMAIL_MESSAGE = "Must be a gatech.edu address";

// Postgres unique_violation, raised when a gt_email is already on another
// account. Drizzle wraps driver errors, so the SQLSTATE sits on `.cause`.
const isDuplicateGtEmail = (error: unknown) => {
  for (let cursor: unknown = error, depth = 0; cursor && depth < 5; depth++) {
    if (typeof cursor !== "object") break;
    const candidate = cursor as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (candidate.code === "23505") return true;
    if (candidate.constraint?.includes("gt_email")) return true;
    if (candidate.message?.includes("gt_email")) return true;
    cursor = candidate.cause;
  }
  return false;
};

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
      gtEmail: string | null | undefined;
    }>(cacheKey);
    if (cached) return cached;

    const user = await (
      ctx.db as NonNullable<typeof ctx.db>
    ).query.users.findFirst({
      where: eq(users.id, ctx.userId as string),
      columns: { id: true, email: true, name: true, image: true },
      with: {
        profile: {
          columns: {
            bio: true,
            website: true,
            location: true,
            gtEmail: true,
          },
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
      gtEmail: user.profile?.gtEmail,
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
          // Lowercased before the domain check so a typed "@GATECH.EDU" validates and
          // the stored value matches the unique index case-insensitively. "" clears the
          // field, same as website above.
          gtEmail: z
            .string()
            .email()
            .max(255)
            .transform((value) => value.trim().toLowerCase())
            .refine((value) => GT_EMAIL_DOMAIN.test(value), GT_EMAIL_MESSAGE)
            .or(z.literal(""))
            .optional(),
        })
        .refine(
          (fields) => Object.values(fields).some((v) => v !== undefined),
          {
            message: "At least one field must be provided",
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const { name, image, bio, website, location, gtEmail } = input;

      // "" is the client saying clear it, which has to reach the column as NULL — an
      // empty string would occupy the unique index and stop the next person who
      // clears theirs from saving.
      const gtEmailValue =
        gtEmail === undefined ? undefined : gtEmail === "" ? null : gtEmail;

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
        location !== undefined ||
        gtEmailValue !== undefined
      ) {
        // Use upsert instead of check-then-insert (eliminates one round-trip)
        ops.push(
          (ctx.db as NonNullable<typeof ctx.db>)
            .insert(userProfiles)
            .values({
              userId: ctx.userId as string,
              bio,
              website,
              location,
              gtEmail: gtEmailValue,
            })
            .onConflictDoUpdate({
              target: userProfiles.userId,
              set: {
                bio: bio ?? undefined,
                website: website ?? undefined,
                location: location ?? undefined,
                // Not `?? undefined`: null is the clear, and collapsing it would make
                // clearing the field silently do nothing.
                gtEmail: gtEmailValue,
                updatedAt: new Date(),
              },
            }),
        );
      }

      try {
        await Promise.all(ops);
      } catch (error) {
        // The address is on somebody else's account. Saying so is safe — whoever
        // typed it either owns it or is claiming it, and both need to know the save
        // did not happen.
        if (isDuplicateGtEmail(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That Georgia Tech email is already on another account.",
          });
        }
        throw error;
      }

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
        const dimensions = readImageDimensions(buffer);
        if (!dimensions?.width || !dimensions.height) {
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
        const allowedTypes = ["jpeg", "png", "webp"];
        if (!allowedTypes.includes(dimensions.type)) {
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
