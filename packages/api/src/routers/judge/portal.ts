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
import { eq, and, asc, inArray, sql, isNull } from "drizzle-orm";
import { CacheKeys } from "../../middleware/cache";
import { isAdmin, isJudge } from "../../middleware/procedures";
import { resolveHackathonId } from "../../services/portal-context";
import {
  dispatchNext,
  isLive,
  isPastCutoff,
  loadPool,
  lockDispatch,
} from "./dispatch";
import type { DrizzleDB } from "@query/db";
import { panelConsoleUrl, panelDeskUrl, setJudgingBackend } from "../../services/panel-sync";


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

  /** The panel judge desk in the portal, only for an edition that opted in. */
  panelDesk: protectedProcedure.query(async ({ ctx }) => {
    return panelDeskUrl(ctx.db as DrizzleDB, ctx.userId as string);
  }),

  /** The panel organizer console in the portal when this edition uses panel. */
  panelConsole: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return panelConsoleUrl(ctx.db as DrizzleDB, input.hackathonId);
    }),

  /** Moves an edition between classic judging and panel. Panel gets its event and a first sync. */
  setJudgingBackend: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        backend: z.enum(["legacy", "panel"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await setJudgingBackend(ctx.db as DrizzleDB, input.hackathonId, input.backend);
      return panelConsoleUrl(ctx.db as DrizzleDB, input.hackathonId);
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

  // Starts the clock at the table: the tap on its NFC tag or the scan of its
  // card. Scoring time runs from here, not from hand-out, since walking across
  // a ballroom is not judging, and the hard cutoff counts from here too. It
  // also confirms the judge is at the table they were sent to. Idempotent:
  // tapping twice cannot restart the clock.
  startByQrCode: isJudge
    .input(z.object({ qrCode: z.string().uuid("Invalid table code") }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const now = new Date();

      const project = await db.query.judgingProjects.findFirst({
        where: eq(judgingProjects.qrCode, input.qrCode),
      });

      if (!project || project.withdrawnAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That code does not match a project in this event.",
        });
      }

      return await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as DrizzleDB;
        await lockDispatch(tx, project.hackathonId);

        const slot = await tx.query.judgeQueue.findFirst({
          where: and(
            eq(judgeQueue.judgeId, ctx.judge.id),
            eq(judgeQueue.projectId, project.id),
          ),
        });

        // Only the table the pool sent this judge to. Starting any other would
        // let judges pick their favourites and skew coverage.
        if (!slot) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Table ${project.tableNumber} is not the table you were sent to. Check the number on your screen.`,
          });
        }

        if (slot.isCompleted) {
          const voted = await tx.query.judgeVotes.findFirst({
            where: and(
              eq(judgeVotes.judgeId, ctx.judge.id),
              eq(judgeVotes.projectId, project.id),
            ),
            columns: { id: true },
          });
          throw new TRPCError({
            code: "CONFLICT",
            message: voted
              ? `You already scored table ${project.tableNumber}.`
              : `Time ran out on table ${project.tableNumber}, so it has gone back to be judged by someone else. Get your next table.`,
          });
        }

        if (slot.arrivedAt) {
          // Already started. Past the cutoff the look is void; the next
          // dispatch closes the row (a write here would roll back with the throw).
          if (isPastCutoff(slot.arrivedAt, now)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Time ran out on table ${project.tableNumber}, so it has gone back to be judged by someone else. Get your next table.`,
            });
          }
          return {
            project,
            queueId: slot.id,
            alreadyStarted: true,
            arrivedAt: slot.arrivedAt,
            serverNow: now,
          };
        }

        // The walk ran long and the hold lapsed. Still theirs unless another
        // judge has since been sent there.
        if (!isLive(slot, now)) {
          const others = await tx.query.judgeQueue.findMany({
            where: and(
              eq(judgeQueue.projectId, project.id),
              eq(judgeQueue.isCompleted, false),
            ),
            columns: {
              judgeId: true,
              startedAt: true,
              arrivedAt: true,
              isCompleted: true,
            },
          });
          if (others.some((o) => o.judgeId !== ctx.judge.id && isLive(o, now))) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Another judge has table ${project.tableNumber} now. Get your next table.`,
            });
          }
        }

        await tx
          .update(judgeQueue)
          .set({ arrivedAt: now, startedAt: slot.startedAt ?? now })
          .where(eq(judgeQueue.id, slot.id));

        return {
          project,
          queueId: slot.id,
          alreadyStarted: false,
          arrivedAt: now,
          serverNow: now,
        };
      });
    }),

  // The judge's current table: the live one they hold, or a fresh pick from
  // the pool. See dispatch.ts.
  getNextTable: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const now = new Date();
        const next = await (ctx.db as DrizzleDB).transaction((tx) =>
          dispatchNext(tx as unknown as DrizzleDB, ctx.judge.id, input.hackathonId, now),
        );
        if (next.done) return { done: true as const, project: null, serverNow: now };
        return {
          done: false as const,
          project: next.project,
          queueId: next.queueId,
          arrivedAt: next.arrivedAt,
          serverNow: now,
        };
      } catch (error) {
        // A NOT_FOUND or FORBIDDEN from inside is the judge's answer, not a 500.
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch next project.",
          cause: error,
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
      // Opening judging with nothing to judge sent every judge straight to
      // "All done". Judges draw tables from the pool of judgeable projects, so
      // that pool is what has to exist: promote submissions first.
      if (input.active) {
        const [judgeable] = await (ctx.db as DrizzleDB)
          .select({ n: sql<number>`count(*)::int` })
          .from(judgingProjects)
          .where(
            and(
              eq(judgingProjects.hackathonId, input.hackathonId),
              isNull(judgingProjects.withdrawnAt),
            ),
          );
        if ((judgeable?.n ?? 0) === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "There are no projects to judge yet. Prepare judging first: it promotes submissions into judging on this page.",
          });
        }
      }

      const [updated] = await (ctx.db as DrizzleDB)
        .update(hackathons)
        .set({ judgingActive: input.active, updatedAt: new Date() })
        .where(eq(hackathons.id, input.hackathonId))
        .returning();
      return { success: true, judgingActive: updated?.judgingActive };
    }),

  // Writes or revises a score without moving on. A first score is held to the
  // same clock as completeAndNext: the judge must have started the table and
  // be inside the hard cutoff. Revising a score already on record is allowed
  // while judging is open.
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
      const db = ctx.db as DrizzleDB;
      const now = new Date();
      const totalScore =
        input.scoreCreativity +
        input.scoreImpact +
        input.scoreScope +
        input.scoreClarity +
        input.scoreSoundness;

      // Closing judging has to stop scores being written, or the upsert keeps
      // overwriting results after the organizers have called the winners.
      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, ctx.judge.hackathonId),
        columns: { judgingActive: true },
      });
      if (hackathon?.judgingActive === false) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Judging is closed for this hackathon",
        });
      }

      // A judge may only score a table the pool sent them to.
      const ownSlot = await db.query.judgeQueue.findFirst({
        where: and(
          eq(judgeQueue.judgeId, ctx.judge.id),
          eq(judgeQueue.projectId, input.projectId),
        ),
      });
      if (!ownSlot) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This project is not in your judging queue",
        });
      }

      const existing = await db.query.judgeVotes.findFirst({
        where: and(
          eq(judgeVotes.judgeId, ctx.judge.id),
          eq(judgeVotes.projectId, input.projectId),
        ),
        columns: { id: true },
      });
      if (!existing) {
        if (ownSlot.isCompleted || !ownSlot.arrivedAt) {
          throw new TRPCError({
            code: ownSlot.isCompleted ? "CONFLICT" : "BAD_REQUEST",
            message: ownSlot.isCompleted
              ? "Time ran out on this table, so it is being judged again by someone else."
              : "Tap the table's NFC tag or scan its card before scoring.",
          });
        }
        if (isPastCutoff(ownSlot.arrivedAt, now)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Time ran out on this table, so it is being judged again by someone else.",
          });
        }
      }

      const durationSeconds = ownSlot.arrivedAt
        ? Math.max(0, Math.round((now.getTime() - ownSlot.arrivedAt.getTime()) / 1000))
        : input.durationSeconds;

      const result = await db
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
          durationSeconds: existing ? undefined : durationSeconds,
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
            comment: sql`excluded.comment`,
            updatedAt: now,
          },
        })
        .returning();

      return result[0];
    }),

  // Scores the current table and hands over the next one, in one transaction.
  // Past the hard cutoff the score is refused and the look is void: the table
  // goes back into the pool to be judged again, and the judge gets their next
  // table with timedOut set so the page can say why.
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
      const now = new Date();
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

      return await (ctx.db as DrizzleDB).transaction(async (rawTx) => {
        const tx = rawTx as unknown as DrizzleDB;
        await lockDispatch(tx, ctx.judge.hackathonId);

        // 1. The slot is addressed by id alone, so it has to be read back and
        // vetted before any score is written against it.
        const queueItem = await tx.query.judgeQueue.findFirst({
          where: eq(judgeQueue.id, input.queueId),
        });

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
          // The slot being closed and the project being scored must be the same
          // one, or a judge could score Y while X is stamped complete.
          if (queueItem.projectId !== input.projectId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Queue item does not match the project being scored",
            });
          }
        }

        // A queue id that no longer resolves is tolerated (the judge may be
        // retrying) but never drops the ownership test.
        const slot =
          queueItem ??
          (await tx.query.judgeQueue.findFirst({
            where: and(
              eq(judgeQueue.judgeId, ctx.judge.id),
              eq(judgeQueue.projectId, input.projectId),
            ),
          }));
        if (!slot) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This project is not in your judging queue",
          });
        }

        const existing = await tx.query.judgeVotes.findFirst({
          where: and(
            eq(judgeVotes.judgeId, ctx.judge.id),
            eq(judgeVotes.projectId, input.projectId),
          ),
          columns: { id: true },
        });

        const handOver = async (timedOut: boolean) => {
          const next = await dispatchNext(tx, ctx.judge.id, ctx.judge.hackathonId, now);
          return next.done
            ? { done: true as const, nextProject: null, timedOut, serverNow: now }
            : {
                done: false as const,
                nextProject: next.project,
                nextQueueId: next.queueId,
                nextArrivedAt: next.arrivedAt,
                timedOut,
                serverNow: now,
              };
        };

        // A retry of a completion that already landed: hand back the same next
        // table rather than scoring twice.
        if (slot.isCompleted) return handOver(!existing);

        if (!slot.arrivedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tap the table's NFC tag or scan its card before scoring.",
          });
        }

        if (isPastCutoff(slot.arrivedAt, now)) {
          await tx
            .update(judgeQueue)
            .set({ isCompleted: true, completedAt: now })
            .where(eq(judgeQueue.id, slot.id));
          return handOver(true);
        }

        // Measured from the server-stamped arrival, which a stale tab or a
        // skewed phone clock cannot shape.
        const measuredSeconds = Math.max(
          0,
          Math.round((now.getTime() - slot.arrivedAt.getTime()) / 1000),
        );

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
              updatedAt: now,
            },
          });

        await tx
          .update(judgeQueue)
          .set({ isCompleted: true, completedAt: now })
          .where(eq(judgeQueue.id, slot.id));

        return handOver(false);
      });
    }),

  // Passes on the current table without scoring it. The project stays in the
  // pool for other judges; this judge is not sent back to it.
  skipProject: isJudge
    .input(z.object({ queueId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      return await (ctx.db as DrizzleDB).transaction(async (rawTx) => {
        const tx = rawTx as unknown as DrizzleDB;

        const queueItem = await tx.query.judgeQueue.findFirst({
          where: eq(judgeQueue.id, input.queueId),
        });

        // The queue id addresses any judge's slot, so a row owned by someone
        // else has to read as missing rather than as an actionable item.
        if (!queueItem || queueItem.judgeId !== ctx.judge.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Queue item not found",
          });
        }

        await lockDispatch(tx, queueItem.hackathonId);

        if (!queueItem.isCompleted) {
          await tx
            .update(judgeQueue)
            .set({ isCompleted: true, completedAt: now })
            .where(eq(judgeQueue.id, queueItem.id));
        }

        const next = await dispatchNext(tx, ctx.judge.id, queueItem.hackathonId, now);
        return next.done
          ? { done: true as const, project: null, queueId: null, serverNow: now }
          : {
              done: false as const,
              project: next.project,
              queueId: next.queueId,
              arrivedAt: next.arrivedAt,
              serverNow: now,
            };
      });
    }),

  // Kept for the judge page's "can't finish this one" path. With a shared pool
  // nothing needs reassigning by hand: closing the slot without a score is
  // enough for the next judge who asks to be sent there.
  forceSkipOvertime: isJudge
    .input(z.object({ queueId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      return await (ctx.db as DrizzleDB).transaction(async (rawTx) => {
        const tx = rawTx as unknown as DrizzleDB;

        const queueItem = await tx.query.judgeQueue.findFirst({
          where: eq(judgeQueue.id, input.queueId),
        });
        if (!queueItem || queueItem.judgeId !== ctx.judge.id) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Queue item not found",
          });
        }

        // A finished slot has nothing to skip.
        if (queueItem.isCompleted) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This project is already done.",
          });
        }

        await lockDispatch(tx, queueItem.hackathonId);
        await tx
          .update(judgeQueue)
          .set({ isCompleted: true, completedAt: now })
          .where(eq(judgeQueue.id, queueItem.id));

        const next = await dispatchNext(tx, ctx.judge.id, queueItem.hackathonId, now);
        return {
          done: next.done,
          project: next.done ? null : next.project,
          queueId: next.done ? null : next.queueId,
          // Back in the pool: the next judge who asks is sent there.
          reassigned: true,
        };
      });
    }),

  // Scored so far, out of the projects this judge is eligible for.
  getProgress: isJudge
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const db = ctx.db as DrizzleDB;
        const { pool } = await loadPool(db, ctx.judge.id, input.hackathonId);
        const [scored] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(judgeVotes)
          .innerJoin(
            judgingProjects,
            and(
              eq(judgingProjects.id, judgeVotes.projectId),
              eq(judgingProjects.hackathonId, input.hackathonId),
            ),
          )
          .where(eq(judgeVotes.judgeId, ctx.judge.id));

        const total = pool.length;
        const completed = scored?.n ?? 0;
        return {
          total,
          completed,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      } catch (error) {
        // A NOT_FOUND or FORBIDDEN from inside is the judge's answer, not a 500.
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch progress.",
          cause: error,
        });
      }
    }),
});
