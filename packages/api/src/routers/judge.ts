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
  users,
} from "@query/db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { CacheKeys } from "../middleware/cache";
import { isAdmin, isJudge } from "../middleware/procedures";

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

export const judgeRouter = createTRPCRouter({
  isJudge: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = CacheKeys.judge(ctx.userId!);
    const cached = ctx.cache.get<{
      isJudge: boolean;
      judgeId: string | null;
      name: string | null;
    }>(cacheKey);
    if (cached) return cached;

    const judge = await ctx.db!.query.judges.findFirst({
      where: and(
        eq(judges.userId, ctx.userId!),
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
    const assignments = await ctx.db!.query.judgeAssignments.findMany({
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
        const nextInQueue = await ctx.db!.query.judgeQueue.findFirst({
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

        const remainingCount = await ctx.db!
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
      const projects = await ctx.db!.query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      const myVotes = await ctx.db!.query.judgeVotes.findMany({
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
      const maps = await ctx.db!.query.hackathonMaps.findMany({
        where: eq(hackathonMaps.hackathonId, input.hackathonId),
        orderBy: [asc(hackathonMaps.order)],
      });

      return maps;
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
        comment: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const totalScore = input.scoreCreativity + input.scoreImpact + input.scoreScope + input.scoreClarity + input.scoreSoundness;
      const existing = await ctx.db!.query.judgeVotes.findFirst({
        where: and(
          eq(judgeVotes.judgeId, ctx.judge.id),
          eq(judgeVotes.projectId, input.projectId)
        ),
      });

      if (existing) {
        const result = await ctx.db!
          .update(judgeVotes)
          .set({
            score: totalScore,
            scoreCreativity: input.scoreCreativity,
            scoreImpact: input.scoreImpact,
            scoreScope: input.scoreScope,
            scoreClarity: input.scoreClarity,
            scoreSoundness: input.scoreSoundness,
            comment: input.comment,
            updatedAt: new Date(),
          })
          .where(eq(judgeVotes.id, existing.id))
          .returning();

        return result[0];
      }

      const result = await ctx.db!
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
          comment: input.comment,
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
        comment: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const totalScore = input.scoreCreativity + input.scoreImpact + input.scoreScope + input.scoreClarity + input.scoreSoundness;
      const existing = await ctx.db!.query.judgeVotes.findFirst({
        where: and(
          eq(judgeVotes.judgeId, ctx.judge.id),
          eq(judgeVotes.projectId, input.projectId)
        ),
      });

      if (existing) {
        await ctx.db!
          .update(judgeVotes)
          .set({
            score: totalScore,
            scoreCreativity: input.scoreCreativity,
            scoreImpact: input.scoreImpact,
            scoreScope: input.scoreScope,
            scoreClarity: input.scoreClarity,
            scoreSoundness: input.scoreSoundness,
            comment: input.comment,
            updatedAt: new Date(),
          })
          .where(eq(judgeVotes.id, existing.id));
      } else {
        await ctx.db!.insert(judgeVotes).values({
          judgeId: ctx.judge.id,
          projectId: input.projectId,
          score: totalScore,
          scoreCreativity: input.scoreCreativity,
          scoreImpact: input.scoreImpact,
          scoreScope: input.scoreScope,
          scoreClarity: input.scoreClarity,
          scoreSoundness: input.scoreSoundness,
          comment: input.comment,
        });
      }

      await ctx.db!
        .update(judgeQueue)
        .set({
          isCompleted: true,
          completedAt: new Date(),
        })
        .where(eq(judgeQueue.id, input.queueId));

      const queueItem = await ctx.db!.query.judgeQueue.findFirst({
        where: eq(judgeQueue.id, input.queueId),
      });

      if (!queueItem) {
        return { done: true, nextProject: null };
      }

      const nextInQueue = await ctx.db!.query.judgeQueue.findFirst({
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
    }),

  getProgress: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const totalResult = await ctx.db!
          .select({ count: sql<number>`count(*)` })
          .from(judgeQueue)
          .where(
            and(
              eq(judgeQueue.judgeId, ctx.judge.id),
              eq(judgeQueue.hackathonId, input.hackathonId)
            )
          );

        const completedResult = await ctx.db!
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

      const projects = await ctx.db!.query.judgingProjects.findMany({
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

      const rankings = projects.map((project) => {
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
            category: project.category,
            teamMembers: project.teamMembers,
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
            judgeName: v.judge.user?.name || v.judge.name || "Unknown",
          })),
        };
      });

      rankings.sort((a, b) => b.totalScore - a.totalScore);

      // Overall total-score ties
      const ties: { score: number; projects: string[] }[] = [];
      const scoreGroups = new Map<number, typeof rankings>();

      rankings.forEach((r) => {
        const existing = scoreGroups.get(r.totalScore);
        if (existing) {
          existing.push(r);
        } else {
          scoreGroups.set(r.totalScore, [r]);
        }
      });

      scoreGroups.forEach((group, score) => {
        if (group.length > 1) {
          ties.push({
            score,
            projects: group.map((g) => g.project.name),
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

      const categoryTies: { category: string; avgScore: number; projects: string[] }[] = [];

      for (const cat of categoryNames) {
        const catGroups = new Map<number, string[]>();
        rankings.forEach((r) => {
          if (r.voteCount === 0) return;
          const avg = r.categoryAvg[cat];
          const existing = catGroups.get(avg);
          if (existing) {
            existing.push(r.project.name);
          } else {
            catGroups.set(avg, [r.project.name]);
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
        ties,
        hasTies: ties.length > 0,
        categoryTies,
        hasCategoryTies: categoryTies.length > 0,
      };

      ctx.cache.set(cacheKey, result, 30); // 30 second cache for live rankings

      return result;
    }),

  list: isAdmin.query(async ({ ctx }) => {
    const allJudges = await ctx.db!.query.judges.findMany({
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
      const user = await ctx.db!.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const existing = await ctx.db!.query.judges.findFirst({
        where: eq(judges.userId, input.userId),
      });

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already a judge",
        });
      }

      const result = await ctx.db!
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db!.query.judgeAssignments.findFirst({
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

      const result = await ctx.db!
        .insert(judgeAssignments)
        .values({
          judgeId: input.judgeId,
          hackathonId: input.hackathonId,
          isLead: input.isLead || false,
        })
        .returning();

      const projects = await ctx.db!.query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

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

      return result[0];
    }),

  createProject: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        name: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        tableNumber: z.number().min(1),
        teamMembers: z.string().max(500).optional(),
        projectUrl: z.string().url().optional(),
        repoUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db!
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
            category: z.string().max(100).optional(),
            teamMembers: z.string().max(500).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db!
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
      const result = await ctx.db!
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
      await ctx.db!
        .delete(judgeQueue)
        .where(
          and(
            eq(judgeQueue.judgeId, input.judgeId),
            eq(judgeQueue.hackathonId, input.hackathonId)
          )
        );

      let projects = await ctx.db!.query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

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
      await ctx.db!.delete(judges).where(eq(judges.id, input.judgeId));
      return { success: true };
    }),

  getAllVotes: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projects = await ctx.db!.query.judgingProjects.findMany({
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
