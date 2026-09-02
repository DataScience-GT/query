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
} from "@query/db";
import { eq, ne, gt, and, asc, inArray, sql , isNull } from "drizzle-orm";
import { CacheKeys } from "../../middleware/cache";
import { isAdmin, isJudge } from "../../middleware/procedures";
import { resolveHackathonId } from "../../services/portal-context";
import type { DrizzleDB } from "@query/db";

// How long a judge holds a table without refreshing the claim. getNextTable
// re-stamps on every poll, so a judge with the portal open keeps their table;
// one who closes the tab stops refreshing and it frees itself. A timeout
// rather than a lock somebody has to release.
const JUDGE_CLAIM_MINUTES = 10;

export const judgePortalRouter = createTRPCRouter({
  isJudge: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Same rule as the isJudge middleware; ordering by start date alone picks
      // next year's draft.
      const hackathonId = await resolveHackathonId(
        ctx.db as DrizzleDB,
        input?.hackathonId,
      );

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

  getMyAssignments: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    // Both reads answer independent questions, so they go together. In
    // sequence they put two Neon round trips in front of the judge landing
    // page for no reason — the judge rows do not depend on the existence
    // check, they only outlive it.
    const [anyHackathon, myJudges] = await Promise.all([
      // A platform with no hackathon at all is a missing judging context, not an
      // empty assignment list.
      db.query.hackathons.findFirst({
        columns: { id: true },
      }),
      // This listing spans every hackathon the caller judges, so it resolves judge
      // rows from the user rather than one hackathon context — pinning it to the
      // newest hides the assignments of everyone judging an earlier one.
      db.query.judges.findMany({
        where: and(
          eq(judges.userId, ctx.userId as string),
          // Every other judging entry point requires an active row; an applicant never
          // activated should not see an assignment list and then hit FORBIDDEN.
          eq(judges.isActive, true),
        ),
        columns: { id: true },
      }),
    ]);

    if (!anyHackathon) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No hackathon context found for judging",
      });
    }

    const assignments = await db.query.judgeAssignments.findMany({
      where: inArray(
        judgeAssignments.judgeId,
        myJudges.map((j) => j.id),
      ),
      with: {
        hackathon: true,
      },
      orderBy: (assignments, { desc }) => [desc(assignments.assignedAt)],
    });

    return assignments;
  }),

  // Every judging application this user has made, approved or not.
  // getMyAssignments shows only approved rows, so between applying and approval
  // a judge had no entry point, no status and no email — while the success
  // screen promised one and the apply button threw "already applied".
  myApplications: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    const myJudges = await db.query.judges.findMany({
      where: eq(judges.userId, ctx.userId as string),
      columns: { id: true, hackathonId: true, isActive: true },
    });

    if (myJudges.length === 0) return [];

    const rows = await db.query.judgeAssignments.findMany({
      where: inArray(
        judgeAssignments.judgeId,
        myJudges.map((j) => j.id),
      ),
      columns: { judgeId: true, hackathonId: true, track: true, assignedAt: true },
    });

    const activeById = new Map(myJudges.map((j) => [j.id, j.isActive]));

    return rows.map((row) => ({
      hackathonId: row.hackathonId,
      track: row.track,
      appliedAt: row.assignedAt,
      // The judges row is what every judging gate reads, so it — not the
      // assignment's own status column, which nothing reads — decides this.
      approved: activeById.get(row.judgeId) === true,
    }));
  }),

  // Starts the clock by scanning the table's QR. Scoring time is measured from
  // here, not from when the queue handed the table over: walking across a
  // ballroom is not judging. It also confirms the judge is at the right table.
  // Idempotent, so scanning twice cannot restart the clock.
  startByQrCode: isJudge
    .input(z.object({ qrCode: z.string().uuid("Invalid table code") }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const project = await db.query.judgingProjects.findFirst({
        where: eq(judgingProjects.qrCode, input.qrCode),
      });

      if (!project || project.withdrawnAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That code does not match a project in this event.",
        });
      }

      // Must be in THIS judge's queue. Scanning somebody else's table would start a
      // clock on work that is not theirs and let them score an unrouted project.
      const slot = await db.query.judgeQueue.findFirst({
        where: and(
          eq(judgeQueue.judgeId, ctx.judge.id),
          eq(judgeQueue.projectId, project.id),
          eq(judgeQueue.isCompleted, false),
        ),
      });

      if (!slot) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Table ${project.tableNumber} is not in your queue. Check the table number against your next assignment.`,
        });
      }

      if (!slot.arrivedAt) {
        await db
          .update(judgeQueue)
          .set({
            arrivedAt: new Date(),
            // Claim it too: a judge who walked up out of order has still taken the table,
            // and another judge should route around them.
            startedAt: slot.startedAt ?? new Date(),
          })
          .where(eq(judgeQueue.id, slot.id));
      }

      return {
        project,
        queueId: slot.id,
        alreadyStarted: !!slot.arrivedAt,
      };
    }),

  getNextTable: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const db = ctx.db as DrizzleDB;

        const queue = await db.query.judgeQueue.findMany({
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

        if (queue.length === 0) {
          return { done: true, project: null, remaining: 0 };
        }

        // Tables another judge is standing at right now. Sending a second judge to a
        // team already presenting helps nobody, so a claimed table is passed over and
        // comes back on a later pass, with nothing for the judge to act on.
        const claimedSince = new Date(
          Date.now() - JUDGE_CLAIM_MINUTES * 60 * 1000,
        );
        const claims = await db.query.judgeQueue.findMany({
          where: and(
            inArray(
              judgeQueue.projectId,
              queue.map((row) => row.projectId),
            ),
            eq(judgeQueue.hackathonId, input.hackathonId),
            eq(judgeQueue.isCompleted, false),
            ne(judgeQueue.judgeId, ctx.judge.id),
            gt(judgeQueue.startedAt, claimedSince),
          ),
          columns: { projectId: true, startedAt: true },
        });

        // Latest claim per table, i.e. the best guess at when it frees up.
        const claimedAt = new Map<string, number>();
        for (const claim of claims) {
          const at = claim.startedAt?.getTime() ?? 0;
          claimedAt.set(
            claim.projectId,
            Math.max(claimedAt.get(claim.projectId) ?? 0, at),
          );
        }

        // First free table in the judge's own order. When every remaining table is
        // busy, take the one claimed longest ago rather than stalling: two judges at
        // a table is awkward, an idle judge is worse, and both scores count.
        const free = queue.find((row) => !claimedAt.has(row.projectId));
        const next =
          free ??
          [...queue].sort(
            (a, b) =>
              (claimedAt.get(a.projectId) ?? 0) -
              (claimedAt.get(b.projectId) ?? 0),
          )[0];

        if (!next) {
          return { done: true, project: null, remaining: 0 };
        }

        // Claiming doubles as a heartbeat: the portal re-runs this while the judge
        // has the project open, so the claim lapses only once they leave.
        await db
          .update(judgeQueue)
          .set({ startedAt: new Date() })
          .where(eq(judgeQueue.id, next.id));

        return {
          done: false,
          project: next.project,
          queueId: next.id,
          remaining: queue.length,
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
        // A withdrawn entry is no longer part of the event.
        where: and(
          eq(judgingProjects.hackathonId, input.hackathonId),
          isNull(judgingProjects.withdrawnAt),
        ),
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

      // Closing judging has to stop scores being written, or the upsert keeps
      // overwriting results after the organizers have called the winners.
      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, ctx.judge.hackathonId),
        columns: { judgingActive: true },
      });
      if (hackathon?.judgingActive === false) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Judging is closed for this hackathon",
        });
      }

      // A judge may only score what was routed to them. Without this any judge
      // could score any project — including one assigned elsewhere or never
      // visited — and it would count towards the rankings. Completed slots still
      // match, so revising an earlier score keeps working.
      const ownSlot = await (ctx.db as DrizzleDB).query.judgeQueue.findFirst({
        where: and(
          eq(judgeQueue.judgeId, ctx.judge.id),
          eq(judgeQueue.projectId, input.projectId),
        ),
        columns: { id: true },
      });
      if (!ownSlot) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This project is not in your judging queue",
        });
      }

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

      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, ctx.judge.hackathonId),
        columns: { judgingActive: true },
      });
      if (hackathon?.judgingActive === false) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Judging is closed for this hackathon",
        });
      }

      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // 1. The queue slot is addressed by id alone, so it has to be read back and
        // vetted before any score is written against it.
        const queueItem = await tx.query.judgeQueue.findFirst({
          where: eq(judgeQueue.id, input.queueId),
        });

        // A queue id that no longer resolves is tolerated — the judge may be retrying
        // — but a row that does resolve has to be this judge's own slot.
        if (queueItem) {
          if (queueItem.judgeId && queueItem.judgeId !== ctx.judge.id) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Queue item not found",
            });
          }
          if (queueItem.hackathonId !== ctx.judge.hackathonId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Queue item does not belong to this hackathon",
            });
          }
          // The slot being closed and the project being scored must be the same one.
          // Comparing hackathons proves nothing, since every slot a judge owns is
          // already in theirs — so without this a judge could score Y while slot X is
          // stamped complete, leaving X unscored but counted as visited.
          if (queueItem.projectId !== input.projectId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Queue item does not match the project being scored",
            });
          }
        } else {
          // Tolerating a missing slot must not drop the ownership test — otherwise any
          // queueId matching no row scores any project.
          const ownSlot = await tx.query.judgeQueue.findFirst({
            where: and(
              eq(judgeQueue.judgeId, ctx.judge.id),
              eq(judgeQueue.projectId, input.projectId),
            ),
            columns: { id: true },
          });
          if (!ownSlot) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This project is not in your judging queue",
            });
          }
        }

        // Measured from the scan when there is one. The client's figure starts when
        // the card rendered, which includes the walk to the table; arrivedAt is
        // server-stamped and cannot be shaped by a stale tab or a skewed clock.
        const measuredSeconds = queueItem?.arrivedAt
          ? Math.max(
              0,
              Math.round((Date.now() - queueItem.arrivedAt.getTime()) / 1000),
            )
          : input.durationSeconds;

        // 2. Atomic upsert vote
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
            durationSeconds: measuredSeconds,
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

        // 3. Mark queue item as completed
        await tx
          .update(judgeQueue)
          .set({
            isCompleted: true,
            completedAt: new Date(),
          })
          .where(eq(judgeQueue.id, input.queueId));

        // 4. Get next uncompleted queue item
        const nextInQueue = await tx.query.judgeQueue.findFirst({
          where: and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.hackathonId, ctx.judge.hackathonId),
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

        // Handing a table over is what claims it. Stamping only in getNextTable left
        // every project after a judge's first one unclaimed, so two judges could be
        // sent to the same table.
        await tx
          .update(judgeQueue)
          .set({ startedAt: new Date() })
          .where(eq(judgeQueue.id, nextInQueue.id));

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
          with: { project: true },
        });

        // The queue id addresses any judge's slot, so a row owned by someone else has
        // to read as missing rather than as an actionable item.
        if (
          !queueItem ||
          (queueItem.judgeId && queueItem.judgeId !== ctx.judge.id)
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Queue item not found",
          });
        }

        // Atomically move this item to the end of the queue. Walking away drops the
        // claim too, so another judge can take the table immediately.
        await tx
          .update(judgeQueue)
          .set({
            order: sql`(SELECT COALESCE(MAX(${judgeQueue.order}), 0) + 1 FROM ${judgeQueue} WHERE ${judgeQueue.judgeId} = ${ctx.judge.id} AND ${judgeQueue.hackathonId} = ${queueItem.hackathonId})`,
            startedAt: null,
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
          // Only this one project left — the last cannot be skipped. The caller renders
          // a project card, so hand back the project, not the queue row.
          return {
            done: false,
            skippedToEnd: true,
            project: queueItem.project,
            queueId: input.queueId,
          };
        }

        // Claim the table being handed over, same as getNextTable does.
        await tx
          .update(judgeQueue)
          .set({ startedAt: new Date() })
          .where(eq(judgeQueue.id, nextInQueue.id));

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
        // The queue id addresses any judge's slot, so a row owned by someone else has
        // to read as missing rather than as an actionable item.
        if (
          !queueItem ||
          (queueItem.judgeId && queueItem.judgeId !== ctx.judge.id)
        )
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Queue item not found",
          });

        // Mark completed (no vote submitted)
        await tx
          .update(judgeQueue)
          .set({ isCompleted: true, completedAt: new Date() })
          .where(eq(judgeQueue.id, input.queueId));

        let reassigned = false;

        // Try to reassign to another judge with the same track
        const myAssignment = await tx.query.judgeAssignments.findFirst({
          where: and(
            eq(judgeAssignments.judgeId, ctx.judge.id),
            eq(judgeAssignments.hackathonId, queueItem.hackathonId),
          ),
        });

        if (myAssignment) {
          // Find other judges assigned to the same hackathon
          const otherAssignments = await tx.query.judgeAssignments.findMany({
            where: eq(judgeAssignments.hackathonId, queueItem.hackathonId),
            with: { judge: true },
          });

          // Get the project's tracks for matching
          const projectTracks = queueItem.project?.tracks || [];

          // Two queries for the whole candidate set, not two per candidate. This runs
          // inside an open transaction during judging: at 40 judges the per-candidate
          // version was ~80 sequential round trips holding a pool connection.
          const [holders, workloads] = await Promise.all([
            tx
              .select({ judgeId: judgeQueue.judgeId })
              .from(judgeQueue)
              .where(eq(judgeQueue.projectId, queueItem.projectId)),
            tx
              .select({
                judgeId: judgeQueue.judgeId,
                remaining: sql<number>`count(*)::int`,
              })
              .from(judgeQueue)
              .where(
                and(
                  eq(judgeQueue.hackathonId, queueItem.hackathonId),
                  eq(judgeQueue.isCompleted, false),
                ),
              )
              .groupBy(judgeQueue.judgeId),
          ]);

          const alreadyHolding = new Set(holders.map((row) => row.judgeId));
          const remainingByJudge = new Map(
            workloads.map((row) => [row.judgeId, row.remaining]),
          );

          const candidates: {
            judgeId: string;
            trackMatch: boolean;
            remaining: number;
          }[] = [];

          for (const other of otherAssignments) {
            if (other.judgeId === ctx.judge.id) continue;

            // A judge who is not active can never open the portal, so handing them the
            // project strands it with nobody able to score it.
            if (!other.judge?.isActive) continue;

            if (alreadyHolding.has(other.judgeId)) continue;

            // Check track match: judge's assigned track overlaps with project's tracks
            const trackMatch = other.track
              ? projectTracks.includes(other.track)
              : false;

            candidates.push({
              judgeId: other.judgeId,
              trackMatch,
              // A judge with nothing left has no group row at all, which is the lightest
              // possible load rather than a missing one.
              remaining: remainingByJudge.get(other.judgeId) ?? 0,
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
              hackathonId: queueItem.hackathonId,
              projectId: queueItem.projectId,
              order: sql`(SELECT COALESCE(MAX(${judgeQueue.order}), 0) + 1 FROM ${judgeQueue} WHERE ${judgeQueue.judgeId} = ${best.judgeId} AND ${judgeQueue.hackathonId} = ${queueItem.hackathonId})`,
            });
            reassigned = true;
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

        // Claim the table being handed over, as completeAndNext and skipProject do.
        // Without this the slot stays unclaimed and the next judge asking for work is
        // sent to the table this judge just walked up to.
        if (nextInQueue) {
          await tx
            .update(judgeQueue)
            .set({ startedAt: new Date() })
            .where(eq(judgeQueue.id, nextInQueue.id));
        }

        return {
          done: !nextInQueue,
          project: nextInQueue?.project ?? null,
          queueId: nextInQueue?.id ?? null,
          reassigned,
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
