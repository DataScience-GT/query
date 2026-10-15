import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import {
  hackathons,
  judgeAssignments,
  judges,
  judgingAnnouncements,
  judgingAppointments,
  judgingBuildings,
  judgingChallenges,
  judgingDeliberationEntries,
  judgingDeliberationSections,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluationRatings,
  judgingEvaluationResponses,
  judgingEvaluations,
  judgingPresence,
  judgingRooms,
  judgingSchedules,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import type { JudgingTx as Tx } from "../../services/judging/config";
import { flaggedEntryIds } from "../../services/check-in-flags";
import { createTRPCRouter, publicProcedure } from "../../trpc";
import { isUniqueViolation } from "../../middleware/db-errors";
import {
  asJudge,
  nameGuest,
  resolveDeskPrincipal,
  seatJudge,
} from "../../services/judging/principal";
import type { Judge } from "../../services/judging/principal";
import {
  assertGuestSeated,
  assertJudgingOpen,
  evaluatedChallenge,
  evaluationAccess,
  guestScope,
  judgingSwitches,
  loadChallenges,
  loadEntryInChallenge,
  loadRubric,
  reconcileDueDrafts,
  seatOf,
  writeEvaluation,
} from "../../services/judging/evaluation-store";
import { DEADLINE_GRACE_MS } from "../../services/judging/timing";
import type { ChallengeRow } from "../../services/judging/evaluation-store";
import {
  checkAnswers,
  responseVisibility,
} from "../../services/judging/evaluation";
import {
  evaluationScore,
  overallScore,
  scopedScore,
} from "../../services/judging/scoring";
import { effectiveMode, rootOf, sameLabel } from "../../services/judging/scope";
import {
  groupSections,
  isReordering,
  nextOrder,
} from "../../services/judging/deliberation";

// The judge desk, for member and guest judges: where they sit, what they
// judge, the evaluation editor, and their private deliberation shortlist.
// Every read is polled (desk 15s, announcements 30s, heartbeat 60s), so
// nothing here goes through ctx.cache, and reads start by submitting any
// drafts whose time ran out.

const NOT_A_JUDGE =
  "Judge access needed. Sign in with the account an organiser approved as a judge, or scan the QR code at your judging room or table.";

// Every desk call names its edition. A member's judge access is per edition;
// a guest's cookie only opens the edition its room belongs to.
const deskProcedure = publicProcedure
  .input(z.object({ hackathonId: z.string().uuid() }))
  .use(async ({ ctx, input, next }) => {
    const principal = await resolveDeskPrincipal(ctx.db, {
      hackathonId: input.hackathonId,
      userId: ctx.userId,
      userName: ctx.session?.user?.name,
      cookieHeader: ctx.req?.headers.get("cookie"),
    });
    if (!principal) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: NOT_A_JUDGE });
    }
    return next({ ctx: { ...ctx, principal } });
  });

/** A desk procedure for someone who can judge: a member, or a named guest. */
export const judgeProcedure = deskProcedure.use(async ({ ctx, next }) => {
  const judge = asJudge(ctx.principal);
  if (!judge) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Enter your name before you start judging.",
    });
  }
  return next({ ctx: { ...ctx, judge } });
});

const uuid = z.string().uuid();
const ratingsInput = z.record(uuid, z.number().int().min(1).max(5));
const responsesInput = z.record(
  uuid,
  z.object({
    value: z.string().max(2000, "Keep each answer under 2000 characters."),
    isPublic: z.boolean(),
  }),
);
const sectionTitle = z
  .string()
  .trim()
  .min(1, "Give the section a name.")
  .max(80, "Keep section names under 80 characters.");

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

const NOT_OPEN_YET =
  "Judging has not opened yet. You can start once organisers open it.";
const CLOSED = "Judging is closed. Your submitted evaluations are read-only.";

/** The (judge, project, challenge) an evaluation or draft is keyed by. */
function taskOf<
  T extends typeof judgingEvaluations | typeof judgingEvaluationDrafts,
>(table: T, judgeId: string, entryId: string, challengeId: string) {
  return and(
    eq(table.judgeId, judgeId),
    eq(table.entryId, entryId),
    eq(table.challengeId, challengeId),
  );
}

/** Ratings and responses per evaluation, keyed by rubric item. */
async function answersOf(db: DrizzleDB, evaluationIds: string[]) {
  const answers = new Map<
    string,
    {
      ratings: Record<string, number>;
      responses: Record<string, { value: string; isPublic: boolean }>;
    }
  >();
  if (evaluationIds.length === 0) return answers;

  const bucket = (id: string) => {
    let found = answers.get(id);
    if (!found) {
      found = { ratings: {}, responses: {} };
      answers.set(id, found);
    }
    return found;
  };

  const ratings = await db
    .select({
      evaluationId: judgingEvaluationRatings.evaluationId,
      itemId: judgingEvaluationRatings.itemId,
      value: judgingEvaluationRatings.value,
    })
    .from(judgingEvaluationRatings)
    .where(inArray(judgingEvaluationRatings.evaluationId, evaluationIds));
  for (const rating of ratings) {
    bucket(rating.evaluationId).ratings[rating.itemId] = rating.value;
  }

  const responses = await db
    .select({
      evaluationId: judgingEvaluationResponses.evaluationId,
      itemId: judgingEvaluationResponses.itemId,
      value: judgingEvaluationResponses.value,
      isPublic: judgingEvaluationResponses.isPublic,
    })
    .from(judgingEvaluationResponses)
    .where(inArray(judgingEvaluationResponses.evaluationId, evaluationIds));
  for (const response of responses) {
    bucket(response.evaluationId).responses[response.itemId] = {
      value: response.value,
      isPublic: response.isPublic,
    };
  }

  return answers;
}

const modeOf = (challenges: readonly ChallengeRow[], challenge: ChallengeRow) =>
  effectiveMode(challenges, challenge.id) ?? challenge.mode;

