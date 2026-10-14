import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  max,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import {
  hackathonProjects,
  judgingAnnouncements,
  judgingAppointments,
  judgingBuildings,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingGuestSessions,
  judgingPresence,
  judgingRoomLinks,
  judgingRooms,
  judgingRubricItems,
  judgingSchedules,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter } from "../../trpc";
import { isAdmin, isAdminUpload } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { isUniqueViolation } from "../../middleware/db-errors";
import {
  assertHackathonExists,
  ensureJudgingConfig,
} from "../../services/judging/config";
import type { JudgingDb } from "../../services/judging/config";
import { effectiveMode, sameLabel } from "../../services/judging/scope";
import {
  assertStructureEditable,
  derivedMemberships,
  groupingProblem,
  initializeGroups,
  lockEdition,
  readChallenges,
  readSetupLock,
  rebuildDerivedMemberships,
} from "../../services/judging/challenges";
import {
  DEVPOST_MAX_BYTES,
  importDevpost,
  promoteSubmissions,
} from "../../services/judging/import";
import {
  emptyRoom,
  issueRoomLink,
  MAX_TABLE_NUMBER,
  newTableNumbers,
  nextTableNumber,
  portalOrigin,
  revokeRoomAccess,
  roomAppointmentCount,
  roomLinkUrl,
  slotTables,
  tableName,
  tableNumber,
} from "../../services/judging/rooms";
import {
  dropEvaluations,
  dropRooms,
  resetAll,
  resetLaunch,
  resetProjects,
  resetSetup,
} from "../../services/judging/resets";
import {
  buildChecklist,
  readChecklistFacts,
  rubricLockReason,
  stateChangeProblem,
} from "../../services/judging/checklist";
import { notifyItineraryPosted } from "../../services/judging/notify";

// Organiser setup and live control of room judging: getting projects in,
// shaping challenges, rooms and the rubric, the switches flipped on judging
// day, and the resets. Reads are open to bug testers (isAdmin lets queries
// through). A write that checks state before changing it takes the edition
// lock (lockEdition in services/judging/challenges) first.

const uuid = z.string().uuid();
const hackathonInput = z.object({ hackathonId: uuid });
const resetInput = hackathonInput.extend({
  confirmation: z.string().trim().min(1).max(255),
});
const label = z.string().trim().min(1).max(255);
const roomName = z.string().trim().min(1).max(120);
const roomKind = z.enum(["room", "table"]);
const challengeMode = z.enum(["scheduled", "unscheduled", "remote"]);

// Line breaks are allowed in an announcement; other control characters are
// not, since they render as nothing or as boxes.
const announcementText = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  // eslint-disable-next-line no-control-regex
  .refine((value) => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value), {
    message: "The announcement contains characters that cannot be shown.",
  });

const rubricItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rating"),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
  }),
  z.object({
    kind: z.literal("response"),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    required: z.boolean().default(true),
    guestVisibility: z.enum(["public", "optional", "private"]),
  }),
]);

// Presence older than this is a closed laptop, not a judge in the room.
const SEATED_WINDOW_MS = 15 * 60 * 1000;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

const notFound = (message: string) =>
  new TRPCError({ code: "NOT_FOUND", message });

const refuse = (message: string) =>
  new TRPCError({ code: "PRECONDITION_FAILED", message });

/** Public results are cached; anything that changes what they show evicts them. */
const evictResults = (
  cache: { delete: (key: string) => void },
  hackathonId: string,
) => cache.delete(`hackathon:${hackathonId}:results`);

// Each of these finds the row's edition, takes the edition lock, then reads
// the row again so the checks see it as it stands under the lock.

async function lockEntry(tx: JudgingDb, entryId: string) {
  const [scope] = await tx
    .select({ hackathonId: judgingEntries.hackathonId })
    .from(judgingEntries)
    .where(eq(judgingEntries.id, entryId))
    .limit(1);
  if (!scope) throw notFound("That project is gone. Refresh the list.");
  await lockEdition(tx, scope.hackathonId);
  const [entry] = await tx
    .select()
    .from(judgingEntries)
    .where(eq(judgingEntries.id, entryId))
    .limit(1);
  if (!entry) throw notFound("That project is gone. Refresh the list.");
  return entry;
}

async function lockChallenge(tx: JudgingDb, challengeId: string) {
  const [scope] = await tx
    .select({ hackathonId: judgingChallenges.hackathonId })
    .from(judgingChallenges)
    .where(eq(judgingChallenges.id, challengeId))
    .limit(1);
  if (!scope) throw notFound("That challenge is gone. Refresh the list.");
  await lockEdition(tx, scope.hackathonId);
  const challenges = await readChallenges(tx, scope.hackathonId);
  const challenge = challenges.find((c) => c.id === challengeId);
  if (!challenge) throw notFound("That challenge is gone. Refresh the list.");
  return { hackathonId: scope.hackathonId, challenge, challenges };
}

async function lockRoom(tx: JudgingDb, roomId: string) {
  const [scope] = await tx
    .select({ hackathonId: judgingRooms.hackathonId })
    .from(judgingRooms)
    .where(eq(judgingRooms.id, roomId))
    .limit(1);
  if (!scope) throw notFound("That room is gone. Refresh the Rooms tab.");
  await lockEdition(tx, scope.hackathonId);
  const [room] = await tx
    .select()
    .from(judgingRooms)
    .where(eq(judgingRooms.id, roomId))
    .limit(1);
  if (!room) throw notFound("That room is gone. Refresh the Rooms tab.");
  return room;
}

/** A challenge a room can serve: top-level and in this edition. */
async function assertRoomChallenge(
  tx: JudgingDb,
  hackathonId: string,
  challengeId: string,
) {
  const [challenge] = await tx
    .select({ parentId: judgingChallenges.parentId })
    .from(judgingChallenges)
    .where(
      and(
        eq(judgingChallenges.id, challengeId),
        eq(judgingChallenges.hackathonId, hackathonId),
      ),
    )
    .limit(1);
  if (!challenge) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That challenge is not part of this hackathon.",
    });
  }
  if (challenge.parentId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Rooms judge a top-level challenge or group. Pick the group this challenge sits in.",
    });
  }
}

