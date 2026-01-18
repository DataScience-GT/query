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
  admins,
} from "@query/db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { CacheKeys } from "../middleware/cache";

// Middleware to check if user is a judge
const isJudge = protectedProcedure.use(async ({ ctx, next }) => {
  const judge = await ctx.db!.query.judges.findFirst({
    where: and(
      eq(judges.userId, ctx.userId!),
      eq(judges.isActive, true)
    ),
  });

  if (!judge) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Judge access required",
    });
  }

  return next({ ctx: { ...ctx, judge } });
});

// Middleware to check if user is admin (for judge management)
const isAdmin = protectedProcedure.use(async ({ ctx, next }) => {
  const admin = await ctx.db!.query.admins.findFirst({
    where: and(
      eq(admins.userId, ctx.userId!),
      eq(admins.isActive, true)
    ),
  });

  if (!admin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({ ctx: { ...ctx, admin } });
});

export const judgeRouter = createTRPCRouter({
  // Check if current user is a judge
  isJudge: protectedProcedure.query(async ({ ctx }) => {
    // Check cache first
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

    // Cache for 60 seconds
    ctx.cache.set(cacheKey, result, 60);

    return result;
  }),

  // Get hackathons assigned to current judge
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

  // Get the next table to visit for a hackathon
  getNextTable: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get the next uncompleted item in the queue
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

      // Count remaining
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
    }),

  // Get all projects for a hackathon (for judges to see full list)
  getProjects: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projects = await ctx.db!.query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      // Get this judge's votes
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

  // Get map images for a hackathon
  getMaps: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const maps = await ctx.db!.query.hackathonMaps.findMany({
        where: eq(hackathonMaps.hackathonId, input.hackathonId),
        orderBy: [asc(hackathonMaps.order)],
      });

      return maps;
    }),

  // Submit a vote for a project
  submitVote: isJudge
    .input(
      z.object({
        projectId: z.string().uuid(),
        score: z.number().min(1).max(10),
        comment: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if vote already exists
      const existing = await ctx.db!.query.judgeVotes.findFirst({
        where: and(
          eq(judgeVotes.judgeId, ctx.judge.id),
          eq(judgeVotes.projectId, input.projectId)
        ),
      });

      if (existing) {
        // Update existing vote
        const result = await ctx.db!
          .update(judgeVotes)
          .set({
            score: input.score,
            comment: input.comment,
            updatedAt: new Date(),
          })
          .where(eq(judgeVotes.id, existing.id))
          .returning();

        return result[0];
      }

      // Create new vote
      const result = await ctx.db!
        .insert(judgeVotes)
        .values({
          judgeId: ctx.judge.id,
          projectId: input.projectId,
          score: input.score,
          comment: input.comment,
        })
        .returning();

      return result[0];
    }),

  // Mark a queue item as completed and move to next
  completeAndNext: isJudge
    .input(
      z.object({
        queueId: z.string().uuid(),
        projectId: z.string().uuid(),
        score: z.number().min(1).max(10),
        comment: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Submit the vote
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
            score: input.score,
            comment: input.comment,
            updatedAt: new Date(),
          })
          .where(eq(judgeVotes.id, existing.id));
      } else {
        await ctx.db!.insert(judgeVotes).values({
          judgeId: ctx.judge.id,
          projectId: input.projectId,
          score: input.score,
          comment: input.comment,
        });
      }

      // Mark queue item as completed
      await ctx.db!
        .update(judgeQueue)
        .set({
          isCompleted: true,
          completedAt: new Date(),
        })
        .where(eq(judgeQueue.id, input.queueId));

      // Get next in queue
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

  // Get judge progress for a hackathon
  getProgress: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const total = await ctx.db!
        .select({ count: sql<number>`count(*)` })
        .from(judgeQueue)
        .where(
          and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.hackathonId, input.hackathonId)
          )
        );

      const completed = await ctx.db!
        .select({ count: sql<number>`count(*)` })
        .from(judgeQueue)
        .where(
          and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.hackathonId, input.hackathonId),
            eq(judgeQueue.isCompleted, true)
          )
        );

      return {
        total: Number(total[0]?.count || 0),
        completed: Number(completed[0]?.count || 0),
        percentage: total[0]?.count
          ? Math.round((Number(completed[0]?.count || 0) / Number(total[0].count)) * 100)
          : 0,
      };
    }),

  // === Admin operations ===

  // Get rankings for a hackathon (with tie detection)
  getRankings: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get all projects with their votes
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

      // Calculate scores and detect ties
      const rankings = projects.map((project) => {
        const totalScore = project.votes.reduce((sum, v) => sum + v.score, 0);
        const voteCount = project.votes.length;
        const avgScore = voteCount > 0 ? totalScore / voteCount : 0;

        return {
          project: {
            id: project.id,
            name: project.name,
            tableNumber: project.tableNumber,
            teamMembers: project.teamMembers,
          },
          totalScore,
          voteCount,
          avgScore: Math.round(avgScore * 100) / 100,
          votes: project.votes.map((v) => ({
            score: v.score,
            comment: v.comment,
            judgeName: v.judge.user?.name || v.judge.name || "Unknown",
          })),
        };
      });

      // Sort by total score descending
      rankings.sort((a, b) => b.totalScore - a.totalScore);

      // Detect ties
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

      return {
        rankings,
        ties,
        hasTies: ties.length > 0,
      };
    }),

  // List all judges
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

  // Create a new judge
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

  // Assign judge to hackathon
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

      // Create queue entries for all projects
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

  // Create a project (for seeding)
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

  // Bulk create projects (for seeding)
  bulkCreateProjects: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        projects: z.array(
          z.object({
            name: z.string().min(1).max(255),
            description: z.string().max(1000).optional(),
            tableNumber: z.number().min(1),
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

  // Add a map image
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

  // Initialize queue for a judge (if they join late or queue needs reset)
  initializeQueue: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        hackathonId: z.string().uuid(),
        shuffle: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Delete existing queue
      await ctx.db!
        .delete(judgeQueue)
        .where(
          and(
            eq(judgeQueue.judgeId, input.judgeId),
            eq(judgeQueue.hackathonId, input.hackathonId)
          )
        );

      // Get all projects
      let projects = await ctx.db!.query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      // Optionally shuffle
      if (input.shuffle) {
        projects = projects.sort(() => Math.random() - 0.5);
      }

      // Create queue entries
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

  // Delete a judge
  remove: isAdmin
    .input(z.object({ judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db!.delete(judges).where(eq(judges.id, input.judgeId));
      return { success: true };
    }),

  // Get all votes for a hackathon (for admin review)
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
