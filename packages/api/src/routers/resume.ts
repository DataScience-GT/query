import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { memberResumes } from "@query/db";
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../middleware/procedures";
import { countResumes, listResumes } from "../services/resume-list";

const filters = {
  scope: z.enum(["members", "all"]).default("members"),
  search: z.string().trim().max(200).optional(),
  gradYear: z.number().int().min(2024).max(2035).optional(),
};

/** Metadata only. The bytes move over /api/resume, never through tRPC. */
export const resumeRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = `resume:me:${ctx.userId}`;
    const cached = ctx.cache.get<{
      fileName: string;
      sizeBytes: number;
      uploadedAt: Date;
    } | null>(cacheKey);
    if (cached !== null) return cached;

    const row = await (ctx.db as DrizzleDB)
      .select({
        fileName: memberResumes.fileName,
        sizeBytes: memberResumes.sizeBytes,
        uploadedAt: memberResumes.uploadedAt,
      })
      .from(memberResumes)
      .where(eq(memberResumes.userId, ctx.userId as string))
      .limit(1);

    const result = row[0] ?? null;
    ctx.cache.set(cacheKey, result, 60);
    return result;
  }),

  /**
   * One page of the staff resume book, plus how many the filters match — the
   * table shows a page, the ZIP takes everything.
   */
  adminList: isAdmin
    .input(
      z.object({
        ...filters,
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).max(100000).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const { limit, offset, ...where } = input;

      const [rows, total] = await Promise.all([
        listResumes(db, where, { limit, offset }),
        countResumes(db, where),
      ]);

      return { rows, total };
    }),
});