async function assertBuilding(
  tx: JudgingDb,
  hackathonId: string,
  buildingId: string,
) {
  const [building] = await tx
    .select({ id: judgingBuildings.id })
    .from(judgingBuildings)
    .where(
      and(
        eq(judgingBuildings.id, buildingId),
        eq(judgingBuildings.hackathonId, hackathonId),
      ),
    )
    .limit(1);
  if (!building) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That building is not part of this hackathon.",
    });
  }
}

const roomNameTaken = (name: string) =>
  new TRPCError({
    code: "CONFLICT",
    message: `An active room or table called ${name} is already in that building. Pick another name.`,
  });

export const judgingAdminRouter = createTRPCRouter({
  // ---------------------------------------------------------------------
  // Console

  /** The console header: the edition, its switches and how much is set up. */
  overview: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const id = input.hackathonId;
    const hackathon = await assertHackathonExists(db, id);
    const config = await ensureJudgingConfig(db, id);
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
          linked: sql<number>`count(*) filter (where ${judgingRooms.archivedAt} is null and exists (select 1 from ${judgingRoomLinks} where ${judgingRoomLinks.roomId} = ${judgingRooms.id} and ${judgingRoomLinks.revokedAt} is null))::int`,
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
          appointments: sql<number>`(select count(*)::int from ${judgingAppointments} where ${judgingAppointments.scheduleId} = ${judgingSchedules.id})`,
        })
        .from(judgingSchedules)
        .where(eq(judgingSchedules.hackathonId, id))
        .limit(1),
      db
        .select({
          total: count(),
          complete: sql<number>`count(*) filter (where ${judgingEvaluations.isComplete})::int`,
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

  // ---------------------------------------------------------------------
  // Projects

  listEntries: isAdmin
    .input(
      hackathonInput.extend({
        search: z.string().trim().max(200).optional(),
        source: z.enum(["all", "devpost", "portal"]).default("all"),
        status: z.enum(["live", "removed", "all"]).default("live"),
        challengeId: uuid.optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const pattern = input.search ? `%${escapeLike(input.search)}%` : null;

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
            createdAt: judgingEntries.createdAt,
          })
          .from(judgingEntries)
          .where(where)
          .orderBy(asc(judgingEntries.title), asc(judgingEntries.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
      ]);

      const ids = rows.map((row) => row.id);
      const [members, memberships, appointments, evaluations] =
        ids.length === 0
          ? [[], [], [], []]
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
                    eq(judgingEvaluations.isComplete, true),
                  ),
                )
                .groupBy(judgingEvaluations.entryId),
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

        if (entry.source === "portal" && entry.sourceProjectId) {
          const [project] = await tx
            .select({
              status: hackathonProjects.status,
              withdrawnByAdminAt: hackathonProjects.withdrawnByAdminAt,
            })
            .from(hackathonProjects)
            .where(eq(hackathonProjects.id, entry.sourceProjectId))
            .limit(1);
          if (
            project &&
            (project.withdrawnByAdminAt || project.status === "draft")
          ) {
            throw refuse(
              "This team's portal submission was withdrawn, so it cannot be judged. Ask the team to submit it again.",
            );
          }
        }

        await tx
          .update(judgingEntries)
          .set({ deletedAt: null, deletedById: null, updatedAt: new Date() })
          .where(eq(judgingEntries.id, entry.id));
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

  // ---------------------------------------------------------------------
  // Challenges

  listChallenges: isAdmin
    .input(hackathonInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const id = input.hackathonId;
      const [challenges, entryCounts, roomCounts, lock] = await Promise.all([
        readChallenges(db, id),
        db
          .select({
            challengeId: judgingEntryChallenges.challengeId,
            optIns: sql<number>`count(*) filter (where ${judgingEntryChallenges.isOptIn})::int`,
            total: count(),
          })
          .from(judgingEntryChallenges)
          .innerJoin(
            judgingEntries,
            eq(judgingEntries.id, judgingEntryChallenges.entryId),
          )
          .where(
            and(
              eq(judgingEntryChallenges.hackathonId, id),
              isNull(judgingEntries.deletedAt),
            ),
          )
          .groupBy(judgingEntryChallenges.challengeId),
        db
          .select({
            challengeId: judgingRooms.challengeId,
            value: count(),
            tables: sql<number>`count(*) filter (where ${judgingRooms.kind} = 'table')::int`,
          })
          .from(judgingRooms)
          .where(
            and(
              eq(judgingRooms.hackathonId, id),
              isNull(judgingRooms.archivedAt),
            ),
          )
          .groupBy(judgingRooms.challengeId),
        readSetupLock(db, id),
      ]);

      return {
        structureLocked: lock.scheduleSaved || lock.hasEvaluations,
        challenges: challenges.map((challenge) => {
          const entries = entryCounts.find(
            (row) => row.challengeId === challenge.id,
          );
          const stations = roomCounts.find(
            (row) => row.challengeId === challenge.id,
          );
          return {
            ...challenge,
            effectiveMode: effectiveMode(challenges, challenge.id),
            optIns: entries?.optIns ?? 0,
            entries: entries?.total ?? 0,
            // Rooms and tables together; `tables` is how many are tables.
            rooms: stations?.value ?? 0,
            tables: stations?.tables ?? 0,
            children: challenges.filter((c) => c.parentId === challenge.id)
              .length,
          };
        }),
      };
    }),

  createChallenge: isAdmin
    .input(
      hackathonInput.extend({
        label,
        isGroup: z.boolean().default(false),
        parentId: uuid.nullable().default(null),
        mode: challengeMode.default("scheduled"),
        importLabelMatch: z.string().trim().max(100).nullable().default(null),
        isGeneral: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const created = await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        await assertStructureEditable(tx, input.hackathonId);
        const challenges = await readChallenges(tx, input.hackathonId);

        if (
          challenges.some(
            (c) => c.isGroup === input.isGroup && sameLabel(c.label, input.label),
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A ${input.isGroup ? "group" : "challenge"} called ${input.label} already exists.`,
          });
        }
        if (input.importLabelMatch && !input.isGroup) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only a group collects imported labels.",
          });
        }
        const problem = groupingProblem(
          challenges,
          { id: null, isGroup: input.isGroup, isGeneral: input.isGeneral },
          input.parentId,
        );
        if (problem) {
          throw new TRPCError({ code: "BAD_REQUEST", message: problem });
        }

        const [order] = await tx
          .select({ value: max(judgingChallenges.displayOrder) })
          .from(judgingChallenges)
          .where(eq(judgingChallenges.hackathonId, input.hackathonId));
        const [row] = await tx
          .insert(judgingChallenges)
          .values({
            hackathonId: input.hackathonId,
            label: input.label.replace(/\s+/g, " "),
            isGroup: input.isGroup,
            parentId: input.parentId,
            mode: input.mode,
            importLabelMatch: input.importLabelMatch || null,
            isGeneral: input.isGeneral,
            displayOrder: (order?.value ?? -1) + 1,
          })
          .returning();
        if (input.isGeneral) {
          await rebuildDerivedMemberships(tx, input.hackathonId);
        }
        return row!;
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.createChallenge",
        resourceId: created.id,
        metadata: {
          hackathonId: input.hackathonId,
          isGroup: created.isGroup,
          isGeneral: created.isGeneral,
        },
      });
      return created;
    }),

  /**
   * Renames a challenge or changes its place in the tree. Renaming is always
   * allowed; regrouping, mode and general are frozen once a schedule or
   * scores depend on them.
   */
  updateChallenge: isAdmin
    .input(
      z.object({
        challengeId: uuid,
        label: label.optional(),
        parentId: uuid.nullable().optional(),
        mode: challengeMode.optional(),
        importLabelMatch: z.string().trim().max(100).nullable().optional(),
        isGeneral: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const updated = await db.transaction(async (tx) => {
        const { hackathonId, challenge, challenges } = await lockChallenge(
          tx,
          input.challengeId,
        );
        const next = {
          label: input.label?.replace(/\s+/g, " ") ?? challenge.label,
          parentId:
            input.parentId === undefined ? challenge.parentId : input.parentId,
          mode: input.mode ?? challenge.mode,
          importLabelMatch:
            input.importLabelMatch === undefined
              ? challenge.importLabelMatch
              : input.importLabelMatch || null,
          isGeneral: input.isGeneral ?? challenge.isGeneral,
        };
        const structural =
          next.parentId !== challenge.parentId ||
          next.mode !== challenge.mode ||
          next.isGeneral !== challenge.isGeneral;
        if (structural) await assertStructureEditable(tx, hackathonId);

        if (
          challenges.some(
            (c) =>
              c.id !== challenge.id &&
              c.isGroup === challenge.isGroup &&
              sameLabel(c.label, next.label),
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A ${challenge.isGroup ? "group" : "challenge"} called ${next.label} already exists.`,
          });
        }
        if (next.importLabelMatch && !challenge.isGroup) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only a group collects imported labels.",
          });
        }
        const problem = groupingProblem(
          challenges,
          {
            id: challenge.id,
            isGroup: challenge.isGroup,
            isGeneral: next.isGeneral,
          },
          next.parentId,
        );
        if (problem) {
          throw new TRPCError({ code: "BAD_REQUEST", message: problem });
        }
        if (next.parentId && !challenge.parentId) {
          const [room] = await tx
            .select({ name: judgingRooms.name })
            .from(judgingRooms)
            .where(
              and(
                eq(judgingRooms.challengeId, challenge.id),
                isNull(judgingRooms.archivedAt),
              ),
            )
            .limit(1);
          if (room) {
            throw refuse(
              `${room.name} judges ${challenge.label} directly. Point the room at the group or archive it before moving the challenge in.`,
            );
          }
        }

        const [row] = await tx
          .update(judgingChallenges)
          .set(next)
          .where(eq(judgingChallenges.id, challenge.id))
          .returning();
        if (structural) await rebuildDerivedMemberships(tx, hackathonId);
        return { row: row!, structural };
      });

      if (updated.structural) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.updateChallenge",
          resourceId: updated.row.id,
          metadata: {
            hackathonId: updated.row.hackathonId,
            parentId: updated.row.parentId,
            mode: updated.row.mode,
            isGeneral: updated.row.isGeneral,
          },
        });
      }
      return updated.row;
    }),

  /** Deletes a challenge nothing uses: no projects, rooms or scores. */
  deleteChallenge: isAdmin
    .input(z.object({ challengeId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const deleted = await db.transaction(async (tx) => {
        const { hackathonId, challenge, challenges } = await lockChallenge(
          tx,
          input.challengeId,
        );
        const id = challenge.id;

        const [[optIn], [room], [appointment], [evaluation], [draft]] =
          await Promise.all([
            tx
              .select({ value: count() })
              .from(judgingEntryChallenges)
              .where(
                and(
                  eq(judgingEntryChallenges.challengeId, id),
                  eq(judgingEntryChallenges.isOptIn, true),
                ),
              ),
            tx
              .select({ value: count() })
              .from(judgingRooms)
              .where(eq(judgingRooms.challengeId, id)),
            tx
              .select({ value: count() })
              .from(judgingAppointments)
              .where(eq(judgingAppointments.challengeId, id)),
            tx
              .select({ value: count() })
              .from(judgingEvaluations)
              .where(eq(judgingEvaluations.challengeId, id)),
            tx
              .select({ value: count() })
              .from(judgingEvaluationDrafts)
              .where(eq(judgingEvaluationDrafts.challengeId, id)),
          ]);
        const children = challenges.filter((c) => c.parentId === id).length;
        const uses = [
          [optIn?.value ?? 0, "project opted in", "projects opted in"],
          [children, "challenge in the group", "challenges in the group"],
          [
            room?.value ?? 0,
            "room or table",
            "rooms and tables (archived ones too)",
          ],
          [appointment?.value ?? 0, "presentation", "presentations"],
          [
            (evaluation?.value ?? 0) + (draft?.value ?? 0),
            "evaluation",
            "evaluations",
          ],
        ] as const;
        const inUse = uses.filter(([n]) => n > 0);
        if (inUse.length > 0) {
          throw refuse(
            `${challenge.label} is still in use: ${inUse
              .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
              .join(", ")}.`,
          );
        }

        await tx.delete(judgingChallenges).where(eq(judgingChallenges.id, id));
        await rebuildDerivedMemberships(tx, hackathonId);
        return { id, hackathonId, label: challenge.label };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.deleteChallenge",
        resourceId: deleted.id,
        severity: "warn",
        metadata: { hackathonId: deleted.hackathonId, label: deleted.label },
      });
      return { deleted: true };
    }),

  // ---------------------------------------------------------------------
  // Buildings and rooms

  /** Buildings and every room, archived ones included, with live state. */
  listRooms: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const id = input.hackathonId;
    const seatedSince = new Date(Date.now() - SEATED_WINDOW_MS);
    const now = new Date();

    const [buildings, rooms, challenges, links, seated, guests, appointments, notices] =
      await Promise.all([
        db
          .select({ id: judgingBuildings.id, name: judgingBuildings.name })
          .from(judgingBuildings)
          .where(eq(judgingBuildings.hackathonId, id))
          .orderBy(asc(judgingBuildings.name)),
        db
          .select({
            id: judgingRooms.id,
            name: judgingRooms.name,
            kind: judgingRooms.kind,
            buildingId: judgingRooms.buildingId,
            challengeId: judgingRooms.challengeId,
            displayOrder: judgingRooms.displayOrder,
            archivedAt: judgingRooms.archivedAt,
          })
          .from(judgingRooms)
          .where(eq(judgingRooms.hackathonId, id))
          .orderBy(asc(judgingRooms.displayOrder), asc(judgingRooms.name)),
        readChallenges(db, id),
        db
          .select({
            id: judgingRoomLinks.id,
            roomId: judgingRoomLinks.roomId,
            createdAt: judgingRoomLinks.createdAt,
          })
          .from(judgingRoomLinks)
          .where(
            and(
              eq(judgingRoomLinks.hackathonId, id),
              isNull(judgingRoomLinks.revokedAt),
            ),
          ),
        db
          .select({ roomId: judgingPresence.roomId, value: count() })
          .from(judgingPresence)
          .where(
            and(
              eq(judgingPresence.hackathonId, id),
              isNull(judgingPresence.leftAt),
              gte(judgingPresence.lastSeenAt, seatedSince),
            ),
          )
          .groupBy(judgingPresence.roomId),
        db
          .select({ roomId: judgingGuestSessions.roomId, value: count() })
          .from(judgingGuestSessions)
          .where(
            and(
              eq(judgingGuestSessions.hackathonId, id),
              isNull(judgingGuestSessions.revokedAt),
              gte(judgingGuestSessions.expiresAt, now),
            ),
          )
          .groupBy(judgingGuestSessions.roomId),
        db
          .select({ roomId: judgingAppointments.roomId, value: count() })
          .from(judgingAppointments)
          .where(eq(judgingAppointments.hackathonId, id))
          .groupBy(judgingAppointments.roomId),
        db
          .select({
            id: judgingAnnouncements.id,
            roomId: judgingAnnouncements.roomId,
            message: judgingAnnouncements.message,
            isUrgent: judgingAnnouncements.isUrgent,
            includeGuests: judgingAnnouncements.includeGuests,
            createdAt: judgingAnnouncements.createdAt,
          })
          .from(judgingAnnouncements)
          .where(
            and(
              eq(judgingAnnouncements.hackathonId, id),
              isNull(judgingAnnouncements.clearedAt),
              isNotNull(judgingAnnouncements.roomId),
            ),
          ),
      ]);

    const origin = portalOrigin(ctx.req);
    const byRoom = (list: { roomId: string; value: number }[], roomId: string) =>
      list.find((row) => row.roomId === roomId)?.value ?? 0;

    return {
      buildings: buildings.map((building) => {
        const inside = rooms.filter((room) => room.buildingId === building.id);
        return {
          ...building,
          rooms: inside.filter((room) => !room.archivedAt).length,
          // Where "Add tables" starts when no first number is given.
          nextTable: nextTableNumber(
            inside.map((room) => ({
              name: room.name,
              archived: !!room.archivedAt,
            })),
          ),
        };
      }),
      rooms: rooms.map((room) => {
        const link = links.find((l) => l.roomId === room.id);
        const challenge = challenges.find((c) => c.id === room.challengeId);
        return {
          ...room,
          buildingName:
            buildings.find((b) => b.id === room.buildingId)?.name ?? null,
          challengeLabel: challenge?.label ?? "",
          challengeMode: challenge?.mode ?? "scheduled",
          link: link
            ? {
                id: link.id,
                createdAt: link.createdAt,
                url: roomLinkUrl(link.id, origin),
              }
            : null,
          judgesSeated: byRoom(seated, room.id),
          guestSessions: byRoom(guests, room.id),
          appointments: byRoom(appointments, room.id),
          announcement:
            notices.find((notice) => notice.roomId === room.id) ?? null,
        };
      }),
    };
  }),

  createBuilding: isAdmin
    .input(hackathonInput.extend({ name: roomName }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      try {
        const [building] = await db
          .insert(judgingBuildings)
          .values({ hackathonId: input.hackathonId, name: input.name })
          .returning();
        return building!;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `There is already a building called ${input.name}.`,
          });
        }
        throw error;
      }
    }),

  renameBuilding: isAdmin
    .input(z.object({ buildingId: uuid, name: roomName }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      try {
        const [building] = await db
          .update(judgingBuildings)
          .set({ name: input.name })
          .where(eq(judgingBuildings.id, input.buildingId))
          .returning();
        if (!building) throw notFound("That building is gone. Refresh the Rooms tab.");
        return building;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `There is already a building called ${input.name}.`,
          });
        }
        throw error;
      }
    }),

  /** Deletes a building no active room is in. */
  deleteBuilding: isAdmin
    .input(z.object({ buildingId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await db.transaction(async (tx) => {
        const [building] = await tx
          .select()
          .from(judgingBuildings)
          .where(eq(judgingBuildings.id, input.buildingId))
          .limit(1);
        if (!building) throw notFound("That building is gone. Refresh the Rooms tab.");
        await lockEdition(tx, building.hackathonId);

        const [rooms] = await tx
          .select({ value: count() })
          .from(judgingRooms)
          .where(
            and(
              eq(judgingRooms.buildingId, building.id),
              isNull(judgingRooms.archivedAt),
            ),
          );
        if ((rooms?.value ?? 0) > 0) {
          throw refuse(
            `${building.name} still has ${rooms!.value} active room${rooms!.value === 1 ? "" : "s"}. Move or archive them first.`,
          );
        }
        await tx
          .delete(judgingBuildings)
          .where(eq(judgingBuildings.id, building.id));
      });
      return { deleted: true };
    }),

  createRoom: isAdmin
    .input(
      hackathonInput.extend({
        name: roomName,
        kind: roomKind.default("room"),
        challengeId: uuid,
        buildingId: uuid.nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      try {
        return await db.transaction(async (tx) => {
          await lockEdition(tx, input.hackathonId);
          await assertRoomChallenge(tx, input.hackathonId, input.challengeId);
          if (input.buildingId) {
            await assertBuilding(tx, input.hackathonId, input.buildingId);
          }
          const [order] = await tx
            .select({ value: max(judgingRooms.displayOrder) })
            .from(judgingRooms)
            .where(eq(judgingRooms.hackathonId, input.hackathonId));
          const [room] = await tx
            .insert(judgingRooms)
            .values({
              hackathonId: input.hackathonId,
              name: input.name,
              kind: input.kind,
              challengeId: input.challengeId,
              buildingId: input.buildingId,
              displayOrder: (order?.value ?? -1) + 1,
            })
            .returning();
          return room!;
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw roomNameTaken(input.name);
        throw error;
      }
    }),

  /**
   * Adds a hall's numbered tables in one go, "Table 1" to "Table 30" say,
   * listed in number order among the hall's tables. Numbers an active station
   * in the hall already goes by are skipped, so re-running a range fills gaps.
   */
  createTables: isAdmin
    .input(
      hackathonInput.extend({
        challengeId: uuid,
        buildingId: uuid,
        count: z.number().int().min(1).max(200),
        // Left out: one past the hall's highest table number.
        firstNumber: z.number().int().min(1).max(MAX_TABLE_NUMBER).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      try {
        return await db.transaction(async (tx) => {
          await lockEdition(tx, input.hackathonId);
          await assertRoomChallenge(tx, input.hackathonId, input.challengeId);
          await assertBuilding(tx, input.hackathonId, input.buildingId);
          const listed = await tx
            .select({
              id: judgingRooms.id,
              name: judgingRooms.name,
              buildingId: judgingRooms.buildingId,
              displayOrder: judgingRooms.displayOrder,
              archivedAt: judgingRooms.archivedAt,
            })
            .from(judgingRooms)
            .where(eq(judgingRooms.hackathonId, input.hackathonId))
            .orderBy(asc(judgingRooms.displayOrder), asc(judgingRooms.name));
          const inHall = (room: { buildingId: string | null }) =>
            room.buildingId === input.buildingId;
          const stations = listed.filter(inHall).map((room) => ({
            name: room.name,
            archived: !!room.archivedAt,
          }));
          const first = input.firstNumber ?? nextTableNumber(stations);
          const last = first + input.count - 1;
          if (last > MAX_TABLE_NUMBER) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Table numbers stop at ${MAX_TABLE_NUMBER}. Start lower or add fewer tables.`,
            });
          }
          const numbers = newTableNumbers(stations, input.count, first);
          if (numbers.length === 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                input.count === 1
                  ? `${tableName(first)} is in that building already.`
                  : `${tableName(first)} to ${tableName(last)} are all in that building already.`,
            });
          }
          const order = slotTables(
            listed.map((room) => ({
              id: room.id as string | null,
              displayOrder: room.displayOrder,
              number: inHall(room) ? tableNumber(room.name) : null,
            })),
            numbers.map((number) => ({ id: null, displayOrder: -1, number })),
          );
          // Stations after a table slotted in ahead of them move down.
          for (const [index, station] of order.entries()) {
            if (station.id && station.displayOrder !== index) {
              await tx
                .update(judgingRooms)
                .set({ displayOrder: index })
                .where(eq(judgingRooms.id, station.id));
            }
          }
          await tx.insert(judgingRooms).values(
            order.flatMap((station, index) =>
              station.id || station.number === null
                ? []
                : [
                    {
                      hackathonId: input.hackathonId,
                      name: tableName(station.number),
                      kind: "table" as const,
                      challengeId: input.challengeId,
                      buildingId: input.buildingId,
                      displayOrder: index,
                    },
                  ],
            ),
          );
          return { created: numbers.length, numbers };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "One of these table numbers was taken in that building just now. Refresh the Rooms tab and try again.",
          });
        }
        throw error;
      }
    }),

  /**
   * Edits an active room. Moving it to another challenge or building is
   * refused while presentations are scheduled in it. A new challenge also
   * changes what its guests may judge, so a live link is retired, which
   * takes the room's name typed out.
   */
  updateRoom: isAdmin
    .input(
      z.object({
        roomId: uuid,
        name: roomName.optional(),
        kind: roomKind.optional(),
        challengeId: uuid.optional(),
        buildingId: uuid.nullable().optional(),
        confirmation: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const name = input.name;
      try {
        const result = await db.transaction(async (tx) => {
          const room = await lockRoom(tx, input.roomId);
          if (room.archivedAt) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unarchive the room before editing it.",
            });
          }

          const challengeChanges =
            input.challengeId !== undefined &&
            input.challengeId !== room.challengeId;
          const buildingChanges =
            input.buildingId !== undefined &&
            input.buildingId !== room.buildingId;

          if (challengeChanges || buildingChanges) {
            const scheduled = await roomAppointmentCount(tx, room.id);
            if (scheduled > 0) {
              throw refuse(
                `${room.name} has ${scheduled} scheduled presentation${scheduled === 1 ? "" : "s"}. Drop the schedule before moving the room to another ${challengeChanges ? "challenge" : "building"}.`,
              );
            }
          }
          if (challengeChanges) {
            await assertRoomChallenge(tx, room.hackathonId, input.challengeId!);
          }
          if (buildingChanges && input.buildingId) {
            await assertBuilding(tx, room.hackathonId, input.buildingId);
          }

          let signedOut = 0;
          if (challengeChanges) {
            const [link] = await tx
              .select({ id: judgingRoomLinks.id })
              .from(judgingRoomLinks)
              .where(
                and(
                  eq(judgingRoomLinks.roomId, room.id),
                  isNull(judgingRoomLinks.revokedAt),
                ),
              )
              .limit(1);
            if (link) {
              if (input.confirmation !== room.name) {
                throw refuse(
                  `${room.name} has a live QR link. Changing its challenge retires the link and signs its guest judges out; type ${room.name} to confirm.`,
                );
              }
              signedOut = (
                await revokeRoomAccess(
                  tx,
                  { hackathonId: room.hackathonId, roomId: room.id },
                  ctx.userId,
                )
              ).sessions;
            }
          }

          if (
            input.name === undefined &&
            input.kind === undefined &&
            input.challengeId === undefined &&
            input.buildingId === undefined
          ) {
            return { room, signedOut, challengeChanges };
          }
          const [updated] = await tx
            .update(judgingRooms)
            .set({
              name: input.name,
              kind: input.kind,
              challengeId: input.challengeId,
              buildingId: input.buildingId,
            })
            .where(eq(judgingRooms.id, room.id))
            .returning();
          return { room: updated!, signedOut, challengeChanges };
        });

        if (result.challengeChanges) {
          await recordAdminAction(db, {
            userId: ctx.userId,
            action: "judging.updateRoom",
            resourceId: result.room.id,
            severity: result.signedOut > 0 ? "warn" : "info",
            metadata: {
              hackathonId: result.room.hackathonId,
              challengeId: result.room.challengeId,
              guestsSignedOut: result.signedOut,
            },
          });
        }
        return result;
      } catch (error) {
        if (isUniqueViolation(error)) throw roomNameTaken(name ?? "that name");
        throw error;
      }
    }),

  /**
   * Sets the order rooms are listed in, first to last. Only stations whose
   * place changed are written, so swapping two rooms in an edition of
   * hundreds of tables is two updates.
   */
  reorderRooms: isAdmin
    .input(hackathonInput.extend({ roomIds: z.array(uuid).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        const current = await tx
          .select({
            id: judgingRooms.id,
            displayOrder: judgingRooms.displayOrder,
          })
          .from(judgingRooms)
          .where(eq(judgingRooms.hackathonId, input.hackathonId));
        const orderOf = new Map(
          current.map((room) => [room.id, room.displayOrder]),
        );
        for (const [index, roomId] of input.roomIds.entries()) {
          if (orderOf.get(roomId) === index) continue;
          await tx
            .update(judgingRooms)
            .set({ displayOrder: index })
            .where(
              and(
                eq(judgingRooms.id, roomId),
                eq(judgingRooms.hackathonId, input.hackathonId),
              ),
            );
        }
      });
      return { reordered: input.roomIds.length };
    }),

  /**
   * Archives a room (its link is retired and everyone in it stands up) or
   * brings it back. Refused while presentations are scheduled in it.
   */
  setRoomArchived: isAdmin
    .input(z.object({ roomId: uuid, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      let roomName = "that room";
      try {
        const result = await db.transaction(async (tx) => {
          const room = await lockRoom(tx, input.roomId);
          roomName = room.name;
          if (!!room.archivedAt === input.archived) {
            return { room, changed: false, signedOut: 0 };
          }

          let signedOut = 0;
          if (input.archived) {
            const scheduled = await roomAppointmentCount(tx, room.id);
            if (scheduled > 0) {
              throw refuse(
                `${room.name} has ${scheduled} scheduled presentation${scheduled === 1 ? "" : "s"}. Move them or drop the schedule before archiving it.`,
              );
            }
            signedOut = (
              await revokeRoomAccess(
                tx,
                { hackathonId: room.hackathonId, roomId: room.id },
                ctx.userId,
              )
            ).sessions;
            await emptyRoom(tx, room.id);
            // Nobody is left to read the room's message.
            await tx
              .update(judgingAnnouncements)
              .set({ clearedAt: new Date() })
              .where(
                and(
                  eq(judgingAnnouncements.roomId, room.id),
                  isNull(judgingAnnouncements.clearedAt),
                ),
              );
          }

          const [updated] = await tx
            .update(judgingRooms)
            .set({ archivedAt: input.archived ? new Date() : null })
            .where(eq(judgingRooms.id, room.id))
            .returning();
          return { room: updated!, changed: true, signedOut };
        });

        if (result.changed) {
          await recordAdminAction(db, {
            userId: ctx.userId,
            action: input.archived
              ? "judging.archiveRoom"
              : "judging.unarchiveRoom",
            resourceId: result.room.id,
            severity: input.archived ? "warn" : "info",
            metadata: {
              hackathonId: result.room.hackathonId,
              guestsSignedOut: result.signedOut,
            },
          });
        }
        return { room: result.room, signedOut: result.signedOut };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Another active room in that building is called ${roomName}. Rename one of them first.`,
          });
        }
        throw error;
      }
    }),

  /** Deletes a room that hosts no scheduled presentation. */
  deleteRoom: isAdmin
    .input(z.object({ roomId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const room = await db.transaction(async (tx) => {
        const room = await lockRoom(tx, input.roomId);
        const scheduled = await roomAppointmentCount(tx, room.id);
        if (scheduled > 0) {
          throw refuse(
            `${room.name} has ${scheduled} scheduled presentation${scheduled === 1 ? "" : "s"}. Drop the schedule before deleting it, or archive it after the presentations move.`,
          );
        }
        await tx.delete(judgingRooms).where(eq(judgingRooms.id, room.id));
        return room;
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.deleteRoom",
        resourceId: room.id,
        severity: "warn",
        metadata: { hackathonId: room.hackathonId, name: room.name },
      });
      return { deleted: true };
    }),

  /**
   * Issues the room's QR link, retiring the old one and signing out the
   * guests who came in through it. The first link locks the project list.
   */
  generateRoomLink: isAdmin
    .input(z.object({ roomId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await db.transaction(async (tx) => {
        const room = await lockRoom(tx, input.roomId);
        if (room.archivedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Unarchive the room before giving it a QR link.",
          });
        }
        const issued = await issueRoomLink(tx, room, ctx.userId);
        return { room, ...issued };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.generateRoomLink",
        resourceId: result.room.id,
        severity: result.revoked.sessions > 0 ? "warn" : "info",
        metadata: {
          hackathonId: result.room.hackathonId,
          replaced: result.revoked.links,
          guestsSignedOut: result.revoked.sessions,
        },
      });
      return {
        linkId: result.link.id,
        createdAt: result.link.createdAt,
        url: roomLinkUrl(result.link.id, portalOrigin(ctx.req)),
        replaced: result.revoked.links > 0,
        guestsSignedOut: result.revoked.sessions,
      };
    }),

  /**
   * Issues a QR link to each listed room or table that has none, so a hall's
   * tables need not be linked one at a time. One with a live link keeps it,
   * so no printed code stops working. The first link locks the project list.
   */
  generateRoomLinks: isAdmin
    .input(hackathonInput.extend({ roomIds: z.array(uuid).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const issued = await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        const rooms = await tx
          .select({ id: judgingRooms.id, hackathonId: judgingRooms.hackathonId })
          .from(judgingRooms)
          .where(
            and(
              eq(judgingRooms.hackathonId, input.hackathonId),
              inArray(judgingRooms.id, input.roomIds),
              isNull(judgingRooms.archivedAt),
              notExists(
                tx
                  .select({ one: sql`1` })
                  .from(judgingRoomLinks)
                  .where(
                    and(
                      eq(judgingRoomLinks.roomId, judgingRooms.id),
                      isNull(judgingRoomLinks.revokedAt),
                    ),
                  ),
              ),
            ),
          );
        for (const room of rooms) {
          await issueRoomLink(tx, room, ctx.userId);
        }
        return rooms.length;
      });

      if (issued > 0) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.generateRoomLinks",
          resourceId: input.hackathonId,
          metadata: { issued },
        });
      }
      return { issued };
    }),

  /** Retires the room's QR link and signs out its guest judges. */
  revokeRoomLink: isAdmin
    .input(z.object({ roomId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await db.transaction(async (tx) => {
        const room = await lockRoom(tx, input.roomId);
        const revoked = await revokeRoomAccess(
          tx,
          { hackathonId: room.hackathonId, roomId: room.id },
          ctx.userId,
        );
        return { room, revoked };
      });

      if (result.revoked.links + result.revoked.sessions > 0) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.revokeRoomLink",
          resourceId: result.room.id,
          severity: "warn",
          metadata: {
            hackathonId: result.room.hackathonId,
            links: result.revoked.links,
            guestsSignedOut: result.revoked.sessions,
          },
        });
      }
      return {
        revoked: result.revoked.links > 0,
        guestsSignedOut: result.revoked.sessions,
      };
    }),

  // ---------------------------------------------------------------------
  // Rubric and state

  getRubric: isAdmin.input(hackathonInput).query(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    await assertHackathonExists(db, input.hackathonId);
    const config = await ensureJudgingConfig(db, input.hackathonId);
    const [items, lock] = await Promise.all([
      db
        .select({
          id: judgingRubricItems.id,
          kind: judgingRubricItems.kind,
          label: judgingRubricItems.label,
          description: judgingRubricItems.description,
          required: judgingRubricItems.required,
          memberVisibility: judgingRubricItems.memberVisibility,
          guestVisibility: judgingRubricItems.guestVisibility,
        })
        .from(judgingRubricItems)
        .where(eq(judgingRubricItems.hackathonId, input.hackathonId))
        .orderBy(asc(judgingRubricItems.displayOrder)),
      readSetupLock(db, input.hackathonId),
    ]);
    return {
      items,
      lockedBecause: rubricLockReason({ state: config.state, ...lock }),
    };
  }),

  /**
   * Replaces the rubric. Ratings are 1–5 and always required; a response's
   * visibility is chosen for guests only, since member judges' feedback is
   * always shown to the team.
   */
  saveRubric: isAdmin
    .input(hackathonInput.extend({ items: z.array(rubricItem).max(30) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const saved = await db.transaction(async (tx) => {
        const { config } = await lockEdition(tx, input.hackathonId);
        const lock = await readSetupLock(tx, input.hackathonId);
        const reason = rubricLockReason({ state: config.state, ...lock });
        if (reason) throw refuse(reason);

        await tx
          .delete(judgingRubricItems)
          .where(eq(judgingRubricItems.hackathonId, input.hackathonId));
        if (input.items.length === 0) return [];
        return tx
          .insert(judgingRubricItems)
          .values(
            input.items.map((item, displayOrder) => ({
              hackathonId: input.hackathonId,
              kind: item.kind,
              label: item.label,
              description: item.description || null,
              displayOrder,
              ...(item.kind === "rating"
                ? { required: true, memberVisibility: null, guestVisibility: null }
                : {
                    required: item.required,
                    memberVisibility: "public" as const,
                    guestVisibility: item.guestVisibility,
                  }),
            })),
          )
          .returning();
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.saveRubric",
        resourceId: input.hackathonId,
        metadata: {
          ratings: saved.filter((item) => item.kind === "rating").length,
          responses: saved.filter((item) => item.kind === "response").length,
        },
      });
      return { items: saved };
    }),

  /** draft → open, open ↔ closed, and back to draft before any scoring. */
  setState: isAdmin
    .input(hackathonInput.extend({ state: z.enum(["draft", "open", "closed"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const result = await db.transaction(async (tx) => {
        const { config } = await lockEdition(tx, input.hackathonId);
        if (config.state === input.state) {
          return { config, from: config.state, changed: false };
        }

        const [[ratings], lock] = await Promise.all([
          tx
            .select({ value: count() })
            .from(judgingRubricItems)
            .where(
              and(
                eq(judgingRubricItems.hackathonId, input.hackathonId),
                eq(judgingRubricItems.kind, "rating"),
              ),
            ),
          readSetupLock(tx, input.hackathonId),
        ]);
        const problem = stateChangeProblem(config.state, input.state, {
          ratingItems: ratings?.value ?? 0,
          hasEvaluations: lock.hasEvaluations,
        });
        if (problem) throw refuse(problem);

        const now = new Date();
        const [updated] = await tx
          .update(judgingConfigs)
          .set({
            state: input.state,
            openedAt:
              input.state === "draft"
                ? null
                : input.state === "open"
                  ? (config.openedAt ?? now)
                  : config.openedAt,
            closedAt: input.state === "closed" ? now : null,
            updatedAt: now,
          })
          .where(eq(judgingConfigs.hackathonId, input.hackathonId))
          .returning();
        return { config: updated!, from: config.state, changed: true };
      });

      if (result.changed) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.setState",
          resourceId: input.hackathonId,
          severity: "warn",
          metadata: { from: result.from, to: input.state },
        });
      }
      return {
        state: result.config.state,
        openedAt: result.config.openedAt,
        closedAt: result.config.closedAt,
      };
    }),

  /** Lets member judges see every project's scores, not only ones they judged. */
  setShowAllScores: isAdmin
    .input(hackathonInput.extend({ showAllScores: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      await ensureJudgingConfig(db, input.hackathonId);
      await db
        .update(judgingConfigs)
        .set({ showAllScores: input.showAllScores, updatedAt: new Date() })
        .where(eq(judgingConfigs.hackathonId, input.hackathonId));
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.setShowAllScores",
        resourceId: input.hackathonId,
        metadata: { showAllScores: input.showAllScores },
      });
      return { showAllScores: input.showAllScores };
    }),

  /**
   * The hacker-facing switches: whether the itinerary shows times and rooms,
   * and emergency mode for when the schedule falls over.
   */
  setLaunch: isAdmin
    .input(
      hackathonInput
        .extend({
          itineraryPublished: z.boolean().optional(),
          emergencyMode: z.boolean().optional(),
        })
        .refine(
          (value) =>
            value.itineraryPublished !== undefined ||
            value.emergencyMode !== undefined,
          { message: "Say which switch to change." },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertHackathonExists(db, input.hackathonId);
      await ensureJudgingConfig(db, input.hackathonId);
      // Off to on is decided by the row, not a read before it: of two clicks
      // racing to publish, only one still finds it off, so teams hear once.
      const switchedOn =
        input.itineraryPublished === true
          ? await db
              .update(judgingConfigs)
              .set({ itineraryPublished: true })
              .where(
                and(
                  eq(judgingConfigs.hackathonId, input.hackathonId),
                  eq(judgingConfigs.itineraryPublished, false),
                ),
              )
              .returning({ hackathonId: judgingConfigs.hackathonId })
          : [];
      const [config] = await db
        .update(judgingConfigs)
        .set({
          itineraryPublished: input.itineraryPublished,
          emergencyMode: input.emergencyMode,
          updatedAt: new Date(),
        })
        .where(eq(judgingConfigs.hackathonId, input.hackathonId))
        .returning();

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.setLaunch",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: {
          itineraryPublished: input.itineraryPublished,
          emergencyMode: input.emergencyMode,
        },
      });

      // Teams learn their times the moment they appear, once per switch on.
      // Not awaited: a few hundred messages must not hold the organiser's
      // click, and it never rejects.
      if (switchedOn.length > 0) {
        void notifyItineraryPosted(db, input.hackathonId);
      }

      return {
        itineraryPublished: config!.itineraryPublished,
        emergencyMode: config!.emergencyMode,
      };
    }),

  // ---------------------------------------------------------------------
  // Announcements

  /** The messages on judges' screens now: one for everyone, one per room. */
  listAnnouncements: isAdmin
    .input(hackathonInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      return db
        .select({
          id: judgingAnnouncements.id,
          roomId: judgingAnnouncements.roomId,
          roomName: judgingRooms.name,
          message: judgingAnnouncements.message,
          includeGuests: judgingAnnouncements.includeGuests,
          isUrgent: judgingAnnouncements.isUrgent,
          createdAt: judgingAnnouncements.createdAt,
        })
        .from(judgingAnnouncements)
        .leftJoin(judgingRooms, eq(judgingRooms.id, judgingAnnouncements.roomId))
        .where(
          and(
            eq(judgingAnnouncements.hackathonId, input.hackathonId),
            isNull(judgingAnnouncements.clearedAt),
          ),
        )
        .orderBy(
          sql`${judgingAnnouncements.roomId} is not null`,
          asc(judgingRooms.name),
        );
    }),

  /** Replaces the message for everyone (no room) or for one room. */
  setAnnouncement: isAdmin
    .input(
      hackathonInput.extend({
        roomId: uuid.nullable(),
        message: announcementText,
        includeGuests: z.boolean().default(true),
        isUrgent: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const announcement = await db.transaction(async (tx) => {
        await lockEdition(tx, input.hackathonId);
        if (input.roomId) {
          const [room] = await tx
            .select({ id: judgingRooms.id })
            .from(judgingRooms)
            .where(
              and(
                eq(judgingRooms.id, input.roomId),
                eq(judgingRooms.hackathonId, input.hackathonId),
                isNull(judgingRooms.archivedAt),
              ),
            )
            .limit(1);
          if (!room) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "That room is not an active room of this hackathon.",
            });
          }
        }

        const now = new Date();
        await tx
          .update(judgingAnnouncements)
          .set({ clearedAt: now })
          .where(
            and(
              eq(judgingAnnouncements.hackathonId, input.hackathonId),
              input.roomId
                ? eq(judgingAnnouncements.roomId, input.roomId)
                : isNull(judgingAnnouncements.roomId),
              isNull(judgingAnnouncements.clearedAt),
            ),
          );
        const [row] = await tx
          .insert(judgingAnnouncements)
          .values({
            hackathonId: input.hackathonId,
            roomId: input.roomId,
            message: input.message,
            includeGuests: input.includeGuests,
            isUrgent: input.isUrgent,
            createdById: ctx.userId,
          })
          .returning();
        return row!;
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.setAnnouncement",
        resourceId: announcement.id,
        metadata: {
          hackathonId: input.hackathonId,
          scope: input.roomId ? "room" : "everyone",
          isUrgent: input.isUrgent,
          includeGuests: input.includeGuests,
        },
      });
      return announcement;
    }),

  clearAnnouncement: isAdmin
    .input(z.object({ announcementId: uuid }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const [cleared] = await db
        .update(judgingAnnouncements)
        .set({ clearedAt: new Date() })
        .where(
          and(
            eq(judgingAnnouncements.id, input.announcementId),
            isNull(judgingAnnouncements.clearedAt),
          ),
        )
        .returning({
          id: judgingAnnouncements.id,
          hackathonId: judgingAnnouncements.hackathonId,
        });
      if (cleared) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "judging.clearAnnouncement",
          resourceId: cleared.id,
          metadata: { hackathonId: cleared.hackathonId },
        });
      }
      return { cleared: !!cleared };
    }),

  // ---------------------------------------------------------------------
  // Resets. Each takes the hackathon's name typed out.

  dropEvaluations: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await dropEvaluations(db, input);
    evictResults(ctx.cache, input.hackathonId);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.dropEvaluations",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  resetProjects: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await resetProjects(db, input);
    evictResults(ctx.cache, input.hackathonId);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.resetProjects",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  dropRooms: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await dropRooms(db, input);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.dropRooms",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  resetSetup: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await resetSetup(db, input);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.resetSetup",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  resetLaunch: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await resetLaunch(db, input);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.resetLaunch",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  resetAll: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await resetAll(db, input);
    evictResults(ctx.cache, input.hackathonId);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.resetAll",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),
});
