import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  judges,
  judgeAssignments,
  judgeVotes,
  judgingProjects,
  judgeQueue,
  hackathonMaps,
  hackathons,
} from "@query/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { CacheKeys } from "../../middleware/cache";
import { isAdmin, isJudge } from "../../middleware/procedures";
import type { DrizzleDB } from "@query/db";

export const judgePortalRouter = createTRPCRouter({
  isJudge: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let hackathonId = input?.hackathonId;
      if (!hackathonId) {
        const latest = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
          orderBy: (h, { desc }) => [desc(h.startDate)],
          columns: { id: true },
        });
        hackathonId = latest?.id;
      }

      if (!hackathonId) {
        return {
          isJudge: false,
          judgeId: null,
          name: null,
        };
      }

      const cacheKey = `${CacheKeys.judge(ctx.userId as string)}:${hackathonId}`;
      const cached = ctx.cache.get<{
        isJudge: boolean;
        judgeId: string | null;
        name: string | null;
      }>(cacheKey);
      if (cached) return cached;

      const judge = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: and(
          eq(judges.userId, ctx.userId as string),
          eq(judges.hackathonId, hackathonId),
          eq(judges.isActive, true),
        ),
      });

      const result = {
        isJudge: !!judge,
        judgeId: judge?.id || null,
        name: judge?.name || null,
      };
      ctx.cache.set(cacheKey, result, 60);

      return result;
    }),

  getMyAssignments: isJudge.query(async ({ ctx }) => {
    const assignments = await (
      ctx.db as DrizzleDB
    ).query.judgeAssignments.findMany({
      where: eq(judgeAssignments.judgeId, ctx.judge.id),
      with: {
        hackathon: true,
      },
      orderBy: (assignments, { desc }) => [desc(assignments.assignedAt)],
    });

    return assignments;
  }),

  getNextTable: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const nextInQueue = await (
          ctx.db as DrizzleDB
        ).query.judgeQueue.findFirst({
          where: and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.hackathonId, input.hackathonId),
            eq(judgeQueue.isCompleted, false),
          ),
          with: {
            project: true,
          },
          orderBy: [asc(judgeQueue.order)],
        });

        if (!nextInQueue) {
          return { done: true, project: null, remaining: 0 };
        }

        const remainingCount = await (ctx.db as DrizzleDB)
          .select({ count: sql<number>`count(*)` })
          .from(judgeQueue)
          .where(
            and(
              eq(judgeQueue.judgeId, ctx.judge.id),
              eq(judgeQueue.hackathonId, input.hackathonId),
              eq(judgeQueue.isCompleted, false),
            ),
          );

        return {
          done: false,
          project: nextInQueue.project,
          queueId: nextInQueue.id,
          remaining: Number(remainingCount[0]?.count || 0),
        };
      } catch (error) {
        // getNextTable error
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch next project",
        });
      }
    }),

  getProjects: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projects = await (
        ctx.db as DrizzleDB
      ).query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      const myVotes = await (ctx.db as DrizzleDB).query.judgeVotes.findMany({
        where: eq(judgeVotes.judgeId, ctx.judge.id),
      });

      const votesMap = new Map(myVotes.map((v) => [v.projectId, v]));

      return projects.map((p) => ({
        ...p,
        myVote: votesMap.get(p.id) || null,
        hasVoted: votesMap.has(p.id),
      }));
    }),

  getMaps: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const maps = await (ctx.db as DrizzleDB).query.hackathonMaps.findMany({
        where: eq(hackathonMaps.hackathonId, input.hackathonId),
        orderBy: [asc(hackathonMaps.order)],
      });

      return maps;
    }),

  getJudgingStatus: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { judgingActive: true },
      });
      return { active: hackathon?.judgingActive ?? false };
    }),

  toggleJudging: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        active: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await (ctx.db as DrizzleDB)
        .update(hackathons)
        .set({ judgingActive: input.active, updatedAt: new Date() })
        .where(eq(hackathons.id, input.hackathonId))
        .returning();
      return { success: true, judgingActive: updated?.judgingActive };
    }),

  submitVote: isJudge
    .input(
      z.object({
        projectId: z.string().uuid(),
        scoreCreativity: z.number().min(1).max(10),
        scoreImpact: z.number().min(1).max(10),
        scoreScope: z.number().min(1).max(10),
        scoreClarity: z.number().min(1).max(10),
        scoreSoundness: z.number().min(1).max(10),
        durationSeconds: z.number().int().min(0).optional(),
        comment: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const totalScore =
        input.scoreCreativity +
        input.scoreImpact +
        input.scoreScope +
        input.scoreClarity +
        input.scoreSoundness;

      // Atomic upsert: INSERT or UPDATE if judge already voted on this project
      const result = await (ctx.db as DrizzleDB)
        .insert(judgeVotes)
        .values({
          judgeId: ctx.judge.id,
          projectId: input.projectId,
          score: totalScore,
          scoreCreativity: input.scoreCreativity,
          scoreImpact: input.scoreImpact,
          scoreScope: input.scoreScope,
          scoreClarity: input.scoreClarity,
          scoreSoundness: input.scoreSoundness,
          durationSeconds: input.durationSeconds,
          comment: input.comment,
        })
        .onConflictDoUpdate({
          target: [judgeVotes.judgeId, judgeVotes.projectId],
          set: {
            score: sql`excluded.score`,
            scoreCreativity: sql`excluded.score_creativity`,
            scoreImpact: sql`excluded.score_impact`,
            scoreScope: sql`excluded.score_scope`,
            scoreClarity: sql`excluded.score_clarity`,
            scoreSoundness: sql`excluded.score_soundness`,
            durationSeconds: sql`excluded.duration_seconds`,
            comment: sql`excluded.comment`,
            updatedAt: new Date(),
          },
        })
        .returning();

      return result[0];
    }),

  completeAndNext: isJudge
    .input(
      z.object({
        queueId: z.string().uuid(),
        projectId: z.string().uuid(),
        scoreCreativity: z.number().min(1).max(10),
        scoreImpact: z.number().min(1).max(10),
        scoreScope: z.number().min(1).max(10),
        scoreClarity: z.number().min(1).max(10),
        scoreSoundness: z.number().min(1).max(10),
        durationSeconds: z.number().int().min(0).optional(),
        comment: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const totalScore =
        input.scoreCreativity +
        input.scoreImpact +
        input.scoreScope +
        input.scoreClarity +
        input.scoreSoundness;

      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // 1. Atomic upsert vote
        await tx
          .insert(judgeVotes)
          .values({
            judgeId: ctx.judge.id,
            projectId: input.projectId,
            score: totalScore,
            scoreCreativity: input.scoreCreativity,
            scoreImpact: input.scoreImpact,
            scoreScope: input.scoreScope,
            scoreClarity: input.scoreClarity,
            scoreSoundness: input.scoreSoundness,
            durationSeconds: input.durationSeconds,
            comment: input.comment,
          })
          .onConflictDoUpdate({
            target: [judgeVotes.judgeId, judgeVotes.projectId],
            set: {
              score: sql`excluded.score`,
              scoreCreativity: sql`excluded.score_creativity`,
              scoreImpact: sql`excluded.score_impact`,
              scoreScope: sql`excluded.score_scope`,
              scoreClarity: sql`excluded.score_clarity`,
              scoreSoundness: sql`excluded.score_soundness`,
              durationSeconds: sql`excluded.duration_seconds`,
              comment: sql`excluded.comment`,
              updatedAt: new Date(),
            },
          });

        // 2. Mark queue item as completed
        await tx
          .update(judgeQueue)
          .set({
            isCompleted: true,
            completedAt: new Date(),
          })
          .where(eq(judgeQueue.id, input.queueId));

        // 3. Get hackathonId from queue item
        const queueItem = await tx.query.judgeQueue.findFirst({
          where: eq(judgeQueue.id, input.queueId),
        });

        if (!queueItem) {
          return { done: true, nextProject: null };
        }

        // 4. Get next uncompleted queue item
        const nextInQueue = await tx.query.judgeQueue.findFirst({
          where: and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.hackathonId, queueItem.hackathonId),
            eq(judgeQueue.isCompleted, false),
          ),
          with: {
            project: true,
          },
          orderBy: [asc(judgeQueue.order)],
        });

        if (!nextInQueue) {
          return { done: true, nextProject: null };
        }

        return {
          done: false,
          nextProject: nextInQueue.project,
          nextQueueId: nextInQueue.id,
        };
      });
    }),

  skipProject: isJudge
    .input(
      z.object({
        queueId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // Get the queue item to find the hackathon
        const queueItem = await tx.query.judgeQueue.findFirst({
          where: eq(judgeQueue.id, input.queueId),
        });

        if (!queueItem) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Queue item not found",
          });
        }

        // Atomically move this item to the end of the queue using a subquery
        await tx
          .update(judgeQueue)
          .set({
            order: sql`(SELECT COALESCE(MAX(${judgeQueue.order}), 0) + 1 FROM ${judgeQueue} WHERE ${judgeQueue.judgeId} = ${ctx.judge.id} AND ${judgeQueue.hackathonId} = ${queueItem.hackathonId})`,
          })
          .where(eq(judgeQueue.id, input.queueId));

        // Get the next uncompleted item
        const nextInQueue = await tx.query.judgeQueue.findFirst({
          where: and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.hackathonId, queueItem.hackathonId),
            eq(judgeQueue.isCompleted, false),
          ),
          with: {
            project: true,
          },
          orderBy: [asc(judgeQueue.order)],
        });

        if (!nextInQueue || nextInQueue.id === input.queueId) {
          // Only this one project left — can't skip the last one
          return {
            done: false,
            skippedToEnd: true,
            project: queueItem,
            queueId: input.queueId,
          };
        }

        return {
          done: false,
          skippedToEnd: false,
          project: nextInQueue.project,
          queueId: nextInQueue.id,
        };
      });
    }),

  forceSkipOvertime: isJudge
    .input(z.object({ queueId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        const queueItem = await tx.query.judgeQueue.findFirst({
          where: eq(judgeQueue.id, input.queueId),
          with: { project: true },
        });
        if (!queueItem)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Queue item not found",
          });

        // Mark completed (no vote submitted)
        await tx
          .update(judgeQueue)
          .set({ isCompleted: true, completedAt: new Date() })
          .where(eq(judgeQueue.id, input.queueId));

        // Try to reassign to another judge with the same track
        const myAssignment = await tx.query.judgeAssignments.findFirst({
          where: eq(judgeAssignments.judgeId, ctx.judge.id),
        });

        if (myAssignment?.hackathonId) {
          // Find other judges assigned to the same hackathon
          const otherAssignments = await tx.query.judgeAssignments.findMany({
            where: and(
              eq(judgeAssignments.hackathonId, myAssignment.hackathonId),
            ),
          });

          // Get the project's tracks for matching
          const projectTracks = queueItem.project?.tracks || [];

          // Build candidate list with workload info
          const candidates: {
            judgeId: string;
            trackMatch: boolean;
            remaining: number;
          }[] = [];

          for (const other of otherAssignments) {
            if (other.judgeId === ctx.judge.id) continue;

            // Check if already has this project
            const alreadyQueued = await tx.query.judgeQueue.findFirst({
              where: and(
                eq(judgeQueue.judgeId, other.judgeId),
                eq(judgeQueue.projectId, queueItem.projectId),
              ),
            });
            if (alreadyQueued) continue;

            // Count remaining (uncompleted) projects for workload balancing
            const remainingCount = await tx
              .select({ count: sql<number>`COUNT(*)` })
              .from(judgeQueue)
              .where(
                and(
                  eq(judgeQueue.judgeId, other.judgeId),
                  eq(judgeQueue.hackathonId, myAssignment.hackathonId),
                  eq(judgeQueue.isCompleted, false),
                ),
              );

            // Check track match: judge's assigned track overlaps with project's tracks
            const trackMatch = other.track
              ? projectTracks.includes(other.track)
              : false;

            candidates.push({
              judgeId: other.judgeId,
              trackMatch,
              remaining: remainingCount[0]?.count ?? 0,
            });
          }

          // Sort: same-track first, then by fewest remaining projects (lightest load)
          candidates.sort((a, b) => {
            if (a.trackMatch !== b.trackMatch) return a.trackMatch ? -1 : 1;
            return a.remaining - b.remaining;
          });

          const best = candidates[0];
          if (best) {
            // Atomic order assignment via SQL subquery
            await tx.insert(judgeQueue).values({
              judgeId: best.judgeId,
              hackathonId: myAssignment.hackathonId,
              projectId: queueItem.projectId,
              order: sql`(SELECT COALESCE(MAX(${judgeQueue.order}), 0) + 1 FROM ${judgeQueue} WHERE ${judgeQueue.judgeId} = ${best.judgeId} AND ${judgeQueue.hackathonId} = ${myAssignment.hackathonId})`,
            });
          }
        }

        // Get next project for this judge
        const nextInQueue = await tx.query.judgeQueue.findFirst({
          where: and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.hackathonId, queueItem.hackathonId),
            eq(judgeQueue.isCompleted, false),
          ),
          with: { project: true },
          orderBy: [asc(judgeQueue.order)],
        });

        return {
          done: !nextInQueue,
          project: nextInQueue?.project ?? null,
          queueId: nextInQueue?.id ?? null,
        };
      });
    }),

  getProgress: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const totalResult = await (ctx.db as DrizzleDB)
          .select({ count: sql<number>`count(*)` })
          .from(judgeQueue)
          .where(
            and(
              eq(judgeQueue.judgeId, ctx.judge.id),
              eq(judgeQueue.hackathonId, input.hackathonId),
            ),
          );

        const completedResult = await (ctx.db as DrizzleDB)
          .select({ count: sql<number>`count(*)` })
          .from(judgeQueue)
          .where(
            and(
              eq(judgeQueue.judgeId, ctx.judge.id),
              eq(judgeQueue.hackathonId, input.hackathonId),
              eq(judgeQueue.isCompleted, true),
            ),
          );

        const total = Number(totalResult[0]?.count || 0);
        const completed = Number(completedResult[0]?.count || 0);

        return {
          total,
          completed,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      } catch (error) {
        // getProgress error
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to fetch progress",
        });
      }
    }),
});
