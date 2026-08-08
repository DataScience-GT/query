import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
// membershipHistory is written by createOrUpdateMembership on a real payment,
// not here: `register` no longer grants a term, so it has nothing to record.
import { members } from "@query/db";
import { eq, and } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import {
  clearMembershipCaches,
  invalidatePortalContext,
} from "../middleware/cache";

// Letters from every script, plus the combining marks, spaces, hyphens and
// apostrophes (straight and typographic) that real names are written with.
const nameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{M}\s'’-]+$/u, "Invalid name format");
const urlSchema = z.string().url().max(500).optional();
const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number")
  .optional();

export const memberRouter = createTRPCRouter({
  me: protectedProcedure
    .query(async ({ ctx }) => {
      const cacheKey = `member:me:${ctx.userId}`;
      const cached = ctx.cache.get<typeof member>(cacheKey);
      if (cached) return cached;

      const member = await (ctx.db as DrizzleDB).query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
      });

      const result = member ?? null;
      ctx.cache.set(cacheKey, result, 60);
      return result;
    }),

  register: protectedProcedure
    .input(
      z.object({
        firstName: nameSchema,
        lastName: nameSchema,
        phoneNumber: phoneSchema,
        school: z.string().min(1).max(200).optional(),
        major: z.string().min(1).max(200).optional(),
        graduationYear: z.number().int().min(2024).max(2035).optional(),
        skills: z.array(z.string().max(50)).max(20).optional(),
        interests: z.array(z.string().max(50)).max(20).optional(),
        linkedinUrl: urlSchema,
        githubUrl: urlSchema,
        portfolioUrl: urlSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existingMember = await (
        ctx.db as DrizzleDB
      ).query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
      });

      if (existingMember) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have a member profile",
        });
      }

      /**
       * This writes a PROFILE, not a membership.
       *
       * It used to stamp `membershipEndDate = now + 1 year` and let the column
       * default `isActive` to true, which handed any signed-in caller a full
       * paid-tier membership over tRPC for nothing — the same hole the comment
       * below records for the deleted `renew` endpoint. A membership is one
       * paid year and `createOrUpdateMembership`, driven by a completed
       * payment, is the only thing that may set a term.
       *
       * `membershipStartDate` is not null in the schema, so it carries when the
       * profile was created. It grants nothing on its own: `isActive` is false
       * and `membershipEndDate` is null, and both `checkStatus` and
       * `buildMemberContext` require an unexpired end date.
       */
      const result = await (ctx.db as DrizzleDB)
        .insert(members)
        .values({
          userId: ctx.userId!,
          memberType: "new",
          firstName: input.firstName,
          lastName: input.lastName,
          phoneNumber: input.phoneNumber,
          school: input.school,
          major: input.major,
          graduationYear: input.graduationYear,
          skills: input.skills || [],
          interests: input.interests || [],
          linkedinUrl: input.linkedinUrl,
          githubUrl: input.githubUrl,
          portfolioUrl: input.portfolioUrl,
          membershipStartDate: new Date(),
          membershipEndDate: null,
          isActive: false,
        })
        .returning();

      const newMember = result[0];

      if (!newMember) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create member",
        });
      }

      // No membershipHistory "joined" row either: nothing was joined until a
      // payment lands, and createOrUpdateMembership is what records that.

      invalidatePortalContext(ctx.userId!);

      return newMember;
    }),

  /**
   * Renewal is not an endpoint. A membership is one paid year, and the only
   * thing that extends it is a completed payment through the portal, which
   * runs createOrUpdateMembership in @query/db. A free renew procedure lived
   * here and, being a plain protectedProcedure, let any signed-in user grant
   * themselves another year over tRPC without paying.
   */

  update: protectedProcedure
    .input(
      z.object({
        firstName: nameSchema.optional(),
        lastName: nameSchema.optional(),
        phoneNumber: phoneSchema,
        school: z.string().min(1).max(200).optional(),
        major: z.string().min(1).max(200).optional(),
        graduationYear: z.number().int().min(2024).max(2035).optional(),
        skills: z.array(z.string().max(50)).max(20).optional(),
        interests: z.array(z.string().max(50)).max(20).optional(),
        linkedinUrl: urlSchema,
        githubUrl: urlSchema,
        portfolioUrl: urlSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const member = await (ctx.db as DrizzleDB).query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      const result = await (ctx.db as DrizzleDB)
        .update(members)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(members.id, member.id))
        .returning();

      const updatedMember = result[0];

      if (!updatedMember) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update member",
        });
      }

      // `me` caches for 60s; without this the form saves and re-reads the old
      // values, which is indistinguishable from the save having failed.
      clearMembershipCaches(ctx.userId!);

      return updatedMember;
    }),

  list: publicProcedure
    .input(
      z.object({
        memberType: z.enum(["new", "continuous"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(10000).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cacheKey = `members:list:${input.memberType || "all"}:${input.limit}:${input.offset}`;
      const cached = ctx.cache.get<typeof allMembers>(cacheKey);
      if (cached) return cached;

      const allMembers = await (ctx.db as DrizzleDB).query.members.findMany({
        where: and(
          eq(members.isActive, true),
          input.memberType
            ? eq(members.memberType, input.memberType)
            : undefined,
        ),
        limit: input.limit,
        offset: input.offset,
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          school: true,
          major: true,
          skills: true,
          interests: true,
          joinedAt: true,
          memberType: true,
          phoneNumber: false,
        },
      });

      ctx.cache.set(cacheKey, allMembers, 60);

      return allMembers;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const member = await (ctx.db as DrizzleDB).query.members.findFirst({
        where: eq(members.id, input.id),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          school: true,
          major: true,
          skills: true,
          interests: true,
          joinedAt: true,
          memberType: true,
          phoneNumber: false,
        },
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      return member;
    }),

  history: protectedProcedure
    .query(async ({ ctx }) => {
      const member = await (ctx.db as DrizzleDB).query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
        columns: { id: true },
        with: {
          membershipHistory: {
            orderBy: (h, { desc }) => [desc(h.createdAt)],
            limit: 50,
          },
        },
      });

      if (!member) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }

      return member.membershipHistory;
    }),

  checkStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const cacheKey = `member:status:${ctx.userId}`;
      const cached = ctx.cache.get<{
        isMember: boolean;
        isActive: boolean;
        hasLapsed: boolean;
        expiresAt: Date | null;
        daysRemaining: number | null;
        memberType: string | null;
        renewalCount: number;
      }>(cacheKey);
      if (cached) return cached;

      const member = await (ctx.db as DrizzleDB).query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
      });

      if (!member) {
        const result = {
          isMember: false,
          isActive: false,
          hasLapsed: false,
          expiresAt: null,
          daysRemaining: null,
          memberType: null,
          renewalCount: 0,
        };
        ctx.cache.set(cacheKey, result, 30);
        return result;
      }

      const now = new Date();
      const expiresAt = member.membershipEndDate;
      const isActive = Boolean(member.isActive && expiresAt && expiresAt > now);

      let daysRemaining: number | null = null;
      if (expiresAt) {
        daysRemaining = Math.ceil(
          (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      const result = {
        // Paid and unexpired. A profile row with no payment, and a row whose
        // year has run out, both answer false — the same rule the portal
        // context uses, so the two can never disagree.
        isMember: isActive,
        isActive,
        // Same rule as buildMemberContext: ran out, not revoked.
        hasLapsed: !isActive && Boolean(expiresAt) && expiresAt! <= now,
        memberType: member.memberType,
        expiresAt,
        daysRemaining,
        renewalCount: member.renewalCount,
      };

      ctx.cache.set(cacheKey, result, 30);

      return result;
    }),

});
