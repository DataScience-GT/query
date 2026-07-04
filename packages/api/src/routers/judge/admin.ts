import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../../trpc";
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
import { isAdmin } from "../../middleware/procedures";
import type { DrizzleDB } from "@query/db";
import { shuffleArray, buildCoverageQueues } from "./helpers";

export const judgeAdminRouter = createTRPCRouter({
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
        hackathonId: z.string().uuid(),
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
        where: and(
          eq(judges.userId, input.userId),
          eq(judges.hackathonId, input.hackathonId),
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already a judge for this hackathon",
        });
      }

      const result = await (ctx.db as DrizzleDB)
        .insert(judges)
        .values({
          userId: input.userId,
          hackathonId: input.hackathonId,
          name: input.name || user.name,
          isActive: true, // Manually created judges are active by default
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

            // 2. Find or create judge record for this hackathon
            let judge = await tx.query.judges.findFirst({
              where: and(
                eq(judges.userId, user.id),
                eq(judges.hackathonId, input.hackathonId),
              ),
            });

            if (!judge) {
              const [newJudge] = await tx
                .insert(judges)
                .values({
                  userId: user.id,
                  hackathonId: input.hackathonId,
                  name: j.name,
                  isActive: true,
                })
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

        // Find existing judge profile or create one for this hackathon
        let judge = await tx.query.judges.findFirst({
          where: and(
            eq(judges.userId, ctx.userId),
            eq(judges.hackathonId, input.hackathonId),
          ),
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
              hackathonId: input.hackathonId,
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
