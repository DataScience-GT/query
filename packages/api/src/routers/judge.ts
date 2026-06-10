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
  hackathonParticipants,
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

/**
 * Z-score normalizes a judge's scores relative to their own mean/stddev.
 * This removes per-judge harshness/leniency bias before aggregation.
 * Returns null if fewer than 2 data points (can't compute meaningful stddev).
 */
function zNormalize(
  scores: number[],
  globalMean: number,
  globalStd: number,
): number[] {
  if (scores.length < 2) return scores.map(() => globalMean);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
  const std = Math.sqrt(variance);
  if (std === 0) return scores.map(() => globalMean); // judge gave same score to everything
  return scores.map((v) => globalMean + ((v - mean) / std) * globalStd);
}

/**
 * Coverage-maximizing round-robin assignment.
 * Guarantees every project is seen at least `minCoverage` times before
 * any project gets an extra judge. Respects track constraints.
 */
function buildCoverageQueues(
  judgeAssignmentsList: { judgeId: string; track: string | null }[],
  projects: {
    id: string;
    tracks: string[] | null;
    challenges: string[] | null;
    tableNumber: number;
  }[],
  mainTracks: Set<string>,
  opts: {
    minProjects: number;
    maxProjects: number;
    shuffle: boolean;
    groupSpecial: boolean;
  },
): Map<string, string[]> {
  const queues = new Map<string, string[]>();
  for (const a of judgeAssignmentsList) queues.set(a.judgeId, []);

  // Coverage counter: projectId -> how many judges are assigned
  const coverage = new Map<string, number>(projects.map((p) => [p.id, 0]));

  // For each judge, determine their eligible project pool
  const eligiblePool = new Map<string, typeof projects>();
  for (const a of judgeAssignmentsList) {
    const track = a.track;
    const isSpecial = track ? !mainTracks.has(track) : false;
    const pool = track
      ? projects.filter((p) => {
          const inTracks = p.tracks?.includes(track) ?? false;
          const inChallenges = p.challenges?.includes(track) ?? false;
          const matchCreateX =
            track.toLowerCase() === "createx" &&
            !!(p as { isCreateX?: boolean }).isCreateX;
          return inTracks || inChallenges || matchCreateX;
        })
      : projects;

    if (isSpecial) {
      // Special judges always get their full pool
      const ordered = opts.groupSpecial ? pool : shuffleArray(pool);
      queues.set(
        a.judgeId,
        ordered.map((p) => p.id),
      );
      for (const p of ordered)
        coverage.set(p.id, (coverage.get(p.id) ?? 0) + 1);
      eligiblePool.set(a.judgeId, []);
    } else {
      eligiblePool.set(a.judgeId, opts.shuffle ? shuffleArray(pool) : pool);
    }
  }

  // Round-robin fill: prioritize under-covered projects
  const mainJudges = judgeAssignmentsList.filter(
    (a) => !a.track || mainTracks.has(a.track),
  );

  let anyChange = true;
  while (anyChange) {
    anyChange = false;
    for (const a of mainJudges) {
      const queue = queues.get(a.judgeId)!;
      if (queue.length >= opts.maxProjects) continue;
      const pool = eligiblePool.get(a.judgeId)!;

      // Find the next project with the lowest coverage that isn't already in this queue
      const assigned = new Set(queue);
      const candidate = pool
        .filter((p) => !assigned.has(p.id))
        .sort(
          (a, b) => (coverage.get(a.id) ?? 0) - (coverage.get(b.id) ?? 0),
        )[0];

      if (!candidate) continue;
      if (
        queue.length >= opts.minProjects &&
        (coverage.get(candidate.id) ?? 0) > 0
      )
        continue;

      queue.push(candidate.id);
      coverage.set(candidate.id, (coverage.get(candidate.id) ?? 0) + 1);
      anyChange = true;
    }
  }

  // Shift/rotate the generated queues to stagger sequences and reduce judge bias
  for (let i = 0; i < judgeAssignmentsList.length; i++) {
    const judgeId = judgeAssignmentsList[i].judgeId;
    const q = queues.get(judgeId);
    if (q && q.length > 1) {
      const offset = i % q.length;
      const rotated = [...q.slice(offset), ...q.slice(0, offset)];
      queues.set(judgeId, rotated);
    }
  }

  return queues;
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

  getRankings: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:rankings`;
      const cached = ctx.cache.get<typeof result>(cacheKey);
      if (cached) return cached;

      const projects = await (
        ctx.db as DrizzleDB
      ).query.judgingProjects.findMany({
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

      // ─── Step 1: Collect all raw scores grouped by judge ──────────────────
      // We need per-judge score distributions to perform Z-score normalization,
      // which eliminates the "harsh judge / lenient judge" bias problem.
      type VoteWithJudge = (typeof projects)[number]["votes"][number];
      const scoresByJudge = new Map<string, number[]>();
      for (const project of projects) {
        for (const v of project.votes) {
          const existing = scoresByJudge.get(v.judgeId) ?? [];
          existing.push(v.score);
          scoresByJudge.set(v.judgeId, existing);
        }
      }

      // ─── Step 2: Compute global score distribution ─────────────────────────
      const allRawScores = [...scoresByJudge.values()].flat();
      const globalMean =
        allRawScores.length > 0
          ? allRawScores.reduce((a, b) => a + b, 0) / allRawScores.length
          : 0;
      const globalVariance =
        allRawScores.length > 0
          ? allRawScores.reduce((s, v) => s + (v - globalMean) ** 2, 0) /
            allRawScores.length
          : 1;
      const globalStd = Math.sqrt(globalVariance) || 1;

      // ─── Step 3: Build per-judge normalized score lookup ──────────────────
      // For each judge, map their raw score index to a Z-normalized score.
      const normalizedScoreLookup = new Map<string, Map<number, number>>();
      for (const [judgeId, rawScores] of scoresByJudge.entries()) {
        const normalized = zNormalize(rawScores, globalMean, globalStd);
        // Map raw score value -> normalized value (index-based, preserves order)
        const lookup = new Map<number, number>();
        rawScores.forEach((raw, i) => {
          // If same raw score appears multiple times, average the normalized values
          const existing = lookup.get(raw);
          lookup.set(
            raw,
            existing !== undefined
              ? (existing + normalized[i]!) / 2
              : normalized[i]!,
          );
        });
        normalizedScoreLookup.set(judgeId, lookup);
      }

      const getNormalized = (judgeId: string, rawScore: number): number => {
        const lookup = normalizedScoreLookup.get(judgeId);
        return lookup?.get(rawScore) ?? rawScore;
      };

      // ─── Step 4: Build raw + normalized stats per project ─────────────────
      const C = 2; // Bayesian confidence weight

      const rawRankings = projects.map((project) => {
        const voteCount = project.votes.length;

        // Raw scores (unadjusted)
        const totalScore = project.votes.reduce((sum, v) => sum + v.score, 0);
        const avgScore = voteCount > 0 ? totalScore / voteCount : 0;

        // Z-score normalized scores (bias-corrected)
        const normalizedScores = project.votes.map((v) =>
          getNormalized(v.judgeId, v.score),
        );
        const normalizedAvg =
          voteCount > 0
            ? round2(normalizedScores.reduce((a, b) => a + b, 0) / voteCount)
            : 0;

        // Per-category averages (raw)
        const sumCat = {
          creativity: 0,
          impact: 0,
          scope: 0,
          clarity: 0,
          soundness: 0,
        };
        project.votes.forEach((v) => {
          sumCat.creativity += v.scoreCreativity ?? 0;
          sumCat.impact += v.scoreImpact ?? 0;
          sumCat.scope += v.scoreScope ?? 0;
          sumCat.clarity += v.scoreClarity ?? 0;
          sumCat.soundness += v.scoreSoundness ?? 0;
        });

        const categoryAvg =
          voteCount > 0
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
          normalizedAvg,
          categoryAvg,
          votes: project.votes.map((v, i) => ({
            score: v.score,
            normalizedScore: round2(normalizedScores[i] ?? v.score),
            scoreCreativity: v.scoreCreativity,
            scoreImpact: v.scoreImpact,
            scoreScope: v.scoreScope,
            scoreClarity: v.scoreClarity,
            scoreSoundness: v.scoreSoundness,
            comment: v.comment,
            durationSeconds: v.durationSeconds,
            judgeName:
              (
                v as VoteWithJudge & {
                  judge: {
                    user?: { name?: string | null };
                    name?: string | null;
                  };
                }
              ).judge.user?.name ||
              (
                v as VoteWithJudge & {
                  judge: {
                    user?: { name?: string | null };
                    name?: string | null;
                  };
                }
              ).judge.name ||
              "Unknown",
          })),
        };
      });

      // ─── Step 5: Compute global normalized average for Bayesian prior ──────
      const votedProjects = rawRankings.filter((r) => r.voteCount > 0);
      const globalAvg =
        votedProjects.length > 0
          ? round2(
              votedProjects.reduce((sum, r) => sum + r.normalizedAvg, 0) /
                votedProjects.length,
            )
          : 0;

      // ─── Step 6: Bayesian + Z-score combined final score ──────────────────
      // weightedScore blends normalized avg toward the global mean when few judges voted.
      const rankings = rawRankings.map((r) => {
        const n = r.voteCount;
        const weightedScore =
          n > 0
            ? round2(
                (n / (n + C)) * r.normalizedAvg + (C / (n + C)) * globalAvg,
              )
            : 0;
        const confidenceLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" =
          n === 0 ? "NONE" : n === 1 ? "LOW" : n === 2 ? "MEDIUM" : "HIGH";
        const scoreShift = round2(r.normalizedAvg - r.avgScore); // how much bias-correction shifted this project

        return { ...r, weightedScore, confidenceLevel, scoreShift };
      });

      // Sort by weighted score desc
      rankings.sort((a, b) => b.weightedScore - a.weightedScore);

      // Weighted-score ties
      const ties: {
        score: number;
        projects: {
          id: string;
          name: string;
          tableNumber: number;
          zone: string | null;
        }[];
      }[] = [];
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
            projects: group.map((g) => ({
              id: g.project.id,
              name: g.project.name,
              tableNumber: g.project.tableNumber,
              zone: g.project.zone ?? null,
            })),
          });
        }
      });

      // Per-category ties (only among projects with votes)
      const categoryNames = [
        "creativity",
        "impact",
        "scope",
        "clarity",
        "soundness",
      ] as const;
      const categoryLabels: Record<(typeof categoryNames)[number], string> = {
        creativity: "Creativity",
        impact: "Impact",
        scope: "Scope",
        clarity: "Clarity",
        soundness: "Soundness",
      };

      const categoryTies: {
        category: string;
        avgScore: number;
        projects: {
          id: string;
          name: string;
          tableNumber: number;
          zone: string | null;
        }[];
      }[] = [];

      for (const cat of categoryNames) {
        const catGroups = new Map<
          number,
          {
            id: string;
            name: string;
            tableNumber: number;
            zone: string | null;
          }[]
        >();
        rankings.forEach((r) => {
          if (r.voteCount === 0) return;
          const avg = r.categoryAvg[cat];
          const existing = catGroups.get(avg);
          const projectInfo = {
            id: r.project.id,
            name: r.project.name,
            tableNumber: r.project.tableNumber,
            zone: r.project.zone ?? null,
          };
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
      }),
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await (
        ctx.db as DrizzleDB
      ).query.judgeAssignments.findFirst({
        where: and(
          eq(judgeAssignments.judgeId, input.judgeId),
          eq(judgeAssignments.hackathonId, input.hackathonId),
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

      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { tracks: true },
      });
      const mainTracks = new Set(hackathon?.tracks ?? []);

      const allProjects = await (
        ctx.db as DrizzleDB
      ).query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      // Filter by track if assigned (fixes bug: previously assigned ALL projects regardless of track)
      const track = input.track ?? null;
      const isSpecial = track ? !mainTracks.has(track) : false;
      const eligibleProjects = track
        ? allProjects.filter((p) => {
            const inTracks = p.tracks?.includes(track) ?? false;
            const inChallenges = p.challenges?.includes(track) ?? false;
            const matchCreateX =
              track.toLowerCase() === "createx" && !!p.isCreateX;
            return inTracks || inChallenges || matchCreateX;
          })
        : allProjects;

      // Special judges always get their full pool; main track judges get a shuffled subset
      const assignedProjects = isSpecial
        ? eligibleProjects
        : shuffleArray(eligibleProjects);

      if (assignedProjects.length > 0) {
        await (ctx.db as DrizzleDB).insert(judgeQueue).values(
          assignedProjects.map((p, idx) => ({
            judgeId: input.judgeId,
            hackathonId: input.hackathonId,
            projectId: p.id,
            order: idx + 1,
          })),
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
      }),
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
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await (ctx.db as DrizzleDB)
        .insert(judgingProjects)
        .values(
          input.projects.map((p) => ({
            ...p,
            hackathonId: input.hackathonId,
          })),
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
          }),
        ),
      }),
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
            const existingAssignment =
              await tx.query.judgeAssignments.findFirst({
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
            results.errors.push(
              `${j.email}: ${e instanceof Error ? e.message : "Unknown error"}`,
            );
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
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the current max table number for this hackathon
      const maxResult = await (ctx.db as DrizzleDB)
        .select({
          max: sql<number>`COALESCE(MAX(${judgingProjects.tableNumber}), 0)`,
        })
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

      return {
        created: result.length,
        startTable: rows[0]?.tableNumber,
        endTable: rows[rows.length - 1]?.tableNumber,
      };
    }),

  addMap: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        imageUrl: z.string().url(),
        name: z.string().max(100).optional(),
        order: z.number().min(0).default(0),
      }),
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await (ctx.db as DrizzleDB)
        .delete(judgeQueue)
        .where(
          and(
            eq(judgeQueue.judgeId, input.judgeId),
            eq(judgeQueue.hackathonId, input.hackathonId),
          ),
        );

      // Get judge assignment to check for track restriction
      const assignment = await (
        ctx.db as DrizzleDB
      ).query.judgeAssignments.findFirst({
        where: and(
          eq(judgeAssignments.judgeId, input.judgeId),
          eq(judgeAssignments.hackathonId, input.hackathonId),
        ),
      });

      // Fetch all projects (or filter in query if possible, but JS filter matches assignToHackathon logic)
      const allProjects = await (
        ctx.db as DrizzleDB
      ).query.judgingProjects.findMany({
        where: eq(judgingProjects.hackathonId, input.hackathonId),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      // Filter based on track if assigned
      let projects = assignment?.track
        ? allProjects.filter((p) => {
            const inTracks = p.tracks?.includes(assignment.track!) ?? false;
            const inChallenges =
              p.challenges?.includes(assignment.track!) ?? false;
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
          })),
        );
      }

      return { success: true, projectCount: projects.length };
    }),

  remove: isAdmin
    .input(z.object({ judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await (ctx.db as DrizzleDB)
        .delete(judges)
        .where(eq(judges.id, input.judgeId));
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
        autoCalculate: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        const hackathon = await tx.query.hackathons.findFirst({
          where: eq(hackathons.id, input.hackathonId),
        });
        if (!hackathon)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Hackathon not found",
          });

        const MAIN_TRACKS = new Set(hackathon.tracks ?? []);

        const allAssignments = await tx.query.judgeAssignments.findMany({
          where: eq(judgeAssignments.hackathonId, input.hackathonId),
          with: { judge: true },
        });

        const allProjects = await tx.query.judgingProjects.findMany({
          where: eq(judgingProjects.hackathonId, input.hackathonId),
          orderBy: [asc(judgingProjects.tableNumber)],
        });

        if (allProjects.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No projects found for this hackathon",
          });
        }

        let minProjects = input.minProjects;
        let maxProjects = input.maxProjects;

        if (input.autoCalculate) {
          // Count active registered participants
          const participantCountResult = await tx
            .select({ count: sql<number>`count(*)` })
            .from(hackathonParticipants)
            .where(
              and(
                eq(hackathonParticipants.hackathonId, input.hackathonId),
                sql`${hackathonParticipants.registrationStatus} != 'rejected'`,
              ),
            );
          const activeRegistrations = Number(
            participantCountResult[0]?.count || 0,
          );

          const P =
            allProjects.length || Math.ceil(activeRegistrations / 4) || 1;
          const mainJudgesCount =
            allAssignments.filter((a) => !a.track || MAIN_TRACKS.has(a.track))
              .length || 40; // Default to 40 judges as requested

          // Formula: Required Grades = Max(3, Floor((Total Judges * Judging Window Hours) / (Total Projects * Avg Time Per Project)))
          // Judging Window: 3 hours. Avg Time Per Project: 12 minutes (0.2 hours).
          const judgingWindowHours = 3;
          const avgTimePerProjectHours = 0.2;
          const calculatedQuota = Math.floor(
            (mainJudgesCount * judgingWindowHours) /
              (P * avgTimePerProjectHours),
          );

          const targetCoverage = Math.max(3, calculatedQuota);
          const avgRequired = Math.ceil((P * targetCoverage) / mainJudgesCount);

          // Reduce cap: Judges should not have 20 projects. Setting a more reasonable cap of 12.
          minProjects = Math.max(3, Math.min(avgRequired, 12));
          maxProjects = Math.max(
            minProjects + 1,
            Math.min(avgRequired + 1, 14),
          );
        }

        // Clear existing queues
        await tx
          .delete(judgeQueue)
          .where(eq(judgeQueue.hackathonId, input.hackathonId));

        // ── Coverage-maximizing assignment ──────────────────────────────────
        // Uses buildCoverageQueues to guarantee every project is seen by at
        // least one judge before any project gets an extra judge. This replaces
        // the old random-slice approach which could leave some projects unseen.
        const judgeList = allAssignments.map((a) => ({
          judgeId: a.judgeId,
          track: a.track ?? null,
        }));
        const projectList = allProjects.map((p) => ({
          id: p.id,
          tracks: p.tracks ?? null,
          challenges: p.challenges ?? null,
          tableNumber: p.tableNumber,
          isCreateX: p.isCreateX,
        }));

        const queues = buildCoverageQueues(
          judgeList,
          projectList,
          MAIN_TRACKS,
          {
            minProjects,
            maxProjects,
            shuffle: input.shuffle,
            groupSpecial: input.groupSpecial,
          },
        );

        // Build all insert rows in one pass
        const insertRows: {
          judgeId: string;
          hackathonId: string;
          projectId: string;
          order: number;
        }[] = [];
        for (const [judgeId, projectIds] of queues.entries()) {
          projectIds.forEach((projectId, idx) => {
            insertRows.push({
              judgeId,
              hackathonId: input.hackathonId,
              projectId,
              order: idx + 1,
            });
          });
        }

        if (insertRows.length > 0) {
          await tx.insert(judgeQueue).values(insertRows);
        }

        // Compute coverage stats for admin feedback
        const projectCoverage = new Map<string, number>();
        for (const row of insertRows) {
          projectCoverage.set(
            row.projectId,
            (projectCoverage.get(row.projectId) ?? 0) + 1,
          );
        }
        const coverageValues = [...projectCoverage.values()];
        const uncoveredCount = allProjects.length - projectCoverage.size;
        const avgCoverage =
          coverageValues.length > 0
            ? Math.round(
                (coverageValues.reduce((a, b) => a + b, 0) /
                  coverageValues.length) *
                  10,
              ) / 10
            : 0;
        const minCoverage =
          coverageValues.length > 0 ? Math.min(...coverageValues) : 0;
        const maxCoverage =
          coverageValues.length > 0 ? Math.max(...coverageValues) : 0;

        const results = allAssignments.map((a) => ({
          judgeId: a.judgeId,
          judgeName: a.judge.name,
          track: a.track ?? null,
          assignedCount: queues.get(a.judgeId)?.length ?? 0,
        }));

        return {
          success: true,
          totalJudges: results.length,
          totalInsertedRows: insertRows.length,
          coverage: {
            avg: avgCoverage,
            min: minCoverage,
            max: maxCoverage,
            uncovered: uncoveredCount,
          },
          assignments: results,
        };
      });
    }),

  /** Per-judge scoring analytics for bias detection and performance review. */
  getJudgeAnalytics: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:judge-analytics`;
      const cached = ctx.cache.get<unknown>(cacheKey);
      if (cached) return cached;

      // Fetch votes for this hackathon via an explicit join.
      const allVotes = await (ctx.db as DrizzleDB)
        .select({
          judgeId: judgeVotes.judgeId,
          projectId: judgeVotes.projectId,
          score: judgeVotes.score,
          durationSeconds: judgeVotes.durationSeconds,
          judgeName: judges.name,
          judgeUserId: judges.userId,
        })
        .from(judgeVotes)
        .innerJoin(judges, eq(judges.id, judgeVotes.judgeId))
        .innerJoin(
          judgingProjects,
          and(
            eq(judgingProjects.id, judgeVotes.projectId),
            eq(judgingProjects.hackathonId, input.hackathonId),
          ),
        );

      const queueStats = await (ctx.db as DrizzleDB)
        .select({
          judgeId: judgeQueue.judgeId,
          total: sql<number>`count(*)`,
          completed: sql<number>`sum(case when ${judgeQueue.isCompleted} then 1 else 0 end)`,
        })
        .from(judgeQueue)
        .where(eq(judgeQueue.hackathonId, input.hackathonId))
        .groupBy(judgeQueue.judgeId);

      const queueMap = new Map(queueStats.map((q) => [q.judgeId, q]));

      // Group votes by judgeId
      const byJudge = new Map<string, typeof allVotes>();
      for (const vote of allVotes) {
        const list = byJudge.get(vote.judgeId) ?? [];
        list.push(vote);
        byJudge.set(vote.judgeId, list);
      }

      // Global mean across all votes
      const allScores = allVotes.map((v) => v.score);
      const globalMean =
        allScores.length > 0
          ? allScores.reduce((a, b) => a + b, 0) / allScores.length
          : 0;

      const round2 = (n: number) => Math.round(n * 100) / 100;

      const analytics = [...byJudge.entries()].map(([judgeId, votes]) => {
        const scores = votes.map((v) => v.score);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance =
          scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
        const std = Math.sqrt(variance);

        // Bias score: how far this judge's mean is from the global mean, in std units
        const biasScore = round2((mean - globalMean) / (std || 1));
        const biasLabel: "strict" | "neutral" | "lenient" =
          biasScore < -0.5 ? "strict" : biasScore > 0.5 ? "lenient" : "neutral";

        const avgDuration = votes
          .filter((v) => v.durationSeconds != null)
          .reduce((s, v, _, a) => s + (v.durationSeconds ?? 0) / a.length, 0);

        const qs = queueMap.get(judgeId);
        const completionRate =
          qs && Number(qs.total) > 0
            ? round2(Number(qs.completed) / Number(qs.total))
            : null;

        const firstVote = votes[0];

        return {
          judgeId,
          name: firstVote?.judgeName ?? "Unknown",
          votesSubmitted: scores.length,
          mean: round2(mean),
          std: round2(std),
          min: Math.min(...scores),
          max: Math.max(...scores),
          biasScore,
          biasLabel,
          avgDurationSeconds: avgDuration > 0 ? round2(avgDuration) : null,
          completionRate,
          queueTotal: qs ? Number(qs.total) : null,
          queueCompleted: qs ? Number(qs.completed) : null,
        };
      });

      // Sort: most votes first
      analytics.sort((a, b) => b.votesSubmitted - a.votesSubmitted);

      const result = {
        analytics,
        globalMean: round2(globalMean),
        totalVotes: allVotes.length,
      };
      ctx.cache.set(cacheKey, result, 30);
      return result;
    }),

  getAllVotes: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const projects = await (
        ctx.db as DrizzleDB
      ).query.judgingProjects.findMany({
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

  register: protectedProcedure
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        name: z.string().min(1).max(200),
        email: z.string().email().max(200),
        phone: z.string().max(20).optional(),
        company: z.string().max(200).optional(),
        title: z.string().max(200).optional(),
        specialty: z.string().max(200).optional(),
        linkedinUrl: z.string().url().max(500).optional().or(z.literal("")),
        githubUrl: z.string().url().max(500).optional().or(z.literal("")),
        previousExperience: z.string().max(2000).optional(),
        dietaryRestrictions: z.array(z.string()).optional(),
        shirtSize: z.string().optional(),
        whyJudge: z.string().max(2000).optional(),
        preferredTrack: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // Check if user is registered as a participant for this hackathon
        const participant = await tx.query.hackathonParticipants.findFirst({
          where: and(
            eq(hackathonParticipants.hackathonId, input.hackathonId),
            eq(hackathonParticipants.userId, ctx.userId as string),
          ),
        });

        if (participant) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "You cannot apply to be a judge because you are registered as a participant for this hackathon.",
          });
        }

        // Find existing judge profile or create one
        let judge = await tx.query.judges.findFirst({
          where: eq(judges.userId, ctx.userId),
        });

        if (judge) {
          await tx
            .update(judges)
            .set({
              name: input.name,
              email: input.email,
              phone: input.phone,
              company: input.company,
              title: input.title,
              specialty: input.specialty,
              linkedinUrl: input.linkedinUrl,
              githubUrl: input.githubUrl,
              previousExperience: input.previousExperience,
              dietaryRestrictions: input.dietaryRestrictions || [],
              shirtSize: input.shirtSize,
              whyJudge: input.whyJudge,
            })
            .where(eq(judges.id, judge.id));
        } else {
          const inserted = await tx
            .insert(judges)
            .values({
              userId: ctx.userId,
              name: input.name,
              email: input.email,
              phone: input.phone,
              company: input.company,
              title: input.title,
              specialty: input.specialty,
              linkedinUrl: input.linkedinUrl || null,
              githubUrl: input.githubUrl || null,
              previousExperience: input.previousExperience,
              dietaryRestrictions: input.dietaryRestrictions || [],
              shirtSize: input.shirtSize,
              whyJudge: input.whyJudge,
              isActive: false, // Must be approved by admin
            })
            .returning();
          judge = inserted[0];
        }

        // Create the hackathon assignment request
        if (!judge)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create judge profile",
          });

        const existingAssignment = await tx.query.judgeAssignments.findFirst({
          where: and(
            eq(judgeAssignments.judgeId, judge.id),
            eq(judgeAssignments.hackathonId, input.hackathonId),
          ),
        });

        if (existingAssignment) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You have already applied to judge this hackathon.",
          });
        }

        await tx.insert(judgeAssignments).values({
          judgeId: judge.id,
          hackathonId: input.hackathonId,
          track: input.preferredTrack,
          status: "pending",
        });

        return { success: true };
      });
    }),
});