/** The opted-in challenges of each entry a judge may see, as tags. */
async function tagsOf(
  db: DrizzleDB,
  judge: Judge,
  challenges: readonly ChallengeRow[],
  entryIds: string[],
) {
  const tags = new Map<string, { id: string; label: string }[]>();
  if (entryIds.length === 0) return tags;

  const visible =
    judge.kind === "guest"
      ? guestScope(challenges, judge.roomChallengeId)
      : new Set(challenges.map((c) => c.id));
  const labelOf = new Map(challenges.map((c) => [c.id, c.label]));

  const rows = await db
    .select({
      entryId: judgingEntryChallenges.entryId,
      challengeId: judgingEntryChallenges.challengeId,
    })
    .from(judgingEntryChallenges)
    .where(
      and(
        inArray(judgingEntryChallenges.entryId, entryIds),
        eq(judgingEntryChallenges.isOptIn, true),
      ),
    );
  for (const row of rows) {
    if (!visible.has(row.challengeId)) continue;
    const list = tags.get(row.entryId) ?? [];
    list.push({
      id: row.challengeId,
      label: labelOf.get(row.challengeId) ?? "",
    });
    tags.set(row.entryId, list);
  }
  return tags;
}

/** The room or table a guest was let into, or the member's current seat. */
async function roomSummary(
  db: DrizzleDB,
  roomId: string,
  challenges: readonly ChallengeRow[],
) {
  const [room] = await db
    .select({
      id: judgingRooms.id,
      name: judgingRooms.name,
      kind: judgingRooms.kind,
      buildingName: judgingBuildings.name,
      challengeId: judgingRooms.challengeId,
    })
    .from(judgingRooms)
    .leftJoin(
      judgingBuildings,
      eq(judgingBuildings.id, judgingRooms.buildingId),
    )
    .where(eq(judgingRooms.id, roomId))
    .limit(1);
  if (!room) return null;
  const challenge = challenges.find((c) => c.id === room.challengeId);
  return {
    ...room,
    challengeLabel: challenge?.label ?? "",
    mode: effectiveMode(challenges, room.challengeId) ?? "scheduled",
  };
}

/** The room a judge's open presence is in, archived or not. */
async function openRoomId(db: DrizzleDB, judgeId: string) {
  const [seat] = await db
    .select({ roomId: judgingPresence.roomId })
    .from(judgingPresence)
    .where(
      and(eq(judgingPresence.judgeId, judgeId), isNull(judgingPresence.leftAt)),
    )
    .limit(1);
  return seat?.roomId ?? null;
}

/** The track a member judge asked for when they applied, or null. */
async function preferredTrackOf(
  db: DrizzleDB,
  userId: string,
  hackathonId: string,
) {
  const [row] = await db
    .select({ track: judgeAssignments.track })
    .from(judgeAssignments)
    .innerJoin(judges, eq(judges.id, judgeAssignments.judgeId))
    .where(
      and(
        eq(judges.userId, userId),
        eq(judgeAssignments.hackathonId, hackathonId),
      ),
    )
    .limit(1);
  return row?.track ?? null;
}

/** Runs a deliberation write: judging open, the judge still seated. */
function deliberationWrite<T>(
  db: DrizzleDB,
  judge: Judge,
  hackathonId: string,
  write: (tx: Tx) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await assertJudgingOpen(tx, hackathonId);
    await assertGuestSeated(tx, judge);
    return write(tx);
  });
}

async function ownedSection(tx: Tx, judgeId: string, sectionId: string) {
  const [section] = await tx
    .select({ id: judgingDeliberationSections.id })
    .from(judgingDeliberationSections)
    .where(
      and(
        eq(judgingDeliberationSections.id, sectionId),
        eq(judgingDeliberationSections.judgeId, judgeId),
      ),
    )
    .for("update")
    .limit(1);
  if (!section) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That section is gone. Reload your shortlist.",
    });
  }
  return section;
}

async function ownedRow(tx: Tx, judgeId: string, rowId: string) {
  const [row] = await tx
    .select({
      id: judgingDeliberationEntries.id,
      sectionId: judgingDeliberationEntries.sectionId,
      entryId: judgingDeliberationEntries.entryId,
    })
    .from(judgingDeliberationEntries)
    .innerJoin(
      judgingDeliberationSections,
      eq(judgingDeliberationSections.id, judgingDeliberationEntries.sectionId),
    )
    .where(
      and(
        eq(judgingDeliberationEntries.id, rowId),
        eq(judgingDeliberationSections.judgeId, judgeId),
      ),
    )
    .for("update", { of: judgingDeliberationEntries })
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That project is no longer on your shortlist. Reload it.",
    });
  }
  return row;
}

async function appendOrder(tx: Tx, sectionId: string) {
  const rows = await tx
    .select({ displayOrder: judgingDeliberationEntries.displayOrder })
    .from(judgingDeliberationEntries)
    .where(eq(judgingDeliberationEntries.sectionId, sectionId));
  return nextOrder(rows.map((row) => row.displayOrder));
}

const ALREADY_LISTED = "That project is already in this section.";

