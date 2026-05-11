import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  judges,
  judgeAssignments,
  judgeVotes,
  judgingProjects,
  judgeQueue,
  hackathonMaps,
  hackathons,
  users,
} from "@query/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { CacheKeys } from "../middleware/cache";
import { isAdmin, isJudge } from "../middleware/procedures";
import type { DrizzleDB } from "@query/db";

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
}

export const judgeRouter = createTRPCRouter({
  isJudge: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = CacheKeys.judge(ctx.userId as string);
    const cached = ctx.cache.get<{
      isJudge: boolean;
      judgeId: string | null;
      name: string | null;
    }>(cacheKey);
    if (cached) return cached;

    const judge = await (ctx.db as DrizzleDB).query.judges.findFirst({
      where: and(
        eq(judges.userId, ctx.userId as string),
        eq(judges.isActive, true)
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
    const assignments = await (ctx.db as DrizzleDB).query.judgeAssignments.findMany({
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
        const nextInQueue = await (ctx.db as DrizzleDB).query.judgeQueue.findFirst({
          where: and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.hackathonId, input.hackathonId),
            eq(judgeQueue.isCompleted, false)
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
              eq(judgeQueue.isCompleted, false)
            )
          );

        return {
          done: false,
          project: nextInQueue.project,
          queueId: nextInQueue.id,
          remaining: Number(remainingCount[0]?.count || 0),
        };
      } catch (error) {
        console.error("[getNextTable] Error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch next project",
        });
      }
    }),

  getProjects: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projects = await (ctx.db as DrizzleDB).query.judgingProjects.findMany({
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
    .input(z.object({
      hackathonId: z.string().uuid(),
      active: z.boolean(),
    }))
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const totalScore = input.scoreCreativity + input.scoreImpact + input.scoreScope + input.scoreClarity + input.scoreSoundness;

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const totalScore = input.scoreCreativity + input.scoreImpact + input.scoreScope + input.scoreClarity + input.scoreSoundness;

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
            eq(judgeQueue.isCompleted, false)
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
      })
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
            eq(judgeQueue.isCompleted, false)
          ),
          with: {
            project: true,
          },
          orderBy: [asc(judgeQueue.order)],
        });

        if (!nextInQueue || nextInQueue.id === input.queueId) {
          // Only this one project left — can't skip the last one
          return { done: false, skippedToEnd: true, project: queueItem, queueId: input.queueId };
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
        if (!queueItem) throw new TRPCError({ code: "NOT_FOUND", message: "Queue item not found" });

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
          const candidates: { judgeId: string; trackMatch: boolean; remaining: number }[] = [];

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
              .where(and(
                eq(judgeQueue.judgeId, other.judgeId),
                eq(judgeQueue.hackathonId, myAssignment.hackathonId),
                eq(judgeQueue.isCompleted, false),
              ));

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
              eq(judgeQueue.hackathonId, input.hackathonId)
            )
          );

        const completedResult = await (ctx.db as DrizzleDB)
          .select({ count: sql<number>`count(*)` })
          .from(judgeQueue)
          .where(
            and(
              eq(judgeQueue.judgeId, ctx.judge.id),
              eq(judgeQueue.hackathonId, input.hackathonId),
              eq(judgeQueue.isCompleted, true)
            )
          );

        const total = Number(totalResult[0]?.count || 0);
        const completed = Number(completedResult[0]?.count || 0);

        return {
          total,
          completed,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      } catch (error) {
        console.error("[getProgress] Error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch progress",
        });
      }
    }),

  getRankings: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:rankings`;
      const cached = ctx.cache.get<typeof result>(cacheKey);
      if (cached) return cached;

      const projects = await (ctx.db as DrizzleDB).query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        with: {
          votes: {
            with: {
              judge: {
                with: {
                  user: {
                    columns: { name: true, email: true },
                  },
                },
              },
            },
          },
        },
      });

      const round2 = (n: number) => Math.round(n * 100) / 100;

      // Bayesian average confidence threshold
      // C=2 means: with 2 judges you get a 50/50 blend of actual vs global avg
      const C = 2;

      // First pass: compute raw stats for each project
      const rawRankings = projects.map((project) => {
        const totalScore = project.votes.reduce((sum, v) => sum + v.score, 0);
        const voteCount = project.votes.length;
        const avgScore = voteCount > 0 ? totalScore / voteCount : 0;

        // Per-category averages
        const sumCat = { creativity: 0, impact: 0, scope: 0, clarity: 0, soundness: 0 };
        project.votes.forEach((v) => {
          sumCat.creativity += v.scoreCreativity ?? 0;
          sumCat.impact += v.scoreImpact ?? 0;
          sumCat.scope += v.scoreScope ?? 0;
          sumCat.clarity += v.scoreClarity ?? 0;
          sumCat.soundness += v.scoreSoundness ?? 0;
        });

        const categoryAvg = voteCount > 0
          ? {
            creativity: round2(sumCat.creativity / voteCount),
            impact: round2(sumCat.impact / voteCount),
            scope: round2(sumCat.scope / voteCount),
            clarity: round2(sumCat.clarity / voteCount),
            soundness: round2(sumCat.soundness / voteCount),
          }
          : { creativity: 0, impact: 0, scope: 0, clarity: 0, soundness: 0 };

        return {
          project: {
            id: project.id,
            name: project.name,
            tableNumber: project.tableNumber,
            zone: project.zone,
            category: project.category,
            teamMembers: project.teamMembers,
            tracks: project.tracks,
            challenges: project.challenges,
            isCreateX: project.isCreateX,
          },
          totalScore,
          voteCount,
          avgScore: round2(avgScore),
          categoryAvg,
          votes: project.votes.map((v) => ({
            score: v.score,
            scoreCreativity: v.scoreCreativity,
            scoreImpact: v.scoreImpact,
            scoreScope: v.scoreScope,
            scoreClarity: v.scoreClarity,
            scoreSoundness: v.scoreSoundness,

            comment: v.comment,
            durationSeconds: v.durationSeconds,
            judgeName: v.judge.user?.name || v.judge.name || "Unknown",
          })),
        };
      });

      // Compute global average (across all projects that have at least 1 vote)
      const votedProjects = rawRankings.filter((r) => r.voteCount > 0);
      const globalAvg = votedProjects.length > 0
        ? round2(votedProjects.reduce((sum, r) => sum + r.avgScore, 0) / votedProjects.length)
        : 0;

      // Second pass: compute Bayesian weighted score and confidence level
      // weightedScore = (n / (n + C)) * avgScore + (C / (n + C)) * globalAvg
      const rankings = rawRankings.map((r) => {
        const n = r.voteCount;
        const weightedScore = n > 0
          ? round2((n / (n + C)) * r.avgScore + (C / (n + C)) * globalAvg)
          : 0;
        const confidenceLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" =
          n === 0 ? "NONE" : n === 1 ? "LOW" : n === 2 ? "MEDIUM" : "HIGH";

        return { ...r, weightedScore, confidenceLevel };
      });

      // Sort by weighted score (fair ranking)
      rankings.sort((a, b) => b.weightedScore - a.weightedScore);

      // Weighted-score ties
      const ties: { score: number; projects: { id: string; name: string; tableNumber: number; zone: string | null }[] }[] = [];
      const scoreGroups = new Map<number, typeof rankings>();

      rankings.forEach((r) => {
        const existing = scoreGroups.get(r.weightedScore);
        if (existing) {
          existing.push(r);
        } else {
          scoreGroups.set(r.weightedScore, [r]);
        }
      });

      scoreGroups.forEach((group, score) => {
        if (group.length > 1) {
          ties.push({
            score,
            projects: group.map((g) => ({ id: g.project.id, name: g.project.name, tableNumber: g.project.tableNumber, zone: g.project.zone ?? null })),
          });
        }
      });

      // Per-category ties (only among projects with votes)
      const categoryNames = ["creativity", "impact", "scope", "clarity", "soundness"] as const;
      const categoryLabels: Record<typeof categoryNames[number], string> = {
        creativity: "Creativity",
        impact: "Impact",
        scope: "Scope",
        clarity: "Clarity",
        soundness: "Soundness",
      };

      const categoryTies: { category: string; avgScore: number; projects: { id: string; name: string; tableNumber: number; zone: string | null }[] }[] = [];

      for (const cat of categoryNames) {
        const catGroups = new Map<number, { id: string; name: string; tableNumber: number; zone: string | null }[]>();
        rankings.forEach((r) => {
          if (r.voteCount === 0) return;
          const avg = r.categoryAvg[cat];
          const existing = catGroups.get(avg);
          const projectInfo = { id: r.project.id, name: r.project.name, tableNumber: r.project.tableNumber, zone: r.project.zone ?? null };
          if (existing) {
            existing.push(projectInfo);
          } else {
            catGroups.set(avg, [projectInfo]);
          }
        });
        catGroups.forEach((group, avg) => {
          if (group.length > 1) {
            categoryTies.push({
              category: categoryLabels[cat],
              avgScore: avg,
              projects: group,
            });
          }
        });
      }

      const result = {
        rankings,
        globalAvg,
        ties,
        hasTies: ties.length > 0,
        categoryTies,
        hasCategoryTies: categoryTies.length > 0,
      };

      ctx.cache.set(cacheKey, result, 30); // 30 second cache for live rankings

      return result;
    }),

  list: isAdmin.query(async ({ ctx }) => {
    const allJudges = await (ctx.db as DrizzleDB).query.judges.findMany({
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        assignments: {
          with: {
            hackathon: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: (judges, { desc }) => [desc(judges.createdAt)],
    });

    return allJudges;
  }),

  create: isAdmin
    .input(
      z.object({
        userId: z.string().min(1).max(255),
        name: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await (ctx.db as DrizzleDB).query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const existing = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: eq(judges.userId, input.userId),
      });

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already a judge",
        });
      }

      const result = await (ctx.db as DrizzleDB)
        .insert(judges)
        .values({
          userId: input.userId,
          name: input.name || user.name,
        })
        .returning();

      return result[0];
    }),

  assignToHackathon: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        hackathonId: z.string().uuid(),
        isLead: z.boolean().optional(),
        track: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await (ctx.db as DrizzleDB).query.judgeAssignments.findFirst({
        where: and(
          eq(judgeAssignments.judgeId, input.judgeId),
          eq(judgeAssignments.hackathonId, input.hackathonId)
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Judge already assigned",
        });
      }

      const result = await (ctx.db as DrizzleDB)
        .insert(judgeAssignments)
        .values({
          judgeId: input.judgeId,
          hackathonId: input.hackathonId,
          isLead: input.isLead || false,
          track: input.track,
        })
        .returning();

      const allProjects = await (ctx.db as DrizzleDB).query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      // Auto-assign all projects - judges choose what to judge
      const assignedProjects = allProjects;

      if (assignedProjects.length > 0) {
        await (ctx.db as DrizzleDB).insert(judgeQueue).values(
          assignedProjects.map((p, idx) => ({
            judgeId: input.judgeId,
            hackathonId: input.hackathonId,
            projectId: p.id,
            order: idx + 1,
          }))
        );
      }

      return result[0];
    }),

  createProject: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        name: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        tableNumber: z.number().min(1),
        zone: z.string().optional(),
        teamMembers: z.string().max(500).optional(),
        projectUrl: z.string().url().optional(),
        repoUrl: z.string().url().optional(),
        tracks: z.array(z.string()).optional(),
        challenges: z.array(z.string()).optional(),
        isCreateX: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await (ctx.db as DrizzleDB)
        .insert(judgingProjects)
        .values(input)
        .returning();

      return result[0];
    }),

  bulkCreateProjects: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        projects: z.array(
          z.object({
            name: z.string().min(1).max(255),
            description: z.string().max(1000).optional(),
            tableNumber: z.number().min(1),
            zone: z.string().optional(),
            category: z.string().max(100).optional(),
            teamMembers: z.string().max(500).optional(),
            tracks: z.array(z.string()).optional(),
            challenges: z.array(z.string()).optional(),
            isCreateX: z.boolean().default(false),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await (ctx.db as DrizzleDB)
        .insert(judgingProjects)
        .values(
          input.projects.map((p) => ({
            ...p,
            hackathonId: input.hackathonId,
          }))
        )
        .returning();

      return result;
    }),

  /** Bulk import judges from a parsed CSV.
   *  Creates user stubs for emails not yet in the system,
   *  creates judge records, and assigns to the hackathon. */
  bulkImportJudges: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        judges: z.array(
          z.object({
            name: z.string().min(1).max(255),
            email: z.string().email(),
            track: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        const results = { created: 0, skipped: 0, errors: [] as string[] };

        for (const j of input.judges) {
          try {
            // 1. Find or create user by email
            let user = await tx.query.users.findFirst({
              where: eq(users.email, j.email),
            });

            if (!user) {
              const id = crypto.randomUUID();
              const [newUser] = await tx
                .insert(users)
                .values({ id, name: j.name, email: j.email })
                .returning();
              user = newUser as NonNullable<typeof newUser>;
            }

            // 2. Find or create judge record
            let judge = await tx.query.judges.findFirst({
              where: eq(judges.userId, user.id),
            });

            if (!judge) {
              const [newJudge] = await tx
                .insert(judges)
                .values({ userId: user.id, name: j.name })
                .returning();
              judge = newJudge as NonNullable<typeof newJudge>;
            }

            // 3. Assign to hackathon (skip if already assigned)
            const existingAssignment = await tx.query.judgeAssignments.findFirst({
              where: and(
                eq(judgeAssignments.judgeId, judge.id),
                eq(judgeAssignments.hackathonId, input.hackathonId),
              ),
            });

            if (!existingAssignment) {
              await tx.insert(judgeAssignments).values({
                judgeId: judge.id,
                hackathonId: input.hackathonId,
                track: j.track || null,
              });
            }

            results.created++;
          } catch (e) {
            results.skipped++;
            results.errors.push(`${j.email}: ${e instanceof Error ? e.message : 'Unknown error'}`);
          }
        }

        return results;
      });
    }),

  /** Bulk import projects from a parsed CSV.
   *  Auto-assigns incrementing table numbers starting from 1. */
  bulkImportProjects: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        projects: z.array(
          z.object({
            name: z.string().min(1).max(255),
            teamMembers: z.string().max(500).optional(),
            mainTrack: z.string().optional(),
            extraTracks: z.array(z.string()).optional(),
            isCreateX: z.boolean().default(false),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the current max table number for this hackathon
      const maxResult = await (ctx.db as DrizzleDB)
        .select({ max: sql<number>`COALESCE(MAX(${judgingProjects.tableNumber}), 0)` })
        .from(judgingProjects)
        .where(eq(judgingProjects.hackathonId, input.hackathonId));

      let nextTable = (maxResult[0]?.max ?? 0) + 1;

      const rows = input.projects.map((p) => {
        const tracks = [
          ...(p.mainTrack ? [p.mainTrack] : []),
          ...(p.extraTracks || []),
        ].filter(Boolean);

        return {
          hackathonId: input.hackathonId,
          name: p.name,
          teamMembers: p.teamMembers,
          tableNumber: nextTable++,
          tracks: tracks.length > 0 ? tracks : undefined,
          isCreateX: p.isCreateX,
        };
      });

      const result = await (ctx.db as DrizzleDB)
        .insert(judgingProjects)
        .values(rows)
        .returning();

      return { created: result.length, startTable: rows[0]?.tableNumber, endTable: rows[rows.length - 1]?.tableNumber };
    }),

  addMap: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        imageUrl: z.string().url(),
        name: z.string().max(100).optional(),
        order: z.number().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await (ctx.db as DrizzleDB)
        .insert(hackathonMaps)
        .values(input)
        .returning();

      return result[0];
    }),

  initializeQueue: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        hackathonId: z.string().uuid(),
        shuffle: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await (ctx.db as DrizzleDB)
        .delete(judgeQueue)
        .where(
          and(
            eq(judgeQueue.judgeId, input.judgeId),
            eq(judgeQueue.hackathonId, input.hackathonId)
          )
        );

      // Get judge assignment to check for track restriction
      const assignment = await (ctx.db as DrizzleDB).query.judgeAssignments.findFirst({
        where: and(
          eq(judgeAssignments.judgeId, input.judgeId),
          eq(judgeAssignments.hackathonId, input.hackathonId)
        ),
      });

      // Fetch all projects (or filter in query if possible, but JS filter matches assignToHackathon logic)
      const allProjects = await (ctx.db as DrizzleDB).query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      // Filter based on track if assigned
      let projects = (assignment?.track)
        ? allProjects.filter((p) => {
          const inTracks = p.tracks?.includes(assignment.track!) ?? false;
          const inChallenges = p.challenges?.includes(assignment.track!) ?? false;
          return inTracks || inChallenges;
        })
        : allProjects;

      if (input.shuffle) {
        projects = shuffleArray(projects);
      }

      if (projects.length > 0) {
        await ctx.db!.insert(judgeQueue).values(
          projects.map((p, idx) => ({
            judgeId: input.judgeId,
            hackathonId: input.hackathonId,
            projectId: p.id,
            order: idx + 1,
          }))
        );
      }

      return { success: true, projectCount: projects.length };
    }),

  remove: isAdmin
    .input(z.object({ judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await (ctx.db as DrizzleDB).delete(judges).where(eq(judges.id, input.judgeId));
      return { success: true };
    }),

  /** Bulk-assign projects to all judges for a hackathon.
   *  Main-track judges (Sports, Entertainment, Finance, Healthcare) get 3–9 randomly-selected projects.
   *  Special-label judges (createX, sponsor challenges, etc.) get ALL matching projects.
   */
  assignJudgesToProjects: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        minProjects: z.number().min(1).default(3),
        maxProjects: z.number().min(1).default(9),
        shuffle: z.boolean().default(true),
        /** When false (default), special-label/sponsor judge projects are randomized.
         *  When true, they stay grouped in table order. */
        groupSpecial: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // 1. Get Hackathon for dynamic tracks
        const hackathon = await tx.query.hackathons.findFirst({
          where: eq(hackathons.id, input.hackathonId),
        });

        if (!hackathon) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found" });
        }

        const MAIN_TRACKS = new Set(hackathon.tracks || []);

        // 2. Get all judge assignments for this hackathon
        const allAssignments = await tx.query.judgeAssignments.findMany({
          where: eq(judgeAssignments.hackathonId, input.hackathonId),
          with: { judge: true },
        });

        // 2. Get all projects for this hackathon
        const allProjects = await tx.query.judgingProjects.findMany({
          where: eq(judgingProjects.hackathonId, input.hackathonId),
          orderBy: [asc(judgingProjects.tableNumber)],
        });

        if (allProjects.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No projects found for this hackathon" });
        }

        // 3. Clear existing queue for all judges in this hackathon
        await tx
          .delete(judgeQueue)
          .where(eq(judgeQueue.hackathonId, input.hackathonId));

        const results: { judgeId: string; judgeName: string | null; track: string | null; assignedCount: number }[] = [];

        for (const assignment of allAssignments) {
          const track = assignment.track;
          const isSpecialLabel = track ? !MAIN_TRACKS.has(track) : false;

          // Find matching projects for this judge's track
          const matchingProjects = track
            ? allProjects.filter((p) => {
              const inTracks = p.tracks?.includes(track) ?? false;
              const inChallenges = p.challenges?.includes(track) ?? false;
              const matchCreateX = track.toLowerCase() === "createx" && p.isCreateX;
              return inTracks || inChallenges || matchCreateX;
            })
            : allProjects; // No track = general judge, gets from full pool

          if (matchingProjects.length === 0) continue;

          let assignedProjects: typeof matchingProjects;

          if (isSpecialLabel) {
            // Special label / sponsor judges get ALL matching projects
            // Randomized by default, unless groupSpecial is toggled on
            assignedProjects = input.groupSpecial ? matchingProjects : shuffleArray(matchingProjects);
          } else {
            // Main track judges (or unassigned) get min–max projects
            const pool = input.shuffle ? shuffleArray(matchingProjects) : matchingProjects;
            const count = Math.min(Math.max(pool.length, input.minProjects), input.maxProjects);
            assignedProjects = pool.slice(0, Math.min(count, pool.length));
          }

          if (assignedProjects.length > 0) {
            await tx.insert(judgeQueue).values(
              assignedProjects.map((p, idx) => ({
                judgeId: assignment.judgeId,
                hackathonId: input.hackathonId,
                projectId: p.id,
                order: idx + 1,
              }))
            );
          }

          results.push({
            judgeId: assignment.judgeId,
            judgeName: assignment.judge.name,
            track: track,
            assignedCount: assignedProjects.length,
          });
        }

        return {
          success: true,
          totalJudges: results.length,
          assignments: results,
        };
      });
    }),

  getAllVotes: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projects = await (ctx.db as DrizzleDB).query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        with: {
          votes: {
            with: {
              judge: {
                with: {
                  user: {
                    columns: { name: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      return projects;
    }),
});
