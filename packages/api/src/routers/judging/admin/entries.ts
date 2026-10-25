// Project (entry) list and the per-project admin actions.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  hackathonCheckInFlags,
  judgingAppointments,
  judgingChallenges,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluations,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import {
  derivedMemberships,
  lockEdition,
  readChallenges,
} from "../../../services/judging/challenges";
import { holdsEveryRating } from "../../../services/judging/scoring-sql";
import { checkInFlagsForEntries } from "../../../services/check-in-flags";
import type { CheckInFlagView } from "../../../services/check-in-flags";
import {
  uuid,
  hackathonInput,
  escapeLike,
  notFound,
  refuse,
  evictResults,
  entriesWithOpenFlags,
  lockEntry,
  restoreLockedEntry,
} from "./shared";

export const entryProcedures = {
  listEntries: isAdmin
    .input(
      hackathonInput.extend({
        search: z.string().trim().max(200).optional(),
        source: z.enum(["all", "devpost", "portal"]).default("all"),
        status: z.enum(["live", "removed", "all"]).default("live"),
        challengeId: uuid.optional(),
        // Only projects with a check-in flag nobody has dismissed.
        flagged: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const pattern = input.search ? `%${escapeLike(input.search)}%` : null;

      // Settled before the query so the filter narrows the page and the total
      // together instead of thinning out a page afterwards.
      const flaggedIds = input.flagged
        ? await entriesWithOpenFlags(db, input.hackathonId)
        : null;

      const where = and(
        eq(judgingEntries.hackathonId, input.hackathonId),
        input.source === "all"
          ? undefined
          : eq(judgingEntries.source, input.source),
        input.status === "live"
          ? isNull(judgingEntries.deletedAt)
          : input.status === "removed"
            ? isNotNull(judgingEntries.deletedAt)
            : undefined,
        flaggedIds
          ? flaggedIds.length > 0
            ? inArray(judgingEntries.id, flaggedIds)
            : sql`false`
          : undefined,
        input.challengeId
          ? exists(
              db
                .select({ one: sql`1` })
                .from(judgingEntryChallenges)
                .where(
                  and(
                    eq(judgingEntryChallenges.entryId, judgingEntries.id),
                    eq(judgingEntryChallenges.challengeId, input.challengeId),
                  ),
                ),
            )
          : undefined,
        pattern
          ? or(
              ilike(judgingEntries.title, pattern),
              exists(
                db
                  .select({ one: sql`1` })
                  .from(judgingEntryMembers)
                  .where(
                    and(
                      eq(judgingEntryMembers.entryId, judgingEntries.id),
                      or(
                        ilike(judgingEntryMembers.name, pattern),
                        ilike(judgingEntryMembers.email, pattern),
                      ),
                    ),
                  ),
              ),
            )
          : undefined,
      );

      const [[total], rows] = await Promise.all([
        db.select({ value: count() }).from(judgingEntries).where(where),
        db
          .select({
            id: judgingEntries.id,
            source: judgingEntries.source,
            sourceProjectId: judgingEntries.sourceProjectId,
            title: judgingEntries.title,
            submissionUrl: judgingEntries.submissionUrl,
            description: judgingEntries.description,
            demoLinks: judgingEntries.demoLinks,
            videoUrl: judgingEntries.videoUrl,
            technologies: judgingEntries.technologies,
            universities: judgingEntries.universities,
            prizeCategories: judgingEntries.prizeCategories,
            participantCount: judgingEntries.participantCount,
            submittedAt: judgingEntries.submittedAt,
            deletedAt: judgingEntries.deletedAt,
            prizeIneligible: sql<boolean>`${judgingEntries.prizeIneligibleAt} is not null`,
            createdAt: judgingEntries.createdAt,
          })
          .from(judgingEntries)
          .where(where)
          .orderBy(asc(judgingEntries.title), asc(judgingEntries.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
      ]);

      const ids = rows.map((row) => row.id);
      const [members, memberships, appointments, evaluations, flags] =
        ids.length === 0
          ? [[], [], [], [], new Map<string, CheckInFlagView[]>()]
          : await Promise.all([
              db
                .select({
                  id: judgingEntryMembers.id,
                  entryId: judgingEntryMembers.entryId,
                  name: judgingEntryMembers.name,
                  email: judgingEntryMembers.email,
                  linked: sql<boolean>`${judgingEntryMembers.userId} is not null`,
                  claimedAt: judgingEntryMembers.claimedAt,
                  invited: sql<boolean>`${judgingEntryMembers.invitedById} is not null`,
                })
                .from(judgingEntryMembers)
                .where(inArray(judgingEntryMembers.entryId, ids))
                .orderBy(asc(judgingEntryMembers.displayOrder)),
              db
                .select({
                  entryId: judgingEntryChallenges.entryId,
                  challengeId: judgingEntryChallenges.challengeId,
                  isOptIn: judgingEntryChallenges.isOptIn,
                  label: judgingChallenges.label,
                  isGroup: judgingChallenges.isGroup,
                  isGeneral: judgingChallenges.isGeneral,
                })
                .from(judgingEntryChallenges)
                .innerJoin(
                  judgingChallenges,
                  eq(judgingChallenges.id, judgingEntryChallenges.challengeId),
                )
                .where(inArray(judgingEntryChallenges.entryId, ids))
                .orderBy(asc(judgingChallenges.label)),
              db
                .select({
                  entryId: judgingAppointments.entryId,
                  value: count(),
                })
                .from(judgingAppointments)
                .where(inArray(judgingAppointments.entryId, ids))
                .groupBy(judgingAppointments.entryId),
              db
                .select({
                  entryId: judgingEvaluations.entryId,
                  value: count(),
                })
                .from(judgingEvaluations)
                .where(
                  and(
                    inArray(judgingEvaluations.entryId, ids),
                    holdsEveryRating(input.hackathonId),
                  ),
                )
                .groupBy(judgingEvaluations.entryId),
              // Names and events of other people: organiser-only, which this
              // procedure is, and never part of a cached payload.
              checkInFlagsForEntries(db, input.hackathonId, ids),
            ]);

      const countFor = (list: { entryId: string; value: number }[], id: string) =>
        list.find((row) => row.entryId === id)?.value ?? 0;

      return {
        total: total?.value ?? 0,
        page: input.page,
        pageSize: input.pageSize,
        entries: rows.map((row) => ({
          ...row,
          members: members
            .filter((m) => m.entryId === row.id)
            .map(({ entryId: _entryId, ...member }) => member),
          challenges: memberships
            .filter((m) => m.entryId === row.id)
            .map(({ entryId: _entryId, ...membership }) => membership),
          appointments: countFor(appointments, row.id),
          completeEvaluations: countFor(evaluations, row.id),
          checkInFlags: flags.get(row.id) ?? [],
        })),
      };
    }),

  /**
   * Sets the challenges a project opted into. Group and general memberships
   * follow. A challenge the project already presented or was scored in
   * cannot be taken away.
   */
  setEntryChallenges: isAdmin
    .input(
      z.object({
        entryId: uuid,
        challengeIds: z.array(uuid).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await db.transaction(async (tx) => {
        const entry = await lockEntry(tx, input.entryId);
        if (entry.deletedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Restore the project before changing its challenges.",
          });
        }

        const challenges = await readChallenges(tx, entry.hackathonId);
        const chosen = [...new Set(input.challengeIds)];
        for (const id of chosen) {
          const challenge = challenges.find((c) => c.id === id);
          if (!challenge) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One of those challenges is not part of this hackathon.",
            });
          }
          if (challenge.isGroup) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${challenge.label} is a group. Pick challenges; group membership follows from them.`,
            });
          }
        }

        const optIns = chosen.map((challengeId) => ({
          entryId: entry.id,
          challengeId,
        }));
        const derived = derivedMemberships(optIns, [entry.id], challenges);
        const keep = new Set([
          ...chosen,
          ...derived.map((row) => row.challengeId),
        ]);

        const current = await tx
          .select({ challengeId: judgingEntryChallenges.challengeId })
          .from(judgingEntryChallenges)
          .where(eq(judgingEntryChallenges.entryId, entry.id));
        const dropped = current
          .map((row) => row.challengeId)
          .filter((id) => !keep.has(id));

        if (dropped.length > 0) {
          const [[appointment], [evaluation], [draft]] = await Promise.all([
            tx
              .select({ challengeId: judgingAppointments.challengeId })
              .from(judgingAppointments)
              .where(
                and(
                  eq(judgingAppointments.entryId, entry.id),
                  inArray(judgingAppointments.challengeId, dropped),
                ),
              )
              .limit(1),
            tx
              .select({ challengeId: judgingEvaluations.challengeId })
              .from(judgingEvaluations)
              .where(
                and(
                  eq(judgingEvaluations.entryId, entry.id),
                  inArray(judgingEvaluations.challengeId, dropped),
                ),
              )
              .limit(1),
            tx
              .select({ challengeId: judgingEvaluationDrafts.challengeId })
              .from(judgingEvaluationDrafts)
              .where(
                and(
                  eq(judgingEvaluationDrafts.entryId, entry.id),
                  inArray(judgingEvaluationDrafts.challengeId, dropped),
                ),
              )
              .limit(1),
          ]);
          const used = appointment ?? evaluation ?? draft;
          if (used) {
            const name =
              challenges.find((c) => c.id === used.challengeId)?.label ??
              "One of those challenges";
            throw new TRPCError({
              code: "CONFLICT",
              message: `${name} already has a presentation or a judge's scores for this project, so it stays.`,
            });
          }
        }

        await tx
          .delete(judgingEntryChallenges)
          .where(eq(judgingEntryChallenges.entryId, entry.id));
        const rows = [
          ...optIns.map((row) => ({ ...row, isOptIn: true })),
          ...derived.map((row) => ({ ...row, isOptIn: false })),
        ];
        if (rows.length > 0) {
          await tx
            .insert(judgingEntryChallenges)
            .values(
              rows.map((row) => ({ ...row, hackathonId: entry.hackathonId })),
            );
        }

        const prizeCategories = challenges
          .filter((c) => chosen.includes(c.id) && !c.isGeneral)
          .map((c) => c.label)
          .sort((a, b) => a.localeCompare(b));
        await tx
          .update(judgingEntries)
          .set({ prizeCategories, updatedAt: new Date() })
          .where(eq(judgingEntries.id, entry.id));

        return {
          hackathonId: entry.hackathonId,
          challengeIds: [...keep],
          dropped: dropped.length,
        };
      });

      if (result.dropped > 0) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.setEntryChallenges",
          resourceId: input.entryId,
          metadata: {
            hackathonId: result.hackathonId,
            challenges: result.challengeIds.length,
            dropped: result.dropped,
          },
        });
      }
      return { challengeIds: result.challengeIds };
    }),

  /**
   * Takes a project out of judging. Its evaluations stay, pointing at it. A
   * portal submission removed here cannot be resubmitted by its team.
   */
  removeEntry: isAdmin
    .input(z.object({ entryId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const entry = await db.transaction(async (tx) => {
        const entry = await lockEntry(tx, input.entryId);
        if (entry.deletedAt) return null;

        const [appointments] = await tx
          .select({ value: count() })
          .from(judgingAppointments)
          .where(eq(judgingAppointments.entryId, entry.id));
        if ((appointments?.value ?? 0) > 0) {
          throw refuse(
            `${entry.title} is on the saved schedule (${appointments!.value} presentation${appointments!.value === 1 ? "" : "s"}). Drop the schedule on the Schedule tab before removing it.`,
          );
        }

        const now = new Date();
        await tx
          .update(judgingEntries)
          .set({ deletedAt: now, deletedById: ctx.userId, updatedAt: now })
          .where(eq(judgingEntries.id, entry.id));
        return entry;
      });
      if (!entry) return { removed: false };

      evictResults(ctx.cache, entry.hackathonId);
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.removeEntry",
        resourceId: entry.id,
        severity: "warn",
        metadata: { hackathonId: entry.hackathonId, source: entry.source },
      });
      return { removed: true };
    }),

  restoreEntry: isAdmin
    .input(z.object({ entryId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const entry = await db.transaction(async (tx) => {
        const entry = await lockEntry(tx, input.entryId);
        if (!entry.deletedAt) return null;
        await restoreLockedEntry(tx, entry);
        return entry;
      });
      if (!entry) return { restored: false };

      evictResults(ctx.cache, entry.hackathonId);
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.restoreEntry",
        resourceId: entry.id,
        metadata: { hackathonId: entry.hackathonId },
      });
      return { restored: true };
    }),

  /**
   * Clears a check-in flag an organiser has looked into, or opens it again.
   * The flag stays on record either way; judges stop seeing the marker while it
   * is dismissed. The edition is part of the match so a flag id from another
   * edition cannot be touched from this one.
   */
  dismissCheckInFlag: isAdmin
    .input(hackathonInput.extend({ flagId: uuid, dismissed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const [flag] = await db
        .update(hackathonCheckInFlags)
        .set(
          input.dismissed
            ? { dismissedAt: new Date(), dismissedById: ctx.userId }
            : { dismissedAt: null, dismissedById: null },
        )
        .where(
          and(
            eq(hackathonCheckInFlags.id, input.flagId),
            eq(hackathonCheckInFlags.hackathonId, input.hackathonId),
          ),
        )
        .returning({ id: hackathonCheckInFlags.id });
      if (!flag) throw notFound("That flag is gone. Refresh the list.");

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: input.dismissed
          ? "judging.dismissCheckInFlag"
          : "judging.reopenCheckInFlag",
        resourceId: flag.id,
        metadata: { hackathonId: input.hackathonId },
      });
      return { dismissed: input.dismissed };
    }),

  /**
   * Pulls a project from prizes, or puts it back. Judges still score it and
   * the room schedule is untouched; only placements and public results leave
   * it out, so the cached results go at once.
   */
  setPrizeEligibility: isAdmin
    .input(hackathonInput.extend({ entryId: uuid, eligible: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const changed = await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        const [entry] = await tx
          .select({ prizeIneligibleAt: judgingEntries.prizeIneligibleAt })
          .from(judgingEntries)
          .where(
            and(
              eq(judgingEntries.id, input.entryId),
              eq(judgingEntries.hackathonId, input.hackathonId),
            ),
          )
          .limit(1);
        if (!entry) throw notFound("That project is gone. Refresh the list.");
        if ((entry.prizeIneligibleAt === null) === input.eligible) return false;

        const now = new Date();
        await tx
          .update(judgingEntries)
          .set(
            input.eligible
              ? {
                  prizeIneligibleAt: null,
                  prizeIneligibleById: null,
                  updatedAt: now,
                }
              : {
                  prizeIneligibleAt: now,
                  prizeIneligibleById: ctx.userId,
                  updatedAt: now,
                },
          )
          .where(eq(judgingEntries.id, input.entryId));
        return true;
      });
      if (!changed) return { changed: false };

      evictResults(ctx.cache, input.hackathonId);
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.setPrizeEligibility",
        resourceId: input.entryId,
        severity: "warn",
        metadata: { hackathonId: input.hackathonId, eligible: input.eligible },
      });
      return { changed: true };
    }),

  // ---------------------------------------------------------------------,
};
