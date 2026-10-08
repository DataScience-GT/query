import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertTransition, boardChannel, judgeChannel, leaderboardChannel } from "@query/judging-core";
import type { PanelDb } from "@query/judging-db";
import { event, eventLog, judge, criterion, rubric, visit, vote } from "@query/judging-db";
import type { Actor, Role } from "./auth";
import { roleAtLeast } from "./auth";
import type { Bus } from "./bus";
import type { Metrics } from "./metrics";
import { log } from "./log";
import { arrive } from "./services/arrive";
import { dispatchNext, judgeProgress, skipVisit } from "./services/dispatch";
import {
  assignJudge,
  applyAsJudge,
  recallJudge,
  setJudgeStatus,
  upsertJudge,
  upsertProject,
  voidVisit,
  withdrawProject,
  rotateQr,
  assignEventTables,
} from "./services/records";
import {
  computeResults,
  diffPlacements,
  inspectRun,
  placementsForRun,
  publishedPlacements,
  publishResults,
  unpublishResults,
} from "./services/results";
import { castComparison } from "./services/compare";
import {
  issueApiKey,
  listProjects,
  listLogs,
  listJudges,
  listTables,
  listTracks,
  placeTable,
  savePrize,
  saveRubric,
  saveTrack,
  saveWebhook,
  saveZone,
  saveConfig,
} from "./services/catalog";
import { castVote } from "./services/vote";

export type Context = {
  db: PanelDb;
  actor: Actor | null;
  now: Date;
  bus: Bus;
  metrics: Metrics;
};

function tell(
  ctx: Context,
  eventId: string,
  judgeId: string | null,
  kind: string,
  visitId?: string,
) {
  log({
    level: "info",
    message: kind,
    event_id: eventId,
    judge_id: judgeId,
    visit_id: visitId ?? null,
  });
  const message = { kind, eventId };
  ctx.bus.publish(boardChannel(eventId), message);
  ctx.bus.publish(leaderboardChannel(eventId), message);
  if (judgeId) ctx.bus.publish(judgeChannel(judgeId), message);
}

const t = initTRPC.context<Context>().create();

function asTrpc(error: unknown): never {
  const message = error instanceof Error ? error.message : "Request failed";
  const code = message.includes("not allowed")
    ? "PRECONDITION_FAILED"
    : message.includes("not found") || message.includes("not approved")
      ? "NOT_FOUND"
      : message.includes("hard limit")
        ? "CONFLICT"
        : "BAD_REQUEST";
  throw new TRPCError({ code, message });
}

const authed = t.procedure.use(({ ctx, next }) => {
  if (!ctx.actor) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, actor: ctx.actor } });
});

