import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "../../trpc";
import {
  hackathons,
} from "@query/db";
import { eq, and, gte } from "drizzle-orm";
import { isAdmin } from "../../middleware/procedures";
import { CacheKeys } from "../../middleware/cache";
import type { DrizzleDB } from "@query/db";

export const hackathonCrudRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        status: z
          .enum([
            "draft",
            "open",
            "closed",
            "in_progress",
            "completed",
            "cancelled",
          ])
          .optional(),
        upcoming: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathons:list:${input.status || "all"}:${input.upcoming ? "upcoming" : "all"}:${input.limit}:${input.offset}`;

      type DB = DrizzleDB;
      type HackathonList = Awaited<
        ReturnType<DB["query"]["hackathons"]["findMany"]>
      >;
      // Check cache first
      const cached = ctx.cache.get<HackathonList>(cacheKey);
      if (cached) return cached;

      const now = new Date();

      const allHackathons = await (
        ctx.db as DrizzleDB
      ).query.hackathons.findMany({
        where: and(
          eq(hackathons.isPublic, true),
          input.status ? eq(hackathons.status, input.status) : undefined,
          input.upcoming ? gte(hackathons.startDate, now) : undefined,
        ),
        limit: input.limit,
        offset: input.offset,
        orderBy: (hackathons, { desc }) => [desc(hackathons.startDate)],
      });

      ctx.cache.set(cacheKey, allHackathons, 60);

      return allHackathons;
    }),


  listAll: isAdmin.query(async ({ ctx }) => {
    const cacheKey = "hackathons:list:all";

    const fetchAll = async () => {
      return await (ctx.db as DrizzleDB).query.hackathons.findMany({
        orderBy: (hackathons, { desc }) => [desc(hackathons.startDate)],
      });
    };

    const cached =
      ctx.cache.get<Awaited<ReturnType<typeof fetchAll>>>(cacheKey);
    if (cached !== null) return cached;

    const allHackathons = await fetchAll();

    ctx.cache.set(cacheKey, allHackathons, 60);

    return allHackathons;
  }),


  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check cache first
      const cacheKey = CacheKeys.hackathon(input.id);
      type DB = DrizzleDB;
      type HackathonItem = Awaited<
        ReturnType<DB["query"]["hackathons"]["findFirst"]>
      >;
      const cached = ctx.cache.get<HackathonItem>(cacheKey);
      if (cached) return cached;

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.id,
        );
      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: isUuid
          ? eq(hackathons.id, input.id)
          : eq(hackathons.name, input.id),
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      ctx.cache.set(cacheKey, hackathon, 120);

      return hackathon;
    }),


  create: isAdmin
    .input(
      z
        .object({
          name: z.string().min(1).max(200),
          description: z.string().max(5000).optional(),
          location: z.string().max(500).optional(),
          startDate: z.date(),
          endDate: z.date(),
          registrationDeadline: z.date().optional(),
          hackingStartTime: z.date().optional(),
          maxParticipants: z.number().int().positive().max(10000).optional(),
          prizes: z
            .array(
              z.object({
                place: z.string().max(50),
                amount: z.number().nonnegative(),
                description: z.string().max(500).optional(),
              }),
            )
            .max(20)
            .optional(),
          rules: z.string().max(10000).optional(),
          theme: z.string().max(200).optional(),
          tracks: z.array(z.string().max(100)).max(50).optional(),
          challenges: z.array(z.string().max(100)).max(50).optional(),
          websiteUrl: z.string().url().max(500).optional(),
        })
        .refine((data) => data.endDate > data.startDate, {
          message: "End date must be after start date",
        })
        .refine(
          (data) =>
            !data.registrationDeadline ||
            data.registrationDeadline <= data.startDate,
          {
            message: "Registration deadline must be before or equal to the event start date",
          },
        )
        .refine(
          (data) =>
            !data.hackingStartTime ||
            (data.hackingStartTime >= data.startDate &&
              data.hackingStartTime <= data.endDate),
          {
            message:
              "Hacking start time must be within the event window (between start date and end date)",
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const [newHackathon] = await (ctx.db as DrizzleDB)
        .insert(hackathons)
        .values({
          ...input,
          status: "draft",
        })
        .returning();

      ctx.cache.deletePattern("hackathons:*");

      return newHackathon;
    }),


  update: isAdmin
    .input(
      z.object({
        id: z.string().uuid("Invalid hackathon ID"),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        location: z.string().max(500).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        registrationDeadline: z.date().optional(),
        hackingStartTime: z.date().nullable().optional(),
        maxParticipants: z.number().int().positive().max(10000).optional(),
        status: z
          .enum([
            "draft",
            "open",
            "closed",
            "in_progress",
            "completed",
            "cancelled",
          ])
          .optional(),
        prizes: z
          .array(
            z.object({
              place: z.string().max(50),
              amount: z.number().nonnegative(),
              description: z.string().max(500).optional(),
            }),
          )
          .max(20)
          .optional(),
        rules: z.string().max(10000).optional(),
        theme: z.string().max(200).optional(),
        tracks: z.array(z.string().max(100)).max(50).optional(),
        challenges: z.array(z.string().max(100)).max(50).optional(),
        websiteUrl: z.string().url().max(500).optional(),
        isPublic: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      // Merge with existing dates for partial-update validation
      const resolvedStart = updateData.startDate ?? existing.startDate;
      const resolvedEnd = updateData.endDate ?? existing.endDate;

      if (resolvedEnd <= resolvedStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End date must be after start date",
        });
      }

      // hackingStartTime: null clears it; undefined leaves it unchanged
      const resolvedHackingStart =
        updateData.hackingStartTime === null
          ? null
          : (updateData.hackingStartTime ?? existing.hackingStartTime);

      if (
        resolvedHackingStart !== null &&
        resolvedHackingStart !== undefined &&
        (resolvedHackingStart < resolvedStart ||
          resolvedHackingStart > resolvedEnd)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Hacking start time must be within the event window (between start date and end date)",
        });
      }

      const [updatedHackathon] = await (ctx.db as DrizzleDB)
        .update(hackathons)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(hackathons.id, id))
        .returning();

      ctx.cache.delete(CacheKeys.hackathon(id));
      ctx.cache.deletePattern("hackathons:*");

      return updatedHackathon;
    }),


  delete: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { hackathonId } = input;
      await (ctx.db as DrizzleDB)
        .delete(hackathons)
        .where(eq(hackathons.id, hackathonId));
      ctx.cache.delete(CacheKeys.hackathon(hackathonId));
      ctx.cache.deletePattern("hackathons:*");
      return { success: true };
    }),

});
