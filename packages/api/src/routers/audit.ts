import { z } from "zod";
import { createTRPCRouter } from "../trpc";
import { auditLogs } from "@query/db";
import { isAdmin } from "../middleware/procedures";
import { desc, eq, and, sql } from "drizzle-orm";

export const auditRouter = createTRPCRouter({
    list: isAdmin
        .input(
            z.object({
                limit: z.number().min(1).max(100).default(50),
                offset: z.number().min(0).default(0),
                severity: z.enum(["info", "warn", "critical"]).optional(),
                userId: z.string().optional(),
            })
        )
        .query(async ({ ctx, input }) => {
            const filters = and(
                input.severity ? eq(auditLogs.severity, input.severity) : undefined,
                input.userId ? eq(auditLogs.userId, input.userId) : undefined
            );

            const logs = await ctx.db!.query.auditLogs.findMany({
                where: filters,
                orderBy: [desc(auditLogs.createdAt)],
                limit: input.limit,
                offset: input.offset,
            });

            const totalResult = await ctx.db!
                .select({ count: sql<number>`count(*)` })
                .from(auditLogs)
                .where(filters);

            const total = Number(totalResult[0]?.count || 0);

            return {
                logs,
                pagination: {
                    total,
                    limit: input.limit,
                    offset: input.offset,
                    hasMore: input.offset + input.limit < total,
                }
            };
        }),
});
