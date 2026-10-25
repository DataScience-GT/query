// The late-push check: its switch, the flags it raised and what an organiser
// decides about them. Flags come from services/judging/repo-check.ts; nothing
// here is shown to hackers or on public results.

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { judgingConfigs, judgingEntries, judgingRepoChecks } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import { lockEdition } from "../../../services/judging/challenges";
import {
  assertHackathonExists,
  ensureJudgingConfig,
} from "../../../services/judging/config";
import {
  repoCheckRunning,
  repoCheckThrottle,
  runRepoCheck,
} from "../../../services/judging/repo-check";
import {
  computeSubmissionWindow,
  loadHackathonBaseTime,
} from "../../team/windows";
import {
  evictResults,
  hackathonInput,
  lockEntry,
  notFound,
  refuse,
  restoreLockedEntry,
  uuid,
} from "./shared";

const note = z.string().trim().max(500).optional();

const RUN_NOW_WAIT_MS = 25_000;

/** What a decision about one entry's repo check needs, under the edition lock. */
async function lockCheck(
  tx: Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0],
  hackathonId: string,
  entryId: string,
) {
  const entry = await lockEntry(tx, entryId);
  if (entry.hackathonId !== hackathonId) {
    throw notFound("That project is gone. Refresh the list.");
  }
  const [check] = await tx
    .select()
    .from(judgingRepoChecks)
    .where(eq(judgingRepoChecks.entryId, entryId))
    .limit(1);
  if (!check) throw notFound("That project has not been checked yet.");
  return { entry, check };
}