function atLeast(role: Role) {
  return authed.use(({ ctx, next }) => {
    if (!roleAtLeast(ctx.actor.role, role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next();
  });
}

async function requireJudge(ctx: Context, eventId: string) {
  if (!ctx.actor) throw new TRPCError({ code: "UNAUTHORIZED" });
  const rows = await ctx.db
    .select()
    .from(judge)
    .where(eq(judge.eventId, eventId));
  const match = rows.find(
    (row) =>
      (ctx.actor?.judgeExternalId &&
        row.externalId === ctx.actor.judgeExternalId) ||
      row.email.toLowerCase() === ctx.actor?.email.toLowerCase(),
  );
  if (!match || match.status !== "approved") {
    throw new TRPCError({ code: "FORBIDDEN", message: "This judge is not approved" });
  }
  return match;
}

const uuid = z.string().uuid();

export const appRouter = t.router({
  session: t.router({
    next: authed
      .input(z.object({ eventId: uuid }))
      .mutation(async ({ ctx, input }) => {
        const row = await requireJudge(ctx, input.eventId);
        const stop = ctx.metrics.dispatchSeconds.startTimer();
        try {
          const outcome = await dispatchNext(ctx.db, {
            eventId: input.eventId,
            judgeId: row.id,
            now: ctx.now,
          });
          tell(
            ctx,
            input.eventId,
            row.id,
            "visit.handed_out",
            outcome.done ? undefined : outcome.visitId,
          );
          return outcome;
        } catch (error) {
          asTrpc(error);
        } finally {
          stop();
        }
      }),
    arrive: authed
      .input(
        z.object({
          eventId: uuid,
          qrToken: uuid.optional(),
          tableNumber: z.number().int().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const row = await requireJudge(ctx, input.eventId);
        try {
          const outcome = await arrive(ctx.db, {
            eventId: input.eventId,
            judgeId: row.id,
            qrToken: input.qrToken,
            tableNumber: input.tableNumber,
            now: ctx.now,
          });
          tell(ctx, input.eventId, row.id, "visit.arrived", outcome.visitId);
          return outcome;
        } catch (error) {
          asTrpc(error);
        }
      }),
    vote: authed
      .input(
        z.object({
          eventId: uuid,
          visitId: uuid,
          comment: z.string().nullable().default(null),
          scores: z.array(
            z.object({ criterionId: uuid, value: z.number() }),
          ),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const row = await requireJudge(ctx, input.eventId);
        try {
          const outcome = await castVote(ctx.db, {
            eventId: input.eventId,
            judgeId: row.id,
            visitId: input.visitId,
            scores: input.scores,
            comment: input.comment,
            now: ctx.now,
          });
          tell(ctx, input.eventId, row.id, "vote.cast", input.visitId);
          ctx.metrics.votes.inc();
          const [current] = await ctx.db
            .select({ projectId: visit.projectId })
            .from(visit)
            .where(eq(visit.id, input.visitId));
          if (current) {
            const [looks] = await ctx.db
              .select({ n: sql<number>`count(*)::int` })
              .from(vote)
              .where(
                and(eq(vote.eventId, input.eventId), eq(vote.projectId, current.projectId)),
              );
            ctx.metrics.coverage.observe({ event_id: input.eventId }, looks?.n ?? 1);
          }
          return outcome;
        } catch (error) {
          asTrpc(error);
        }
      }),
    rubric: authed
      .input(z.object({ eventId: uuid }))
      .query(async ({ ctx, input }) => {
        await requireJudge(ctx, input.eventId);
        const [rub] = await ctx.db
          .select({ id: rubric.id })
          .from(rubric)
          .where(and(eq(rubric.eventId, input.eventId), eq(rubric.isDefault, true)));
        if (!rub) return [];
        return ctx.db
          .select({
            id: criterion.id,
            label: criterion.label,
            min: criterion.min,
            max: criterion.max,
            anchors: criterion.anchors,
          })
          .from(criterion)
          .where(eq(criterion.rubricId, rub.id));
      }),
    compare: authed
      .input(z.object({ eventId: uuid, outcome: z.enum(["a", "b", "tie"]) }))
      .mutation(async ({ ctx, input }) => {
        const row = await requireJudge(ctx, input.eventId);
        try {
          const outcome = await castComparison(ctx.db, {
            eventId: input.eventId,
            judgeId: row.id,
            outcome: input.outcome,
            now: ctx.now,
          });
          tell(ctx, input.eventId, row.id, "comparison.cast");
          return outcome;
        } catch (error) {
          asTrpc(error);
        }
      }),
    skip: authed
      .input(z.object({ eventId: uuid, visitId: uuid }))
      .mutation(async ({ ctx, input }) => {
        const row = await requireJudge(ctx, input.eventId);
        try {
          return await skipVisit(ctx.db, {
            eventId: input.eventId,
            judgeId: row.id,
            visitId: input.visitId,
            now: ctx.now,
          });
        } catch (error) {
          asTrpc(error);
        }
      }),
    progress: authed
      .input(z.object({ eventId: uuid }))
      .query(async ({ ctx, input }) => {
        const row = await requireJudge(ctx, input.eventId);
        try {
          return await judgeProgress(ctx.db, { eventId: input.eventId, judgeId: row.id });
        } catch (error) {
          asTrpc(error);
        }
      }),
  }),
  event: t.router({
    setPhase: atLeast("organizer")
      .input(z.object({ eventId: uuid, phase: z.enum([
        "setup",
        "submissions_open",
        "submissions_closed",
        "judging_live",
        "judging_closed",
        "published",
        "archived",
      ]) }))
      .mutation(async ({ ctx, input }) => {
        const [current] = await ctx.db
          .select({ phase: event.phase, id: event.id })
          .from(event)
          .where(eq(event.id, input.eventId));
        if (!current) throw new TRPCError({ code: "NOT_FOUND" });
        try {
          assertTransition(current.phase, input.phase);
        } catch (error) {
          asTrpc(error);
        }
        await ctx.db.transaction(async (tx) => {
          await tx
            .update(event)
            .set({ phase: input.phase })
            .where(eq(event.id, input.eventId));
          await tx.insert(eventLog).values({
            eventId: input.eventId,
            kind: "phase.changed",
            actor: { email: ctx.actor.email },
            subject: { eventId: input.eventId },
            payload: { from: current.phase, to: input.phase },
          });
        });
        tell(ctx, input.eventId, null, "phase.changed");
        return { phase: input.phase };
      }),
  }),
  project: t.router({
    upsert: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          externalId: z.string().min(1),
          name: z.string().min(1),
          teamName: z.string().nullable().default(null),
          tableNumber: z.number().int().nullable().default(null),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await upsertProject(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    withdraw: atLeast("organizer")
      .input(z.object({ eventId: uuid, projectId: uuid }))
      .mutation(async ({ ctx, input }) => {
        try {
          await withdrawProject(ctx.db, { ...input, now: ctx.now, actorEmail: ctx.actor.email });
          return { ok: true };
        } catch (error) {
          asTrpc(error);
        }
      }),
    rotateQr: atLeast("organizer")
      .input(z.object({ eventId: uuid, projectId: uuid }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await rotateQr(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    assignTables: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .mutation(async ({ ctx, input }) => {
        return assignEventTables(ctx.db, {
          eventId: input.eventId,
          actorEmail: ctx.actor.email,
        });
      }),
  }),
  judge: t.router({
    applyToEvent: authed
      .input(z.object({ eventId: uuid, name: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await applyAsJudge(ctx.db, {
            eventId: input.eventId,
            email: ctx.actor.email,
            name: input.name,
          });
        } catch (error) {
          asTrpc(error);
        }
      }),
    upsert: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          email: z.string().email(),
          name: z.string().min(1),
          externalId: z.string().nullable().default(null),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await upsertJudge(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    assign: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          judgeId: uuid,
          trackId: uuid.nullable(),
          zoneId: uuid.nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await assignJudge(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    setStatus: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          judgeId: uuid,
          status: z.enum(["approved", "suspended"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await setJudgeStatus(ctx.db, { ...input, actorEmail: ctx.actor.email });
        return { ok: true };
      }),
    recall: atLeast("organizer")
      .input(z.object({ eventId: uuid, judgeId: uuid }))
      .mutation(async ({ ctx, input }) => {
        await recallJudge(ctx.db, { ...input, actorEmail: ctx.actor.email });
        tell(ctx, input.eventId, input.judgeId, "judge.recalled");
        return { ok: true };
      }),
    voidVisit: atLeast("organizer")
      .input(z.object({ eventId: uuid, visitId: uuid, reason: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const voided = await voidVisit(ctx.db, { ...input, now: ctx.now, actorEmail: ctx.actor.email });
          tell(ctx, input.eventId, voided.judgeId, "visit.voided", input.visitId);
          return { ok: true };
        } catch (error) {
          asTrpc(error);
        }
      }),
  }),
  results: t.router({
    compute: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await computeResults(ctx.db, {
            eventId: input.eventId,
            actorEmail: ctx.actor.email,
            now: ctx.now,
          });
        } catch (error) {
          asTrpc(error);
        }
      }),
    publish: atLeast("organizer")
      .input(z.object({ eventId: uuid, runId: uuid }))
      .mutation(async ({ ctx, input }) => {
        try {
          const outcome = await publishResults(ctx.db, {
            ...input,
            actorEmail: ctx.actor.email,
            now: ctx.now,
          });
          tell(ctx, input.eventId, null, "results.published");
          return outcome;
        } catch (error) {
          asTrpc(error);
        }
      }),
    inspect: atLeast("organizer")
      .input(z.object({ runId: uuid }))
      .query(({ ctx, input }) => inspectRun(ctx.db, input.runId)),
    diff: atLeast("organizer")
      .input(z.object({ runA: uuid, runB: uuid }))
      .query(async ({ ctx, input }) => {
        const [left, right] = await Promise.all([
          placementsForRun(ctx.db, input.runA),
          placementsForRun(ctx.db, input.runB),
        ]);
        return diffPlacements(left, right);
      }),
    unpublish: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .mutation(async ({ ctx, input }) => {
        try {
          const outcome = await unpublishResults(ctx.db, {
            eventId: input.eventId,
            actorEmail: ctx.actor.email,
          });
          tell(ctx, input.eventId, null, "results.unpublished");
          return outcome;
        } catch (error) {
          asTrpc(error);
        }
      }),
    export: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .query(({ ctx, input }) => publishedPlacements(ctx.db, input.eventId)),
  }),
  catalog: t.router({
    tracks: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .query(({ ctx, input }) => listTracks(ctx.db, input.eventId)),
    projects: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .query(({ ctx, input }) => listProjects(ctx.db, input.eventId)),
    logs: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .query(({ ctx, input }) => listLogs(ctx.db, input.eventId)),
    tables: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .query(({ ctx, input }) => listTables(ctx.db, input.eventId)),
    judges: atLeast("organizer")
      .input(z.object({ eventId: uuid }))
      .query(({ ctx, input }) => listJudges(ctx.db, input.eventId)),
    saveTrack: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          slug: z.string().min(1),
          name: z.string().min(1),
          kind: z.enum(["main", "sponsor", "special"]),
          judgeGroup: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await saveTrack(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    savePrize: atLeast("organizer")
      .input(
        z.object({
          trackId: uuid,
          place: z.number().int(),
          title: z.string().min(1),
          amount: z.number().nullable().default(null),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await savePrize(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    saveZone: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          name: z.string().min(1),
          position: z.number().int().default(0),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await saveZone(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    placeTable: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          number: z.number().int(),
          zoneId: uuid.nullable().default(null),
          x: z.number().nullable().default(null),
          y: z.number().nullable().default(null),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await placeTable(ctx.db, { ...input, actorEmail: ctx.actor.email });
        return { ok: true };
      }),
    saveRubric: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          name: z.string().min(1),
          isDefault: z.boolean().default(false),
          criteria: z.array(
            z.object({
              key: z.string().min(1),
              label: z.string().min(1),
              min: z.number(),
              max: z.number(),
              weight: z.number(),
            }),
          ),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await saveRubric(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    saveWebhook: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          url: z.string().url(),
          secret: z.string().min(8),
          topics: z.array(z.string()).min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await saveWebhook(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    issueApiKey: atLeast("admin")
      .input(z.object({ eventId: uuid, scopes: z.array(z.string()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await issueApiKey(ctx.db, { ...input, actorEmail: ctx.actor.email });
        } catch (error) {
          asTrpc(error);
        }
      }),
    saveConfig: atLeast("organizer")
      .input(
        z.object({
          eventId: uuid,
          hardLimitSeconds: z.number().int().positive(),
          dispatchStrategy: z.enum(["coverage", "uncertainty"]),
          pairwiseEnabled: z.boolean(),
          pairwiseWeight: z.number().min(0).max(1),
          leaderboardPublic: z.boolean(),
          boardPollSeconds: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await saveConfig(ctx.db, { ...input, actorEmail: ctx.actor.email });
        return { ok: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
