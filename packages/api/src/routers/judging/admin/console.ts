// Console header, setup checklist and getting projects in.

import { z } from "zod";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import {
  judgingAnnouncements,
  judgingAppointments,
  judgingChallenges,
  judgingEntries,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingPresence,
  judgingRoomLinks,
  judgingRooms,
  judgingRubricItems,
  judgingSchedules,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isAdmin, isAdminUpload } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import {
  assertHackathonExists,
  ensureJudgingConfig,
} from "../../../services/judging/config";
import { outerColumn } from "../../../services/judging/outer-column";
import {
  initializeGroups,
  lockEdition,
  rebuildDerivedMemberships,
} from "../../../services/judging/challenges";
import {
  DEVPOST_MAX_BYTES,
  importDevpost,
  promoteSubmissions,
} from "../../../services/judging/import";
import {
  buildChecklist,
  readChecklistFacts,
  rubricLockReason,
} from "../../../services/judging/checklist";
import { holdsEveryRating } from "../../../services/judging/scoring-sql";
import { openCheckInFlagCount } from "../../../services/check-in-flags";
import { repoCheckIfDue } from "../../../services/judging/repo-check";
import { hackathonInput, SEATED_WINDOW_MS } from "./shared";

export const consoleProcedures = {
  /** The console header: the edition, its switches and how much is set up. */
  overview: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const id = input.hackathonId;
    const hackathon = await assertHackathonExists(db, id);
    const config = await ensureJudgingConfig(db, id);
    // The console polls this; it is where the late-push check is started from.
    // Not awaited: GitHub never holds up the poll.
    void repoCheckIfDue(db, id);
    const seatedSince = new Date(Date.now() - SEATED_WINDOW_MS);

    const [
      [entries],
      [members],
      [challenges],
      [rooms],
      [rubric],
      [schedule],
      [evaluations],
      [drafts],
      [announcements],
      [seated],
      openCheckInFlags,
    ] = await Promise.all([
      db
        .select({
          devpost: sql<number>`count(*) filter (where ${judgingEntries.deletedAt} is null and ${judgingEntries.source} = 'devpost')::int`,
          portal: sql<number>`count(*) filter (where ${judgingEntries.deletedAt} is null and ${judgingEntries.source} = 'portal')::int`,
          removed: sql<number>`count(*) filter (where ${judgingEntries.deletedAt} is not null)::int`,
        })
        .from(judgingEntries)
        .where(eq(judgingEntries.hackathonId, id)),
      db
        .select({
          total: count(),
          linked: sql<number>`count(${judgingEntryMembers.userId})::int`,
        })
        .from(judgingEntryMembers)
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingEntryMembers.entryId),
        )
        .where(
          and(
            eq(judgingEntryMembers.hackathonId, id),
            isNull(judgingEntries.deletedAt),
          ),
        ),
      db
        .select({
          total: count(),
          groups: sql<number>`count(*) filter (where ${judgingChallenges.isGroup})::int`,
        })
        .from(judgingChallenges)
        .where(eq(judgingChallenges.hackathonId, id)),
      db
        .select({
          active: sql<number>`count(*) filter (where ${judgingRooms.archivedAt} is null)::int`,
          tables: sql<number>`count(*) filter (where ${judgingRooms.archivedAt} is null and ${judgingRooms.kind} = 'table')::int`,
          archived: sql<number>`count(*) filter (where ${judgingRooms.archivedAt} is not null)::int`,
          linked: sql<number>`count(*) filter (where ${judgingRooms.archivedAt} is null and exists (select 1 from ${judgingRoomLinks} where ${judgingRoomLinks.roomId} = ${outerColumn(judgingRooms, judgingRooms.id)} and ${judgingRoomLinks.revokedAt} is null))::int`,
        })
        .from(judgingRooms)
        .where(eq(judgingRooms.hackathonId, id)),
      db
        .select({
          ratings: sql<number>`count(*) filter (where ${judgingRubricItems.kind} = 'rating')::int`,
          responses: sql<number>`count(*) filter (where ${judgingRubricItems.kind} = 'response')::int`,
        })
        .from(judgingRubricItems)
        .where(eq(judgingRubricItems.hackathonId, id)),
      db
        .select({
          id: judgingSchedules.id,
          windowStart: judgingSchedules.windowStart,
          windowEnd: judgingSchedules.windowEnd,
          firstResultAt: judgingSchedules.firstResultAt,
          createdAt: judgingSchedules.createdAt,
          appointments: sql<number>`(select count(*)::int from ${judgingAppointments} where ${judgingAppointments.scheduleId} = ${outerColumn(judgingSchedules, judgingSchedules.id)})`,
        })
        .from(judgingSchedules)
        .where(eq(judgingSchedules.hackathonId, id))
        .limit(1),
      db
        .select({
          total: count(),
          // The ones placings count: every rating in, written response or not.
          complete: sql<number>`count(*) filter (where ${holdsEveryRating(id)})::int`,
        })
        .from(judgingEvaluations)
        .where(eq(judgingEvaluations.hackathonId, id)),
      db
        .select({ total: count() })
        .from(judgingEvaluationDrafts)
        .where(eq(judgingEvaluationDrafts.hackathonId, id)),
      db
        .select({ total: count() })
        .from(judgingAnnouncements)
        .where(
          and(
            eq(judgingAnnouncements.hackathonId, id),
            isNull(judgingAnnouncements.clearedAt),
          ),
        ),
      db
        .select({ total: count() })
        .from(judgingPresence)
        .where(
          and(
            eq(judgingPresence.hackathonId, id),
            isNull(judgingPresence.leftAt),
            gte(judgingPresence.lastSeenAt, seatedSince),
          ),
        ),
      openCheckInFlagCount(db, id),
    ]);

    const hasEvaluations = (evaluations?.total ?? 0) + (drafts?.total ?? 0) > 0;
    return {
      hackathon,
      config: {
        state: config.state,
        openedAt: config.openedAt,
        closedAt: config.closedAt,
        showAllScores: config.showAllScores,
        inventoryLockedAt: config.inventoryLockedAt,
        groupsInitializedAt: config.groupsInitializedAt,
        itineraryPublished: config.itineraryPublished,
        emergencyMode: config.emergencyMode,
        claimsStartedAt: config.claimsStartedAt,
      },
      counts: {
        entries: {
          devpost: entries?.devpost ?? 0,
          portal: entries?.portal ?? 0,
          removed: entries?.removed ?? 0,
        },
        members: {
          total: members?.total ?? 0,
          linked: members?.linked ?? 0,
        },
        challenges: {
          total: challenges?.total ?? 0,
          groups: challenges?.groups ?? 0,
        },
        rooms: {
          active: rooms?.active ?? 0,
          tables: rooms?.tables ?? 0,
          archived: rooms?.archived ?? 0,
          linked: rooms?.linked ?? 0,
        },
        rubric: {
          ratings: rubric?.ratings ?? 0,
          responses: rubric?.responses ?? 0,
        },
        evaluations: {
          total: evaluations?.total ?? 0,
          complete: evaluations?.complete ?? 0,
          drafts: drafts?.total ?? 0,
        },
        announcements: announcements?.total ?? 0,
        judgesSeated: seated?.total ?? 0,
        // Only how many wait for a decision. Who and why stay in the project
        // list, which is organiser-only.
        checkInFlags: { open: openCheckInFlags },
      },
      schedule: schedule ?? null,
      locks: {
        // The challenge tree; see assertStructureEditable.
        structure: !!schedule || hasEvaluations,
        rubric: rubricLockReason({
          state: config.state,
          scheduleSaved: !!schedule,
          hasEvaluations,
        }),
      },
    };
  }),

  /** What still stands between this edition and judging day. */
  checklist: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    await assertHackathonExists(db, input.hackathonId);
    const items = buildChecklist(
      await readChecklistFacts(db, input.hackathonId),
    );
    return {
      items,
      done: items.filter((item) => item.done).length,
      total: items.length,
    };
  }),

  // ---------------------------------------------------------------------
  // Projects in

  /**
   * Applies a Devpost submissions export. The client reads the file and
   * sends its text.
   */
  importDevpost: isAdminUpload
    .input(
      hackathonInput.extend({
        csv: z.string().min(1).max(DEVPOST_MAX_BYTES),
        mode: z.enum(["automatic", "replace"]).default("automatic"),
        confirmation: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await importDevpost(db, {
        hackathonId: input.hackathonId,
        csv: input.csv,
        mode: input.mode,
        confirmation: input.confirmation,
        userId: ctx.userId,
      });

      // Counts and a tag of the file only: the file holds hackers' emails.
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.importDevpost",
        resourceId: input.hackathonId,
        severity: result.mode === "replace" ? "critical" : "warn",
        metadata: {
          requestedMode: input.mode,
          mode: result.mode,
          imported: result.imported,
          skipped: result.skipped,
          removed: result.removed,
          rejected: result.rejected.length,
          drafts: result.drafts,
          collapsedRows: result.collapsedRows,
          newChallenges: result.newChallenges,
          linksRevoked: result.linksRevoked,
          guestsSignedOut: result.guestsSignedOut,
          bytes: result.bytes,
          fileTag: result.fileTag,
        },
      });

      return result;
    }),

  /** Copies portal submissions into judging. Safe to run again. */
  promoteSubmissions: isAdmin
    .input(hackathonInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await promoteSubmissions(db, input);
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.promoteSubmissions",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: result,
      });
      return result;
    }),

  /** Creates the General and MLH Challenges groups if they never were. */
  initializeGroups: isAdmin
    .input(hackathonInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const created = await db.transaction(async (tx) => {
        const { config } = await lockEdition(tx, input.hackathonId);
        const made = await initializeGroups(tx, input.hackathonId, config);
        if (made) await rebuildDerivedMemberships(tx, input.hackathonId);
        return made;
      });
      return { created };
    }),

  // ---------------------------------------------------------------------,
};