export const repoCheckProcedures = {
  /** The switch, the grace, the deadline and every project the check could not clear. */
  getRepoCheck: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    await assertHackathonExists(db, input.hackathonId);
    const config = await ensureJudgingConfig(db, input.hackathonId);
    const base = await loadHackathonBaseTime(db, input.hackathonId);

    const checks = await db
      .select({
        entryId: judgingRepoChecks.entryId,
        title: judgingEntries.title,
        removed: judgingEntries.deletedAt,
        repoOwner: judgingRepoChecks.repoOwner,
        repoName: judgingRepoChecks.repoName,
        outcome: judgingRepoChecks.outcome,
        pushedAt: judgingRepoChecks.pushedAt,
        evidence: judgingRepoChecks.evidence,
        checkedAt: judgingRepoChecks.checkedAt,
        decision: judgingRepoChecks.decision,
        decidedAt: judgingRepoChecks.decidedAt,
        note: judgingRepoChecks.note,
        removedEntry: judgingRepoChecks.removedEntry,
        repos: judgingRepoChecks.repos,
        lastOutcome: judgingRepoChecks.lastOutcome,
      })
      .from(judgingRepoChecks)
      .innerJoin(
        judgingEntries,
        eq(judgingEntries.id, judgingRepoChecks.entryId),
      )
      .where(eq(judgingRepoChecks.hackathonId, input.hackathonId))
      .orderBy(asc(judgingEntries.title), asc(judgingEntries.id));

    const flagged = checks
      .filter((row) => row.outcome !== "ok")
      .sort(
        (a, b) =>
          Number(a.decision !== "pending") - Number(b.decision !== "pending"),
      );
    return {
      enabled: config.repoCheckEnabled,
      graceMinutes: config.repoCheckGraceMinutes,
      lastRunAt: config.repoCheckLastRunAt,
      running: repoCheckRunning(input.hackathonId),
      judgingOpen: config.state === "open",
      // Unauthenticated GitHub allows 60 requests an hour: one small edition.
      hasToken: !!process.env.GITHUB_TOKEN,
      deadline: computeSubmissionWindow(base, new Date()).closesAt,
      checked: checks.length,
      flagged,
    };
  }),

  /** Turns the check on or off, or sets the grace. Either makes the next poll run it. */
  setRepoCheck: isAdmin
    .input(
      hackathonInput
        .extend({
          enabled: z.boolean().optional(),
          graceMinutes: z.number().int().min(0).max(1440).optional(),
        })
        .refine((v) => v.enabled !== undefined || v.graceMinutes !== undefined, {
          message: "Say what to change.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      await ensureJudgingConfig(db, input.hackathonId);
      // Under the edition lock, as a run's saves are: a run in flight then
      // settles what it found against the new grace, not the old one.
      await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        // Flags not yet decided were worked out with the old grace; they are
        // checked afresh. Decided ones, and ones whose project is out, stay.
        if (input.graceMinutes !== undefined) {
          await tx
            .delete(judgingRepoChecks)
            .where(
              and(
                eq(judgingRepoChecks.hackathonId, input.hackathonId),
                eq(judgingRepoChecks.decision, "pending"),
                eq(judgingRepoChecks.removedEntry, false),
              ),
            );
        }
        await tx
          .update(judgingConfigs)
          .set({
            ...(input.enabled !== undefined && {
              repoCheckEnabled: input.enabled,
            }),
            ...(input.graceMinutes !== undefined && {
              repoCheckGraceMinutes: input.graceMinutes,
            }),
            // Due at once; the throttle here would otherwise hold a new
            // setting back for up to 15 minutes.
            repoCheckLastRunAt: null,
            updatedAt: new Date(),
          })
          .where(eq(judgingConfigs.hackathonId, input.hackathonId));
      });
      repoCheckThrottle.delete(input.hackathonId);
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.repoCheck.configure",
        resourceId: input.hackathonId,
        metadata: {
          enabled: input.enabled,
          graceMinutes: input.graceMinutes,
        },
      });
      return { ok: true };
    }),

  /**
   * Runs now. Waits for it up to 25 seconds, as work left running after the
   * response may be stalled; every project is saved as it is done, so what
   * finished by then is kept and the run carries on for the rest.
   */
  runRepoCheckNow: isAdmin.input(hackathonInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    await assertHackathonExists(db, input.hackathonId);
    await ensureJudgingConfig(db, input.hackathonId);
    if (repoCheckRunning(input.hackathonId)) {
      return { started: false, finished: false };
    }
    const now = new Date();
    await db
      .update(judgingConfigs)
      .set({ repoCheckLastRunAt: now })
      .where(eq(judgingConfigs.hackathonId, input.hackathonId));
    repoCheckThrottle.set(input.hackathonId, now.getTime());
    const run = runRepoCheck(db, input.hackathonId, { now }).then(() => true);
    const finished = await Promise.race([
      run,
      new Promise<false>((resolve) =>
        setTimeout(() => resolve(false), RUN_NOW_WAIT_MS).unref?.(),
      ),
    ]);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.repoCheck.run",
      resourceId: input.hackathonId,
    });
    return { started: true, finished };
  }),

  /**
   * Confirms or clears a flag. Disqualifying takes the project out of judging
   * the way removeEntry does (its not-yet-started presentations stop counting
   * and it leaves results and new assignments); clearing only closes the flag.
   */
  decideRepoCheck: isAdmin
    .input(
      hackathonInput.extend({
        entryId: uuid,
        decision: z.enum(["disqualified", "cleared"]),
        note,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const { entry, removed } = await db.transaction(async (tx) => {
        const { entry, check } = await lockCheck(
          tx,
          input.hackathonId,
          input.entryId,
        );
        if (check.decision === "disqualified") {
          throw refuse(
            `${entry.title} is already disqualified. Reinstate it to change that.`,
          );
        }
        if (input.decision === "cleared" && check.removedEntry) {
          throw refuse(
            `${entry.title} was taken out of judging by an earlier disqualification. Reinstate it instead.`,
          );
        }

        const now = new Date();
        const removed = input.decision === "disqualified" && !entry.deletedAt;
        if (removed) {
          await tx
            .update(judgingEntries)
            .set({ deletedAt: now, deletedById: ctx.userId, updatedAt: now })
            .where(eq(judgingEntries.id, entry.id));
        }
        await tx
          .update(judgingRepoChecks)
          .set({
            decision: input.decision,
            decidedById: ctx.userId,
            decidedAt: now,
            note: input.note || null,
            removedEntry: check.removedEntry || removed,
            removedDeletedAt: removed ? now : check.removedDeletedAt,
          })
          .where(eq(judgingRepoChecks.entryId, entry.id));
        return { entry, removed };
      });

      if (removed) evictResults(ctx.cache, entry.hackathonId);
      await recordAdminAction(db, {
        userId: ctx.userId,
        action:
          input.decision === "disqualified"
            ? "judging.repoCheck.disqualify"
            : "judging.repoCheck.clear",
        resourceId: entry.id,
        severity: input.decision === "disqualified" ? "warn" : "info",
        metadata: {
          hackathonId: entry.hackathonId,
          removed,
          note: input.note || null,
        },
      });
      return { decision: input.decision };
    }),

  /** Undoes a disqualification: the project comes back (restoreEntry) and the flag is cleared. */
  reinstateRepoCheck: isAdmin
    .input(hackathonInput.extend({ entryId: uuid, note }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const entry = await db.transaction(async (tx) => {
        const { entry, check } = await lockCheck(
          tx,
          input.hackathonId,
          input.entryId,
        );
        if (check.decision !== "disqualified" && !check.removedEntry) {
          throw refuse(`${entry.title} is not disqualified.`);
        }
        // Only the removal the disqualification made: an organiser who
        // restored the project and removed it again for another reason has
        // that removal stand.
        if (
          check.removedEntry &&
          entry.deletedAt &&
          entry.deletedAt.getTime() === check.removedDeletedAt?.getTime()
        ) {
          await restoreLockedEntry(tx, entry);
        }
        await tx
          .update(judgingRepoChecks)
          .set({
            decision: "cleared",
            decidedById: ctx.userId,
            decidedAt: new Date(),
            note: input.note || null,
            removedEntry: false,
            removedDeletedAt: null,
          })
          .where(
            and(
              eq(judgingRepoChecks.entryId, entry.id),
              eq(judgingRepoChecks.hackathonId, input.hackathonId),
            ),
          );
        return entry;
      });

      evictResults(ctx.cache, entry.hackathonId);
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.repoCheck.reinstate",
        resourceId: entry.id,
        severity: "warn",
        metadata: { hackathonId: entry.hackathonId, note: input.note || null },
      });
      return { decision: "cleared" as const };
    }),
};
