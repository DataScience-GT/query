import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { members, membershipHistory } from "@query/db";
import { eq, and } from "drizzle-orm";
import { CacheKeys } from "../middleware/cache";

// Validation schemas
const nameSchema = z.string().min(1).max(100).regex(/^[a-zA-Z\s'-]+$/, "Invalid name format");
const urlSchema = z.string().url().max(500).optional();
const phoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number").optional();

export const memberRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const member = await ctx.db.query.members.findFirst({
      where: eq(members.userId, ctx.userId!),
    });

    return member || null;
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingMember = await ctx.db.query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
      });

      if (existingMember) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You are already a member",
        });
      }

      const membershipStartDate = new Date();
      const membershipEndDate = new Date();
      membershipEndDate.setFullYear(membershipEndDate.getFullYear() + 1);

      const result = await ctx.db
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
          membershipStartDate,
          membershipEndDate,
        })
        .returning();

      const newMember = result[0];

      if (!newMember) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create member",
        });
      }

      await ctx.db.insert(membershipHistory).values({
        memberId: newMember.id,
        action: "joined",
        startDate: membershipStartDate,
        endDate: membershipEndDate,
      });

      return newMember;
    }),

  renew: protectedProcedure.mutation(async ({ ctx }) => {
    const member = await ctx.db.query.members.findFirst({
      where: eq(members.userId, ctx.userId!),
    });

    if (!member) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Member not found",
      });
    }

    const newEndDate = new Date(member.membershipEndDate || new Date());
    newEndDate.setFullYear(newEndDate.getFullYear() + 1);

    const result = await ctx.db
      .update(members)
      .set({
        memberType: "continuous",
        membershipEndDate: newEndDate,
        renewalCount: member.renewalCount + 1,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(members.id, member.id))
      .returning();

    const updatedMember = result[0];

    if (!updatedMember) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to renew membership",
      });
    }

    await ctx.db.insert(membershipHistory).values({
      memberId: member.id,
      action: "renewed",
      startDate: member.membershipEndDate || new Date(),
      endDate: newEndDate,
    });

    return updatedMember;
  }),

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.query.members.findFirst({
        where: eq(members.userId, ctx.userId!),
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found",
        });
      }

      const result = await ctx.db
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

      return updatedMember;
    }),

  list: publicProcedure
    .input(
      z.object({
        memberType: z.enum(["new", "continuous"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(10000).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const allMembers = await ctx.db.query.members.findMany({
        where: and(
          eq(members.isActive, true),
          input.memberType ? eq(members.memberType, input.memberType) : undefined
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

      return allMembers;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const member = await ctx.db.query.members.findFirst({
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

  history: protectedProcedure.query(async ({ ctx }) => {
    const member = await ctx.db.query.members.findFirst({
      where: eq(members.userId, ctx.userId!),
    });

    if (!member) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Member not found",
      });
    }

    const history = await ctx.db.query.membershipHistory.findMany({
      where: eq(membershipHistory.memberId, member.id),
      orderBy: (membershipHistory, { desc }) => [desc(membershipHistory.createdAt)],
      limit: 50,
    });

    return history;
  }),

  checkStatus: protectedProcedure.query(async ({ ctx }) => {
    // Check cache first (short TTL since membership status is important)
    const cacheKey = `member:status:${ctx.userId}`;
    const cached = ctx.cache.get<{
      isMember: boolean;
      isActive: boolean | null;
      expiresAt: Date | null;
      daysRemaining: number | null;
      memberType: string | null;
      renewalCount: number;
    }>(cacheKey);
    if (cached) return cached;

    const member = await ctx.db.query.members.findFirst({
      where: eq(members.userId, ctx.userId!),
    });

    if (!member) {
      const result = {
        isMember: false,
        isActive: false,
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
    const isActive = member.isActive && expiresAt && expiresAt > now;

    let daysRemaining = null;
    if (expiresAt) {
      daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    const result = {
      isMember: true,
      isActive,
      memberType: member.memberType,
      expiresAt,
      daysRemaining,
      renewalCount: member.renewalCount,
    };

    // Cache for 30 seconds
    ctx.cache.set(cacheKey, result, 30);

    return result;
  }),
});