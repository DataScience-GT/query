import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../../trpc";
import { hackathonResults, hackathons, judgingProjects } from "@query/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { isAdmin } from "../../middleware/procedures";
import type { DrizzleDB } from "@query/db";
import { zNormalize } from "./helpers";

/**
 * The whole ranking pipeline, in one place.
 *
 * Extracted so the live view and the frozen snapshot cannot drift: two
 * implementations of a scoring formula are two different answers to "who
 * won", and only one of them gets announced.
 */
async function computeRanking(db: DrizzleDB, hackathonId: string) {
  const projects = await db.query.judgingProjects.findMany({
    where: eq(judgingProjects.hackathonId, hackathonId),
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
        // Carried through so a frozen placing can name the team that built it.
        // Without it a winner is a judging row and nothing more.
        sourceProjectId: project.sourceProjectId,
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

  return result;
}

export const judgeRankingsRouter = createTRPCRouter({
  getRankings: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:rankings`;
      const cached =
        ctx.cache.get<Awaited<ReturnType<typeof computeRanking>>>(cacheKey);
      if (cached) return cached;

      const result = await computeRanking(
        ctx.db as DrizzleDB,
        input.hackathonId,
      );

      ctx.cache.set(cacheKey, result, 30); // 30 second cache for live rankings

      return result;
    }),

  /**
   * Freezes the current ordering into hackathon_result.
   *
   * Gated on judging being closed: the z-score normalisation runs over the
   * whole vote set, so a single vote arriving after this would have shifted
   * every score. Computing while judging is live produces a snapshot that is
   * already stale.
   *
   * Idempotent — recomputing upserts onto result_unique_placing rather than
   * appending a second, contradictory ordering. Published placings are left
   * alone; unpublish first if you mean to change what people have seen.
   */
  computeResults: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        /** Compute even though judging is still open. The result is a draft
         *  of an ordering that is still moving. */
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { id: true, judgingActive: true },
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      if (hackathon.judgingActive && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Judging is still live, so scores are still moving. Stop judging first, or confirm to compute a draft anyway.",
        });
      }

      const published = await db.query.hackathonResults.findFirst({
        where: and(
          eq(hackathonResults.hackathonId, input.hackathonId),
          isNotNull(hackathonResults.publishedAt),
        ),
        columns: { id: true },
      });

      if (published) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Results are already published. Unpublish them before recomputing.",
        });
      }

      // Reuses the live ranking pipeline rather than duplicating the maths —
      // two implementations of a scoring formula is two answers to "who won".
      const { rankings } = await computeRanking(db, input.hackathonId);

      if (rankings.length === 0) {
        return { computed: 0 };
      }

      await db
        .insert(hackathonResults)
        .values(
          rankings.map((row, index) => ({
            hackathonId: input.hackathonId,
            projectId: row.project.id,
            sourceProjectId: row.project.sourceProjectId ?? null,
            track: null,
            placement: index + 1,
            weightedScore: row.weightedScore.toFixed(2),
            voteCount: row.voteCount,
          })),
        )
        .onConflictDoUpdate({
          target: [
            hackathonResults.hackathonId,
            hackathonResults.projectId,
            hackathonResults.track,
          ],
          set: {
            placement: sql`excluded.placement`,
            weightedScore: sql`excluded.weighted_score`,
            voteCount: sql`excluded.vote_count`,
            computedAt: sql`now()`,
          },
        });

      ctx.cache.delete(`hackathon:${input.hackathonId}:results`);

      return { computed: rankings.length };
    }),

  /** What has been computed, published or not. Admin review before release. */
  getResultsDraft: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).query.hackathonResults.findMany({
        where: eq(hackathonResults.hackathonId, input.hackathonId),
        with: { project: { columns: { id: true, name: true, tableNumber: true } } },
        orderBy: (results, { asc }) => [asc(results.placement)],
      });
    }),

  publishResults: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await (ctx.db as DrizzleDB)
        .update(hackathonResults)
        .set({ publishedAt: new Date() })
        .where(eq(hackathonResults.hackathonId, input.hackathonId))
        .returning({ id: hackathonResults.id });

      if (rows.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nothing to publish — compute the results first.",
        });
      }

      ctx.cache.delete(`hackathon:${input.hackathonId}:results`);

      return { published: rows.length };
    }),

  /** Takes results back down. The rows survive, so publishing is reversible
   *  rather than a one-way door on a wrong ordering. */
  unpublishResults: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await (ctx.db as DrizzleDB)
        .update(hackathonResults)
        .set({ publishedAt: null })
        .where(eq(hackathonResults.hackathonId, input.hackathonId))
        .returning({ id: hackathonResults.id });

      ctx.cache.delete(`hackathon:${input.hackathonId}:results`);

      return { unpublished: rows.length };
    }),
});
