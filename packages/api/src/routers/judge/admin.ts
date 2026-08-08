import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  judges,
  judgeAssignments,
  judgeVotes,
  judgingProjects,
  judgeQueue,
  hackathons,
  hackathonProjects,
  users,
  hackathonParticipants,
} from "@query/db";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { isAdmin } from "../../middleware/procedures";
import { CacheKeys } from "../../middleware/cache";
import type { DrizzleDB } from "@query/db";
import { shuffleArray, buildCoverageQueues } from "./helpers";

/** Rows per queue INSERT. Well under the ~16k that Postgres's 65535-parameter
 *  ceiling allows at 4 bound parameters per row. */
const QUEUE_INSERT_CHUNK = 5000;

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
      // A judges row belongs to one hackathon, and isJudge authorizes against
      // that. Assigning across editions builds a queue nobody can ever open.
      const judge = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
        columns: { hackathonId: true },
      });

      if (!judge) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Judge not found" });
      }

      if (judge.hackathonId !== input.hackathonId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This judge belongs to a different hackathon",
        });
      }

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

  /**
   * Turns submitted projects into judgeable ones.
   *
   * This is the only way a judging entry comes into existence. Teams submit
   * through the portal, an organiser presses one button, and every submission
   * gets a table number. Idempotent by design — run it again as late
   * submissions land and only the new ones are added, because
   * judging_project_source_unique pins one judgeable row per submission.
   */
  promoteSubmissions: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // Serializes concurrent promotions for this event, so two organisers
        // pressing the button together cannot both read the same max table
        // number and hand out duplicates.
        await tx
          .select({ id: hackathons.id })
          .from(hackathons)
          .where(eq(hackathons.id, input.hackathonId))
          .for("update");

        const submissions = await tx.query.hackathonProjects.findMany({
          where: and(
            eq(hackathonProjects.hackathonId, input.hackathonId),
            inArray(hackathonProjects.status, ["submitted", "judging"]),
          ),
          with: { team: { columns: { name: true } } },
          orderBy: [asc(hackathonProjects.submittedAt)],
        });

        if (submissions.length === 0) {
          return {
            created: 0,
            alreadyPresent: 0,
            total: 0,
            queuesNeedRebuild: false,
          };
        }

        const existing = await tx.query.judgingProjects.findMany({
          where: eq(judgingProjects.hackathonId, input.hackathonId),
          columns: { id: true, sourceProjectId: true, tableNumber: true },
        });

        const promoted = new Set(
          existing
            .map((row) => row.sourceProjectId)
            .filter((id): id is string => !!id),
        );

        const fresh = submissions.filter((s) => !promoted.has(s.id));

        let nextTable = existing.reduce(
          (max, row) => Math.max(max, row.tableNumber),
          0,
        );

        if (fresh.length > 0) {
          await tx.insert(judgingProjects).values(
            fresh.map((submission) => ({
              hackathonId: input.hackathonId,
              sourceProjectId: submission.id,
              name: submission.name,
              description: submission.description,
              tableNumber: ++nextTable,
              // hackathon_project.teamMembers is text[]; this column is a
              // single text field. Joined, not assigned — handing an array
              // straight over is a type error at best and "[object Object]"
              // on a judge's screen at worst.
              teamMembers:
                submission.team?.name ??
                (submission.teamMembers?.length
                  ? submission.teamMembers.join(", ")
                  : null),
              projectUrl: submission.demoUrl,
              repoUrl: submission.githubUrl,
              tracks: submission.tracks?.length ? submission.tracks : null,
              challenges: submission.challenges?.length
                ? submission.challenges
                : null,
              isCreateX: submission.isCreateX ?? false,
            })),
          );

          await tx
            .update(hackathonProjects)
            .set({ status: "judging", updatedAt: new Date() })
            .where(
              inArray(
                hackathonProjects.id,
                fresh.map((submission) => submission.id),
              ),
            );
        }

        // Queues are built from a snapshot of the project list. Anything
        // promoted after assignment sits in nobody's queue and would simply
        // never be judged, with nothing on screen to say so.
        const [queued] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(judgeQueue)
          .where(eq(judgeQueue.hackathonId, input.hackathonId));

        return {
          created: fresh.length,
          alreadyPresent: submissions.length - fresh.length,
          total: submissions.length,
          queuesNeedRebuild: fresh.length > 0 && (queued?.count ?? 0) > 0,
        };
      });
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
      // A judges row belongs to one hackathon and isJudge authorizes against
      // that, so a queue built for a judge from another edition can never be
      // opened — the projects sit in it and are silently never scored.
      // assignToHackathon makes exactly this check; this path did not.
      const judge = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
        columns: { hackathonId: true },
      });

      if (!judge) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Judge not found" });
      }

      if (judge.hackathonId !== input.hackathonId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This judge belongs to a different hackathon",
        });
      }

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
            const matchCreateX =
              assignment.track!.toLowerCase() === "createx" && !!p.isCreateX;
            return inTracks || inChallenges || matchCreateX;
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

  /**
   * Approve (or suspend) a judge. judge.register creates the row inactive and
   * judge.create refuses once it exists, so without this a self-registered
   * judge can never be activated by any route.
   */
  setActive: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await (ctx.db as DrizzleDB)
        .update(judges)
        .set({ isActive: input.isActive })
        .where(eq(judges.id, input.judgeId))
        .returning({ userId: judges.userId, hackathonId: judges.hackathonId });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Judge not found" });
      }

      // isJudge and judge.isJudge both cache the role for 60s per user per
      // hackathon; approval has to take effect now, not a minute from now.
      ctx.cache.deletePattern(`${CacheKeys.judge(updated.userId)}*`);

      return { success: true, isActive: input.isActive };
    }),

  remove: isAdmin
    .input(z.object({ judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // judgeVotes.judgeId cascades on delete, so removing a judge who has
      // already scored would erase those scores and shift the normalization
      // behind every ranking.
      const existingVote = await (
        ctx.db as DrizzleDB
      ).query.judgeVotes.findFirst({
        where: eq(judgeVotes.judgeId, input.judgeId),
      });

      if (existingVote) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This judge has already submitted votes and cannot be removed without discarding them.",
        });
      }

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
        /** Rebuild even though judging is live or work has been completed.
         *  Completed slots are still carried over; this only waives the
         *  refusal, so the admin has to have seen the count first. */
        force: z.boolean().default(false),
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

        // This procedure deletes and rebuilds every queue in the hackathon. Run
        // a second time by accident — and the wizard drops you straight onto
        // its button after a project import — it would restart judging for
        // everyone at once, mid-event.
        if (hackathon.judgingActive && !input.force) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Judging is live. Re-running assignment rebuilds every judge's queue. Stop judging first, or confirm to rebuild anyway.",
          });
        }

        // Completed slots are not reconstructible from votes: skipProject marks
        // a slot complete without writing one, so a wipe sends judges back to
        // tables they already dealt with. judgingActive defaults false and
        // organisers switch it off when judging closes, so the flag above
        // cannot be the only guard.
        const completed = await tx.query.judgeQueue.findMany({
          where: and(
            eq(judgeQueue.hackathonId, input.hackathonId),
            eq(judgeQueue.isCompleted, true),
          ),
        });

        if (completed.length > 0 && !input.force) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `${completed.length} judging slot(s) are already complete. Rebuilding preserves them but reorders everything else — confirm to continue.`,
          });
        }

        const allAssignments = await tx.query.judgeAssignments.findMany({
          where: eq(judgeAssignments.hackathonId, input.hackathonId),
          with: { judge: true },
        });

        // An applicant who has not been activated can never open the portal
        // (isJudge requires judges.isActive), so a queue handed to them is
        // coverage the event will never actually receive.
        const activeAssignments = allAssignments.filter(
          (a) => a.judge.isActive !== false,
        );

        // With no tracks column configured every judge label would read as a
        // sponsor/special one and bypass the per-judge caps, so fall back to
        // the tracks the judges themselves carry.
        const MAIN_TRACKS = new Set(
          hackathon.tracks?.length
            ? hackathon.tracks
            : activeAssignments
                .map((a) => a.track)
                .filter((t): t is string => !!t),
        );

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

        if (activeAssignments.length === 0) {
          // An empty roster and a roster still awaiting approval need different
          // remedies from the organizer, so the message has to say which it is.
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              allAssignments.length === 0
                ? "No judges have been added to this hackathon yet"
                : "No active judges found for this hackathon - every judge is still pending approval",
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
            activeAssignments.filter(
              (a) => !a.track || MAIN_TRACKS.has(a.track),
            ).length || 40; // Default to 40 judges as requested

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
        const judgeList = activeAssignments.map((a) => ({
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

        // Build all insert rows in one pass, skipping pairs a judge has already
        // finished. judge_queue has no unique on (judgeId, projectId), so
        // without this filter the rebuild happily re-issues a completed pair as
        // a fresh uncompleted row and getNextTable sends the judge back.
        const completedKeys = new Set(
          completed.map((row) => `${row.judgeId}:${row.projectId}`),
        );

        const insertRows: {
          judgeId: string;
          hackathonId: string;
          projectId: string;
          order: number;
          isCompleted?: boolean;
          startedAt?: Date | null;
          completedAt?: Date | null;
        }[] = [];
        for (const [judgeId, projectIds] of queues.entries()) {
          let order = 0;
          for (const projectId of projectIds) {
            if (completedKeys.has(`${judgeId}:${projectId}`)) continue;
            insertRows.push({
              judgeId,
              hackathonId: input.hackathonId,
              projectId,
              order: ++order,
            });
          }
        }

        // Re-append the finished work past the tail of each judge's new queue,
        // so their history survives and nothing re-serves it.
        const tailByJudge = new Map<string, number>();
        for (const row of insertRows) {
          tailByJudge.set(
            row.judgeId,
            Math.max(tailByJudge.get(row.judgeId) ?? 0, row.order),
          );
        }
        for (const row of completed) {
          const next = (tailByJudge.get(row.judgeId) ?? 0) + 1;
          tailByJudge.set(row.judgeId, next);
          insertRows.push({
            judgeId: row.judgeId,
            hackathonId: input.hackathonId,
            projectId: row.projectId,
            order: next,
            isCompleted: true,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
          });
        }

        // Chunked because a single INSERT carries 4 bound parameters per row
        // against Postgres's 65535 limit — about 16k rows. A sponsor-track
        // judge's pool is uncapped, so a few of them over a large project list
        // crosses it and aborts the whole assignment with an opaque driver
        // error at the worst possible moment.
        for (let i = 0; i < insertRows.length; i += QUEUE_INSERT_CHUNK) {
          await tx
            .insert(judgeQueue)
            .values(insertRows.slice(i, i + QUEUE_INSERT_CHUNK));
        }

        // Compute coverage stats for admin feedback. Counted over the merged
        // set — over the generated rows alone, a fully-judged project reads as
        // uncovered and the admin re-runs assignment chasing it.
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

        // Counted from the rows actually written, not from `queues` — those
        // still hold the completed pairs that were filtered out above.
        const countByJudge = new Map<string, number>();
        for (const row of insertRows) {
          countByJudge.set(row.judgeId, (countByJudge.get(row.judgeId) ?? 0) + 1);
        }

        const results = allAssignments.map((a) => ({
          judgeId: a.judgeId,
          judgeName: a.judge.name,
          track: a.track ?? null,
          assignedCount: countByJudge.get(a.judgeId) ?? 0,
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
          judgeName: judges.name,
          total: sql<number>`count(*)`,
          completed: sql<number>`sum(case when ${judgeQueue.isCompleted} then 1 else 0 end)`,
        })
        .from(judgeQueue)
        .innerJoin(judges, eq(judges.id, judgeQueue.judgeId))
        .where(eq(judgeQueue.hackathonId, input.hackathonId))
        .groupBy(judgeQueue.judgeId, judges.name);

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

      // A judge who has a queue but has not scored anything yet is exactly the
      // one an organizer needs to find mid-event, so drive the list from the
      // queues as well as the votes.
      const judgeIds = new Set([...byJudge.keys(), ...queueMap.keys()]);

      const analytics = [...judgeIds].map((judgeId) => {
        const votes = byJudge.get(judgeId) ?? ([] as typeof allVotes);
        const scores = votes.map((v) => v.score);
        const mean =
          scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;
        const variance =
          scores.length > 0
            ? scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length
            : 0;
        const std = Math.sqrt(variance);

        // Bias score: how far this judge's mean is from the global mean, in std units
        const biasScore =
          scores.length > 0 ? round2((mean - globalMean) / (std || 1)) : 0;
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
          name: firstVote?.judgeName ?? qs?.judgeName ?? "Unknown",
          votesSubmitted: scores.length,
          mean: round2(mean),
          std: round2(std),
          min: scores.length > 0 ? Math.min(...scores) : 0,
          max: scores.length > 0 ? Math.max(...scores) : 0,
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