// A judge's private shortlist. Writes need judging open, like evaluations.
const deliberationRouter = createTRPCRouter({
  list: judgeProcedure.query(async ({ ctx }) => {
    const db = ctx.db;
    const sections = await db
      .select({
        id: judgingDeliberationSections.id,
        title: judgingDeliberationSections.title,
        displayOrder: judgingDeliberationSections.displayOrder,
      })
      .from(judgingDeliberationSections)
      .where(eq(judgingDeliberationSections.judgeId, ctx.judge.judgeId))
      .orderBy(
        asc(judgingDeliberationSections.displayOrder),
        asc(judgingDeliberationSections.createdAt),
      );
    if (sections.length === 0) return [];

    const rows = await db
      .select({
        id: judgingDeliberationEntries.id,
        sectionId: judgingDeliberationEntries.sectionId,
        entryId: judgingDeliberationEntries.entryId,
        note: judgingDeliberationEntries.note,
        displayOrder: judgingDeliberationEntries.displayOrder,
        title: judgingEntries.title,
        deletedAt: judgingEntries.deletedAt,
      })
      .from(judgingDeliberationEntries)
      .innerJoin(
        judgingEntries,
        eq(judgingEntries.id, judgingDeliberationEntries.entryId),
      )
      .where(
        inArray(
          judgingDeliberationEntries.sectionId,
          sections.map((section) => section.id),
        ),
      );

    return groupSections(
      sections,
      rows.map(({ deletedAt, ...row }) => ({
        ...row,
        withdrawn: deletedAt !== null,
      })),
    );
  }),

  addSection: judgeProcedure
    .input(z.object({ title: sectionTitle }))
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const existing = await tx
          .select({ displayOrder: judgingDeliberationSections.displayOrder })
          .from(judgingDeliberationSections)
          .where(eq(judgingDeliberationSections.judgeId, ctx.judge.judgeId));
        const [section] = await tx
          .insert(judgingDeliberationSections)
          .values({
            judgeId: ctx.judge.judgeId,
            title: input.title,
            displayOrder: nextOrder(existing.map((s) => s.displayOrder)),
          })
          .returning({
            id: judgingDeliberationSections.id,
            title: judgingDeliberationSections.title,
          });
        return section;
      }),
    ),

  renameSection: judgeProcedure
    .input(z.object({ sectionId: uuid, title: sectionTitle }))
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const section = await ownedSection(
          tx,
          ctx.judge.judgeId,
          input.sectionId,
        );
        await tx
          .update(judgingDeliberationSections)
          .set({ title: input.title })
          .where(eq(judgingDeliberationSections.id, section.id));
        return { id: section.id, title: input.title };
      }),
    ),

  // Takes the section's projects and notes with it.
  removeSection: judgeProcedure
    .input(z.object({ sectionId: uuid }))
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const section = await ownedSection(
          tx,
          ctx.judge.judgeId,
          input.sectionId,
        );
        await tx
          .delete(judgingDeliberationSections)
          .where(eq(judgingDeliberationSections.id, section.id));
        return { removed: true };
      }),
    ),

  reorderSections: judgeProcedure
    .input(z.object({ sectionIds: z.array(uuid).max(200) }))
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const sections = await tx
          .select({ id: judgingDeliberationSections.id })
          .from(judgingDeliberationSections)
          .where(eq(judgingDeliberationSections.judgeId, ctx.judge.judgeId))
          .for("update");
        if (
          !isReordering(
            sections.map((s) => s.id),
            input.sectionIds,
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Your sections changed in another window. Reload, then reorder again.",
          });
        }
        for (const [index, id] of input.sectionIds.entries()) {
          await tx
            .update(judgingDeliberationSections)
            .set({ displayOrder: index })
            .where(eq(judgingDeliberationSections.id, id));
        }
        return { reordered: true };
      }),
    ),

  // Only a project the judge has finished: a shortlist ranks what they saw.
  add: judgeProcedure
    .input(
      z.object({
        sectionId: uuid,
        entryId: uuid,
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const section = await ownedSection(
          tx,
          ctx.judge.judgeId,
          input.sectionId,
        );
        const [finished] = await tx
          .select({ id: judgingEvaluations.id })
          .from(judgingEvaluations)
          .innerJoin(
            judgingEntries,
            eq(judgingEntries.id, judgingEvaluations.entryId),
          )
          .where(
            and(
              eq(judgingEvaluations.judgeId, ctx.judge.judgeId),
              eq(judgingEvaluations.entryId, input.entryId),
              eq(judgingEvaluations.isComplete, true),
              isNull(judgingEntries.deletedAt),
            ),
          )
          .limit(1);
        if (!finished) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Finish judging this project before you add it to your shortlist.",
          });
        }

        const [row] = await tx
          .insert(judgingDeliberationEntries)
          .values({
            sectionId: section.id,
            entryId: input.entryId,
            note: input.note?.trim() ?? "",
            displayOrder: await appendOrder(tx, section.id),
          })
          .onConflictDoNothing({
            target: [
              judgingDeliberationEntries.sectionId,
              judgingDeliberationEntries.entryId,
            ],
          })
          .returning({ id: judgingDeliberationEntries.id });
        if (!row) {
          throw new TRPCError({ code: "CONFLICT", message: ALREADY_LISTED });
        }
        return row;
      }),
    ),

  remove: judgeProcedure
    .input(z.object({ rowId: uuid }))
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const row = await ownedRow(tx, ctx.judge.judgeId, input.rowId);
        await tx
          .delete(judgingDeliberationEntries)
          .where(eq(judgingDeliberationEntries.id, row.id));
        return { removed: true };
      }),
    ),

  // To the end of another section, note and all.
  move: judgeProcedure
    .input(z.object({ rowId: uuid, sectionId: uuid }))
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const row = await ownedRow(tx, ctx.judge.judgeId, input.rowId);
        if (row.sectionId === input.sectionId) return { moved: false };
        const target = await ownedSection(
          tx,
          ctx.judge.judgeId,
          input.sectionId,
        );
        const [clash] = await tx
          .select({ id: judgingDeliberationEntries.id })
          .from(judgingDeliberationEntries)
          .where(
            and(
              eq(judgingDeliberationEntries.sectionId, target.id),
              eq(judgingDeliberationEntries.entryId, row.entryId),
            ),
          )
          .limit(1);
        if (clash) {
          throw new TRPCError({ code: "CONFLICT", message: ALREADY_LISTED });
        }
        await tx
          .update(judgingDeliberationEntries)
          .set({
            sectionId: target.id,
            displayOrder: await appendOrder(tx, target.id),
          })
          .where(eq(judgingDeliberationEntries.id, row.id));
        return { moved: true };
      }),
    ),

  reorder: judgeProcedure
    .input(z.object({ sectionId: uuid, rowIds: z.array(uuid).max(1000) }))
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const section = await ownedSection(
          tx,
          ctx.judge.judgeId,
          input.sectionId,
        );
        const rows = await tx
          .select({ id: judgingDeliberationEntries.id })
          .from(judgingDeliberationEntries)
          .where(eq(judgingDeliberationEntries.sectionId, section.id))
          .for("update");
        if (
          !isReordering(
            rows.map((row) => row.id),
            input.rowIds,
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This section changed in another window. Reload, then reorder again.",
          });
        }
        for (const [index, id] of input.rowIds.entries()) {
          await tx
            .update(judgingDeliberationEntries)
            .set({ displayOrder: index })
            .where(eq(judgingDeliberationEntries.id, id));
        }
        return { reordered: true };
      }),
    ),

  setNote: judgeProcedure
    .input(
      z.object({
        rowId: uuid,
        note: z.string().max(2000, "Keep notes under 2000 characters."),
      }),
    )
    .mutation(({ ctx, input }) =>
      deliberationWrite(ctx.db, ctx.judge, input.hackathonId, async (tx) => {
        const row = await ownedRow(tx, ctx.judge.judgeId, input.rowId);
        await tx
          .update(judgingDeliberationEntries)
          .set({ note: input.note })
          .where(eq(judgingDeliberationEntries.id, row.id));
        return { id: row.id, note: input.note };
      }),
    ),
});

