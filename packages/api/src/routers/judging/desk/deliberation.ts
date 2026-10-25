// A judge's private shortlist: sections of projects with notes.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  judgingDeliberationEntries,
  judgingDeliberationSections,
  judgingEntries,
  judgingEvaluations,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import type { JudgingTx as Tx } from "../../../services/judging/config";
import { createTRPCRouter } from "../../../trpc";
import type { Judge } from "../../../services/judging/principal";
import {
  assertGuestSeated,
  assertJudgingOpen,
} from "../../../services/judging/evaluation-store";
import { holdsEveryRating } from "../../../services/judging/scoring-sql";
import {
  groupSections,
  isReordering,
  nextOrder,
} from "../../../services/judging/deliberation";
import { judgeProcedure, uuid, sectionTitle } from "./shared";

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
export const deliberationRouter = createTRPCRouter({
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
  // Finished is what placings count: every rating in, written response or not.
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
              holdsEveryRating(input.hackathonId),
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
