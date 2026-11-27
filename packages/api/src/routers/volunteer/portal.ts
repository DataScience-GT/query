import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { hackathonVolunteerApplications as applications } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { notHackathonBanned } from "../../middleware/procedures";
import {
  assertEditionNotOver,
  assertTakingApplications,
  volunteerAnswers,
} from "../../services/volunteer";

const hackathonInput = z.object({ hackathonId: z.string().uuid() });
const submitInput = hackathonInput.extend({ answers: volunteerAnswers });

// The volunteer's own side: apply, correct a pending application, step back.
// Deciding is organisers' (admin.ts). Judging has its own application in
// routers/judge: a volunteer runs the weekend and does not score projects.
export const volunteerPortalRouter = createTRPCRouter({
  // The caller's application for one edition, or null. The review columns stay
  // off: who decided is the organisers' business.
  myApplication: protectedProcedure
    .input(hackathonInput)
    .query(async ({ ctx, input }) => {
      const row = await (ctx.db as DrizzleDB).query.hackathonVolunteerApplications.findFirst(
        {
          where: {
            userId: ctx.userId as string,
            hackathonId: input.hackathonId,
          },
          columns: {
            id: true,
            status: true,
            answers: true,
            reviewedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      );
      return row ?? null;
    }),

  // Applies, or applies again after withdrawing. A declined or approved
  // application is not reopened here: those are organisers' decisions.
  submit: notHackathonBanned
    .input(submitInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId as string;
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        const db = tx as unknown as DrizzleDB;
        await assertTakingApplications(db, input.hackathonId);

        const [created] = await tx
          .insert(applications)
          .values({
            userId,
            hackathonId: input.hackathonId,
            answers: input.answers,
          })
          // The unique (user, edition) index decides a double submit: the
          // second finds the row the first wrote.
          .onConflictDoNothing()
          .returning({ id: applications.id });
        if (created) return { status: "pending" as const };

        // Only a withdrawn application can start over; the update is
        // conditional so a decision made a moment ago is never overwritten.
        const [reopened] = await tx
          .update(applications)
          .set({
            status: "pending",
            answers: input.answers,
            reviewedById: null,
            reviewedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(applications.userId, userId),
              eq(applications.hackathonId, input.hackathonId),
              eq(applications.status, "withdrawn"),
            ),
          )
          .returning({ id: applications.id });
        if (reopened) return { status: "pending" as const };

        throw new TRPCError({
          code: "CONFLICT",
          message: "You have already applied to volunteer at this hackathon.",
        });
      });
    }),

  // Corrects the answers of a pending application. Status is deliberately not
  // touched: only an organiser moves it, and once they have, the answers they
  // read are the answers that stand.
  update: notHackathonBanned
    .input(submitInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await assertEditionNotOver(db, input.hackathonId);

      const [updated] = await db
        .update(applications)
        .set({ answers: input.answers, updatedAt: new Date() })
        .where(
          and(
            eq(applications.userId, ctx.userId as string),
            eq(applications.hackathonId, input.hackathonId),
            eq(applications.status, "pending"),
          ),
        )
        .returning({ id: applications.id });
      if (updated) return { success: true };

      const existing = await db.query.hackathonVolunteerApplications.findFirst({
        where: { userId: ctx.userId as string, hackathonId: input.hackathonId },
        columns: { status: true },
      });
      throw new TRPCError(
        existing
          ? {
              code: "BAD_REQUEST",
              message:
                "Only a pending application can be edited. Contact an organizer to change a decided one.",
            }
          : {
              code: "NOT_FOUND",
              message: "You have not applied to volunteer at this hackathon.",
            },
      );
    }),

  // Steps back from a pending or approved application. Not behind the ban
  // check: a way out stays open. A declined application has nothing to
  // withdraw.
  withdraw: protectedProcedure
    .input(hackathonInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const [withdrawn] = await db
        .update(applications)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(
          and(
            eq(applications.userId, ctx.userId as string),
            eq(applications.hackathonId, input.hackathonId),
            inArray(applications.status, ["pending", "approved"]),
          ),
        )
        .returning({ id: applications.id });
      if (withdrawn) return { success: true };

      const existing = await db.query.hackathonVolunteerApplications.findFirst({
        where: { userId: ctx.userId as string, hackathonId: input.hackathonId },
        columns: { status: true },
      });
      throw new TRPCError(
        existing
          ? {
              code: "BAD_REQUEST",
              message: `This application is already ${existing.status}.`,
            }
          : {
              code: "NOT_FOUND",
              message: "You have not applied to volunteer at this hackathon.",
            },
      );
    }),
});