export const judgingDeskRouter = createTRPCRouter({
  // Who is at the desk, which edition, which room, and where judging stands.
  // A guest who has not given a name yet gets `needsName` and little else.
  context: deskProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    const { principal } = ctx;
    const judge = asJudge(principal);
    if (judge) await reconcileDueDrafts(db, input.hackathonId);

    const [hackathon] = await db
      .select({ id: hackathons.id, name: hackathons.name })
      .from(hackathons)
      .where(eq(hackathons.id, input.hackathonId))
      .limit(1);
    if (!hackathon) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message:
          "That hackathon does not exist. Open the desk from the judging page.",
      });
    }

    const challenges = await loadChallenges(db, input.hackathonId);
    const switches = await judgingSwitches(db, input.hackathonId);
    const seat = judge ? await seatOf(db, judge.judgeId, challenges) : null;
    const roomId =
      principal.kind === "guest" ? principal.roomId : (seat?.roomId ?? null);
    const visible =
      principal.kind === "guest"
        ? guestScope(challenges, principal.roomChallengeId)
        : null;

    return {
      kind: principal.kind,
      needsName: !judge,
      judge: judge
        ? { id: judge.judgeId, displayName: judge.displayName }
        : null,
      hackathon,
      state: switches.state,
      showAllScores: principal.kind === "member" && switches.showAllScores,
      room: roomId ? await roomSummary(db, roomId, challenges) : null,
      challenges: challenges
        .filter((c) => !visible || visible.has(c.id))
        .map((c) => ({
          id: c.id,
          label: c.label,
          parentId: c.parentId,
          isGeneral: c.isGeneral,
          isGroup: c.isGroup,
          mode: modeOf(challenges, c),
        })),
      serverNow: new Date(),
    };
  }),

  // The guest name gate. Creates the guest's judge row and seats them in the
  // room their QR code opened.
  setGuestName: deskProcedure
    .input(
      z.object({
        displayName: z
          .string()
          .trim()
          .min(1, "Enter your name.")
          .max(80, "Keep your name under 80 characters."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.principal.kind !== "guest") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You are signed in as a judge, so there is no guest name to set.",
        });
      }
      return nameGuest(
        ctx.db,
        ctx.principal,
        input.displayName.replace(/\s+/g, " "),
      );
    }),

  // Open rooms and tables to sit at. A guest sees only their own.
  rooms: judgeProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    const challenges = await loadChallenges(db, input.hackathonId);
    const seat = await seatOf(db, ctx.judge.judgeId, challenges);
    const track =
      ctx.judge.kind === "member"
        ? await preferredTrackOf(db, ctx.judge.userId, input.hackathonId)
        : null;
    const rows = await db
      .select({
        id: judgingRooms.id,
        name: judgingRooms.name,
        kind: judgingRooms.kind,
        buildingName: judgingBuildings.name,
        challengeId: judgingRooms.challengeId,
      })
      .from(judgingRooms)
      .leftJoin(
        judgingBuildings,
        eq(judgingBuildings.id, judgingRooms.buildingId),
      )
      .where(
        and(
          eq(judgingRooms.hackathonId, input.hackathonId),
          isNull(judgingRooms.archivedAt),
          ctx.judge.kind === "guest"
            ? eq(judgingRooms.id, ctx.judge.roomId)
            : undefined,
        ),
      )
      .orderBy(asc(judgingRooms.displayOrder), asc(judgingRooms.name));
    const labelOf = new Map(challenges.map((c) => [c.id, c.label]));

    return {
      currentRoomId: seat?.roomId ?? null,
      rooms: rows.map((room) => ({
        ...room,
        challengeLabel: labelOf.get(room.challengeId) ?? "",
        mode: effectiveMode(challenges, room.challengeId) ?? "scheduled",
        // The room serves the track the judge applied for, by its challenge
        // or the group that challenge sits in.
        yourTrack:
          !!track &&
          [
            labelOf.get(room.challengeId),
            rootOf(challenges, room.challengeId)?.label,
          ].some((label) => !!label && sameLabel(label, track)),
      })),
    };
  }),

  joinRoom: judgeProcedure
    .input(z.object({ roomId: uuid }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.judge.kind !== "member") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Guest judges stay at the room or table their QR code opened.",
        });
      }
      const [room] = await ctx.db
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
          code: "NOT_FOUND",
          message:
            "That room or table is not open for judging. Pick another from the list.",
        });
      }
      const judgeId = ctx.judge.judgeId;
      await ctx.db.transaction((tx) =>
        seatJudge(tx, {
          judgeId,
          roomId: room.id,
          hackathonId: input.hackathonId,
        }),
      );
      return { roomId: room.id };
    }),

  leaveRoom: judgeProcedure.mutation(async ({ ctx }) => {
    if (ctx.judge.kind !== "member") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Guest judges stay at the room or table their QR code opened.",
      });
    }
    const closed = await ctx.db
      .update(judgingPresence)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(judgingPresence.judgeId, ctx.judge.judgeId),
          isNull(judgingPresence.leftAt),
        ),
      )
      .returning({ id: judgingPresence.id });
    return { left: closed.length > 0 };
  }),

  // Tells organisers the judge is still in the room (polled every 60s).
  heartbeat: judgeProcedure.mutation(async ({ ctx }) => {
    const [seat] = await ctx.db
      .update(judgingPresence)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(judgingPresence.judgeId, ctx.judge.judgeId),
          isNull(judgingPresence.leftAt),
        ),
      )
      .returning({ roomId: judgingPresence.roomId });
    return { roomId: seat?.roomId ?? null };
  }),

  // The edition-wide message and the judge's room's, global first. Guests see
  // only messages organisers marked for them.
  announcements: judgeProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    const roomId =
      ctx.judge.kind === "guest"
        ? ctx.judge.roomId
        : await openRoomId(db, ctx.judge.judgeId);

    const rows = await db
      .select({
        id: judgingAnnouncements.id,
        message: judgingAnnouncements.message,
        isUrgent: judgingAnnouncements.isUrgent,
        roomId: judgingAnnouncements.roomId,
        roomName: judgingRooms.name,
        createdAt: judgingAnnouncements.createdAt,
      })
      .from(judgingAnnouncements)
      .leftJoin(judgingRooms, eq(judgingRooms.id, judgingAnnouncements.roomId))
      .where(
        and(
          eq(judgingAnnouncements.hackathonId, input.hackathonId),
          isNull(judgingAnnouncements.clearedAt),
          roomId
            ? or(
                isNull(judgingAnnouncements.roomId),
                eq(judgingAnnouncements.roomId, roomId),
              )
            : isNull(judgingAnnouncements.roomId),
          ctx.judge.kind === "guest"
            ? eq(judgingAnnouncements.includeGuests, true)
            : undefined,
        ),
      )
      .orderBy(asc(judgingAnnouncements.createdAt));

    return rows.sort(
      (a, b) => Number(a.roomId !== null) - Number(b.roomId !== null),
    );
  }),

  // The projects to judge for one challenge. By default: in presentation
  // order, only those presenting in the judge's room, not yet judged by them.
  projects: judgeProcedure
    .input(
      z.object({
        challengeId: uuid.optional(),
        search: z.string().trim().max(100).optional(),
        hideJudged: z.boolean().default(true),
        inMyRoomOnly: z.boolean().default(true),
        sort: z.enum(["scheduled", "title"]).default("scheduled"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const seat = await seatOf(db, judge.judgeId, challenges);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        seat,
      );
      const mode = modeOf(challenges, challenge);
      const [schedule] = await db
        .select({ id: judgingSchedules.id })
        .from(judgingSchedules)
        .where(eq(judgingSchedules.hackathonId, input.hackathonId))
        .limit(1);

      // Why the room filter is or is not applied, so the desk can say so.
      const roomFilter = !input.inMyRoomOnly
        ? ("off" as const)
        : !schedule || mode !== "scheduled"
          ? ("untimed" as const)
          : !seat || seat.challengeId !== challenge.id
            ? ("no-room" as const)
            : ("applied" as const);

      const entries = await db
        .select({
          id: judgingEntries.id,
          title: judgingEntries.title,
          participantCount: judgingEntries.participantCount,
        })
        .from(judgingEntries)
        .innerJoin(
          judgingEntryChallenges,
          and(
            eq(judgingEntryChallenges.entryId, judgingEntries.id),
            eq(
              judgingEntryChallenges.challengeId,
              input.challengeId ?? challenge.id,
            ),
          ),
        )
        .where(
          and(
            eq(judgingEntries.hackathonId, input.hackathonId),
            isNull(judgingEntries.deletedAt),
            input.search
              ? ilike(judgingEntries.title, `%${escapeLike(input.search)}%`)
              : undefined,
          ),
        );

      const base = {
        challenge: {
          id: challenge.id,
          label: challenge.label,
          mode,
        },
        roomFilter,
        serverNow: new Date(),
      };
      if (entries.length === 0) {
        return { ...base, judgedCount: 0, projects: [] };
      }
      const entryIds = entries.map((entry) => entry.id);

      const presentations = schedule
        ? await db
            .select({
              id: judgingAppointments.id,
              entryId: judgingAppointments.entryId,
              roomId: judgingAppointments.roomId,
              roomName: judgingRooms.name,
              buildingName: judgingBuildings.name,
              startsAt: judgingAppointments.startsAt,
              deadlineAt: judgingAppointments.deadlineAt,
              endsAt: judgingAppointments.endsAt,
            })
            .from(judgingAppointments)
            .innerJoin(
              judgingRooms,
              eq(judgingRooms.id, judgingAppointments.roomId),
            )
            .leftJoin(
              judgingBuildings,
              eq(judgingBuildings.id, judgingRooms.buildingId),
            )
            .where(
              and(
                eq(judgingAppointments.scheduleId, schedule.id),
                eq(judgingAppointments.challengeId, challenge.id),
                inArray(judgingAppointments.entryId, entryIds),
              ),
            )
        : [];
      const mine = await db
        .select({
          entryId: judgingEvaluations.entryId,
          revision: judgingEvaluations.revision,
          isComplete: judgingEvaluations.isComplete,
        })
        .from(judgingEvaluations)
        .where(
          and(
            eq(judgingEvaluations.judgeId, judge.judgeId),
            eq(judgingEvaluations.challengeId, challenge.id),
            inArray(judgingEvaluations.entryId, entryIds),
          ),
        );
      const drafts = await db
        .select({ entryId: judgingEvaluationDrafts.entryId })
        .from(judgingEvaluationDrafts)
        .where(
          and(
            eq(judgingEvaluationDrafts.judgeId, judge.judgeId),
            eq(judgingEvaluationDrafts.challengeId, challenge.id),
            inArray(judgingEvaluationDrafts.entryId, entryIds),
          ),
        );
      const tags = await tagsOf(db, judge, challenges, entryIds);
      // One yes or no per project and nothing else. Who was flagged and why
      // is for organisers; this list is polled by every judge, guests included.
      const flagged = await flaggedEntryIds(db, input.hackathonId, entryIds);

      const presentationOf = new Map(presentations.map((p) => [p.entryId, p]));
      const evaluationOf = new Map(mine.map((e) => [e.entryId, e]));
      const drafted = new Set(drafts.map((d) => d.entryId));

      const inView = entries.filter(
        (entry) =>
          !(
            roomFilter === "applied" &&
            presentationOf.get(entry.id)?.roomId !== seat?.roomId
          ),
      );
      // An incomplete evaluation (time ran out on it) still has work to do, so
      // only finished ones are hidden.
      const judgedCount = inView.filter(
        (entry) => evaluationOf.get(entry.id)?.isComplete,
      ).length;

      const projects = inView
        .filter(
          (entry) =>
            !(input.hideJudged && evaluationOf.get(entry.id)?.isComplete),
        )
        .map((entry) => {
          const presentation = presentationOf.get(entry.id);
          const evaluation = evaluationOf.get(entry.id);
          return {
            ...entry,
            challenges: tags.get(entry.id) ?? [],
            flagged: flagged.has(entry.id),
            presentation: presentation
              ? {
                  id: presentation.id,
                  roomId: presentation.roomId,
                  roomName: presentation.roomName,
                  buildingName: presentation.buildingName,
                  startsAt: presentation.startsAt,
                  deadlineAt: presentation.deadlineAt,
                  endsAt: presentation.endsAt,
                }
              : null,
            myEvaluation: evaluation
              ? {
                  revision: evaluation.revision,
                  isComplete: evaluation.isComplete,
                }
              : null,
            hasDraft: drafted.has(entry.id),
          };
        });

      const byTitle = (a: { title: string }, b: { title: string }) =>
        a.title.localeCompare(b.title);
      projects.sort((a, b) => {
        if (input.sort === "scheduled") {
          const at = a.presentation?.startsAt.getTime() ?? Infinity;
          const bt = b.presentation?.startsAt.getTime() ?? Infinity;
          if (at !== bt) return at - bt;
        }
        return byTitle(a, b);
      });

      return { ...base, judgedCount, projects };
    }),

  // One project as the evaluation editor needs it: the project (names only
  // for the team), the rubric, the judge's draft or evaluation, whether they
  // can write now and against what deadline, and scores once they may see
  // them.
  project: judgeProcedure
    .input(z.object({ entryId: uuid, challengeId: uuid.optional() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const seat = await seatOf(db, judge.judgeId, challenges);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        seat,
      );
      const entry = await loadEntryInChallenge(db, {
        hackathonId: input.hackathonId,
        entryId: input.entryId,
        challenge,
      });

      const members = await db
        .select({ name: judgingEntryMembers.name })
        .from(judgingEntryMembers)
        .where(eq(judgingEntryMembers.entryId, entry.id))
        .orderBy(
          asc(judgingEntryMembers.displayOrder),
          asc(judgingEntryMembers.createdAt),
        );
      const tags = await tagsOf(db, judge, challenges, [entry.id]);
      // A bare marker, as in the project list: never who or why.
      const flagged = await flaggedEntryIds(db, input.hackathonId, [entry.id]);
      const rubric = await loadRubric(db, input.hackathonId);
      const switches = await judgingSwitches(db, input.hackathonId);

      const [evaluation] = await db
        .select({
          id: judgingEvaluations.id,
          revision: judgingEvaluations.revision,
          isComplete: judgingEvaluations.isComplete,
          appointmentId: judgingEvaluations.appointmentId,
          submittedAt: judgingEvaluations.submittedAt,
          autoSubmittedAt: judgingEvaluations.autoSubmittedAt,
          updatedAt: judgingEvaluations.updatedAt,
        })
        .from(judgingEvaluations)
        .where(
          taskOf(judgingEvaluations, judge.judgeId, entry.id, challenge.id),
        )
        .limit(1);
      const [draft] = await db
        .select({
          ratings: judgingEvaluationDrafts.ratings,
          responses: judgingEvaluationDrafts.responses,
          revision: judgingEvaluationDrafts.revision,
          deadlineAt: judgingEvaluationDrafts.deadlineAt,
          updatedAt: judgingEvaluationDrafts.updatedAt,
        })
        .from(judgingEvaluationDrafts)
        .where(
          taskOf(
            judgingEvaluationDrafts,
            judge.judgeId,
            entry.id,
            challenge.id,
          ),
        )
        .limit(1);

      const { timing, presentation } = await evaluationAccess(db, {
        hackathonId: input.hackathonId,
        judgeId: judge.judgeId,
        entryId: entry.id,
        challenge,
        challenges,
        evaluation: evaluation ?? null,
      });
      const presentationRoom = presentation
        ? await roomSummary(db, presentation.roomId, challenges)
        : null;

      // A judge sees how a project is scoring once they have judged it
      // themselves, or (members only) when organisers show every score.
      // Guests never see the overall score across challenges.
      const scoresVisible =
        !!evaluation || (judge.kind === "member" && switches.showAllScores);
      let scores: {
        challenge: ReturnType<typeof scopedScore>;
        overall: ReturnType<typeof overallScore> | null;
      } | null = null;
      if (scoresVisible) {
        const complete = await db
          .select({
            id: judgingEvaluations.id,
            challengeId: judgingEvaluations.challengeId,
          })
          .from(judgingEvaluations)
          .where(
            and(
              eq(judgingEvaluations.entryId, entry.id),
              eq(judgingEvaluations.isComplete, true),
            ),
          );
        const answers = await answersOf(
          db,
          complete.map((e) => e.id),
        );
        const scored = complete.map((e) => ({
          challengeId: e.challengeId,
          isComplete: true,
          ratings: Object.values(answers.get(e.id)?.ratings ?? {}),
        }));
        scores = {
          challenge: scopedScore(scored, challenge.id),
          overall: judge.kind === "member" ? overallScore(scored) : null,
        };
      }

      const mine = evaluation
        ? (await answersOf(db, [evaluation.id])).get(evaluation.id)
        : undefined;
      const open = switches.state === "open";

      return {
        entry: {
          ...entry,
          members: members.map((member) => member.name),
          challenges: tags.get(entry.id) ?? [],
          flagged: flagged.has(entry.id),
        },
        challenge: {
          id: challenge.id,
          label: challenge.label,
          mode: modeOf(challenges, challenge),
        },
        rubric: rubric.map((item) => ({
          id: item.id,
          kind: item.kind,
          label: item.label,
          description: item.description,
          required: item.kind === "rating" || item.required,
          // Who will read this judge's answer: the team, the judge's choice,
          // or organisers only.
          visibility:
            item.kind === "response"
              ? responseVisibility(item, judge.kind)
              : null,
        })),
        evaluation: evaluation
          ? {
              id: evaluation.id,
              revision: evaluation.revision,
              isComplete: evaluation.isComplete,
              submittedAt: evaluation.submittedAt,
              autoSubmittedAt: evaluation.autoSubmittedAt,
              updatedAt: evaluation.updatedAt,
              ratings: mine?.ratings ?? {},
              responses: mine?.responses ?? {},
              score: evaluation.isComplete
                ? evaluationScore(Object.values(mine?.ratings ?? {}))
                : null,
            }
          : null,
        draft: draft ?? null,
        access: {
          judgingState: switches.state,
          canEdit: open && timing.canEdit,
          reason: !open
            ? switches.state === "closed"
              ? CLOSED
              : NOT_OPEN_YET
            : timing.canEdit
              ? null
              : timing.reason,
          deadlineAt: timing.canEdit ? timing.deadlineAt : null,
          opensAt: timing.canEdit ? null : timing.opensAt,
          // Shut because the presentation's deadline passed: scores are final.
          ended: open && !timing.canEdit && timing.ended,
          // Shut only because the judge is not in the room that serves this
          // challenge: a slot exists and has no start to wait for.
          needsRoom:
            open &&
            !timing.canEdit &&
            !timing.opensAt &&
            !timing.ended &&
            presentation !== null,
        },
        presentation:
          presentation && presentationRoom
            ? {
                startsAt: presentation.startsAt,
                deadlineAt: presentation.deadlineAt,
                endsAt: presentation.endsAt,
                roomName: presentationRoom.name,
                buildingName: presentationRoom.buildingName,
              }
            : null,
        scores,
        serverNow: new Date(),
      };
    }),

  // Autosave. `revision` is the draft revision the editor last saw (0 for
  // none); a save from a stale window is refused rather than overwriting.
  // The draft takes the presentation's deadline, and is submitted for the
  // judge when it passes.
  saveDraft: judgeProcedure
    .input(
      z.object({
        entryId: uuid,
        challengeId: uuid,
        ratings: ratingsInput,
        responses: responsesInput,
        revision: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        null,
      );
      const rubric = await loadRubric(db, input.hackathonId);
      const check = checkAnswers(rubric, input, judge.kind, "strict");
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
      }

      try {
        return await db.transaction(async (tx) => {
          await assertJudgingOpen(tx, input.hackathonId);
          await assertGuestSeated(tx, judge);
          await loadEntryInChallenge(tx, {
            hackathonId: input.hackathonId,
            entryId: input.entryId,
            challenge,
          });

          const [draft] = await tx
            .select({
              id: judgingEvaluationDrafts.id,
              revision: judgingEvaluationDrafts.revision,
              deadlineAt: judgingEvaluationDrafts.deadlineAt,
            })
            .from(judgingEvaluationDrafts)
            .where(
              taskOf(
                judgingEvaluationDrafts,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .for("update")
            .limit(1);
          const [evaluation] = await tx
            .select({ appointmentId: judgingEvaluations.appointmentId })
            .from(judgingEvaluations)
            .where(
              taskOf(
                judgingEvaluations,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .limit(1);

          if ((draft?.revision ?? 0) !== input.revision) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                evaluation && !draft
                  ? "Time ran out, so your saved answers were submitted for you. Reload to see them."
                  : "Your answers changed in another window. Reload to pick up the latest before you keep going.",
            });
          }

          const { timing } = await evaluationAccess(tx, {
            hackathonId: input.hackathonId,
            judgeId: judge.judgeId,
            entryId: input.entryId,
            challenge,
            challenges,
            evaluation: evaluation ?? null,
            graceMs: DEADLINE_GRACE_MS,
          });
          if (!timing.canEdit) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: timing.reason,
            });
          }

          const now = new Date();
          const values = {
            ratings: input.ratings,
            responses: input.responses,
            appointmentId: timing.appointmentId,
            // Editing a submitted evaluation is never timed.
            deadlineAt: evaluation
              ? null
              : (timing.deadlineAt ?? draft?.deadlineAt ?? null),
            revision: input.revision + 1,
            updatedAt: now,
          };
          if (draft) {
            await tx
              .update(judgingEvaluationDrafts)
              .set(values)
              .where(eq(judgingEvaluationDrafts.id, draft.id));
          } else {
            await tx.insert(judgingEvaluationDrafts).values({
              hackathonId: input.hackathonId,
              judgeId: judge.judgeId,
              entryId: input.entryId,
              challengeId: challenge.id,
              ...values,
            });
          }

          return {
            revision: values.revision,
            deadlineAt: values.deadlineAt,
            savedAt: now,
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Your answers were saved from another window at the same moment. Reload to pick up the latest.",
          });
        }
        throw error;
      }
    }),

  // Submits an evaluation, or a new revision of one. `expectedRevision` is
  // the revision the editor shows (0 for a first submission). Every rating and
  // every required response must be answered; only a draft whose time ran out
  // is ever submitted incomplete, and not through here.
  submit: judgeProcedure
    .input(
      z.object({
        entryId: uuid,
        challengeId: uuid,
        ratings: ratingsInput,
        responses: responsesInput,
        expectedRevision: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const { judge } = ctx;
      await reconcileDueDrafts(db, input.hackathonId);

      const challenges = await loadChallenges(db, input.hackathonId);
      const challenge = evaluatedChallenge(
        judge,
        challenges,
        input.challengeId,
        null,
      );
      const rubric = await loadRubric(db, input.hackathonId);
      const check = checkAnswers(rubric, input, judge.kind, "strict");
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
      }
      if (!check.answers.isComplete) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Answer everything before you submit. Still to do: ${check.answers.missing.join(", ")}.`,
        });
      }

      try {
        return await db.transaction(async (tx) => {
          await assertJudgingOpen(tx, input.hackathonId);
          await assertGuestSeated(tx, judge);
          await loadEntryInChallenge(tx, {
            hackathonId: input.hackathonId,
            entryId: input.entryId,
            challenge,
          });

          // The draft first: a deadline submission holding it finishes
          // before this reads the evaluation, and then sees the result.
          await tx
            .select({ id: judgingEvaluationDrafts.id })
            .from(judgingEvaluationDrafts)
            .where(
              taskOf(
                judgingEvaluationDrafts,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .for("update");
          const [existing] = await tx
            .select({
              id: judgingEvaluations.id,
              revision: judgingEvaluations.revision,
              appointmentId: judgingEvaluations.appointmentId,
              autoSubmittedAt: judgingEvaluations.autoSubmittedAt,
            })
            .from(judgingEvaluations)
            .where(
              taskOf(
                judgingEvaluations,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            )
            .for("update")
            .limit(1);

          if ((existing?.revision ?? 0) !== input.expectedRevision) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                existing?.autoSubmittedAt && input.expectedRevision === 0
                  ? "Time ran out, so your saved answers were submitted for you. Reload to see them."
                  : "This evaluation changed in another window. Reload to see the latest before you submit.",
            });
          }

          const { timing } = await evaluationAccess(tx, {
            hackathonId: input.hackathonId,
            judgeId: judge.judgeId,
            entryId: input.entryId,
            challenge,
            challenges,
            evaluation: existing ?? null,
            graceMs: DEADLINE_GRACE_MS,
          });
          if (!timing.canEdit) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: timing.reason,
            });
          }

          const written = await writeEvaluation(tx, {
            hackathonId: input.hackathonId,
            judgeId: judge.judgeId,
            entryId: input.entryId,
            challengeId: challenge.id,
            appointmentId: existing
              ? existing.appointmentId
              : timing.appointmentId,
            answers: check.answers,
            existing: existing ?? null,
            at: new Date(),
            auto: false,
          });
          await tx
            .delete(judgingEvaluationDrafts)
            .where(
              taskOf(
                judgingEvaluationDrafts,
                judge.judgeId,
                input.entryId,
                challenge.id,
              ),
            );

          return {
            ...written,
            isComplete: true,
            score: evaluationScore(check.answers.ratings.map((r) => r.value)),
          };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This evaluation was just submitted from another window. Reload to see it.",
          });
        }
        throw error;
      }
    }),

  // Everything this judge has submitted in the edition, newest first.
  myEvaluations: judgeProcedure.query(async ({ ctx, input }) => {
    const db = ctx.db;
    await reconcileDueDrafts(db, input.hackathonId);

    const rows = await db
      .select({
        id: judgingEvaluations.id,
        entryId: judgingEvaluations.entryId,
        challengeId: judgingEvaluations.challengeId,
        challengeLabel: judgingChallenges.label,
        title: judgingEntries.title,
        deletedAt: judgingEntries.deletedAt,
        revision: judgingEvaluations.revision,
        isComplete: judgingEvaluations.isComplete,
        submittedAt: judgingEvaluations.submittedAt,
        autoSubmittedAt: judgingEvaluations.autoSubmittedAt,
        updatedAt: judgingEvaluations.updatedAt,
      })
      .from(judgingEvaluations)
      .innerJoin(
        judgingEntries,
        eq(judgingEntries.id, judgingEvaluations.entryId),
      )
      .innerJoin(
        judgingChallenges,
        eq(judgingChallenges.id, judgingEvaluations.challengeId),
      )
      .where(
        and(
          eq(judgingEvaluations.judgeId, ctx.judge.judgeId),
          eq(judgingEvaluations.hackathonId, input.hackathonId),
        ),
      )
      .orderBy(desc(judgingEvaluations.updatedAt));

    const answers = await answersOf(
      db,
      rows.map((row) => row.id),
    );
    return rows.map(({ deletedAt, ...row }) => {
      const mine = answers.get(row.id) ?? { ratings: {}, responses: {} };
      return {
        ...row,
        withdrawn: deletedAt !== null,
        ratings: mine.ratings,
        responses: mine.responses,
        score: row.isComplete
          ? evaluationScore(Object.values(mine.ratings))
          : null,
      };
    });
  }),

  deliberation: deliberationRouter,
});
