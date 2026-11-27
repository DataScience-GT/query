import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { hackathonVolunteerApplications as applications } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter } from "../../trpc";
import { isAdmin } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { portalOrigin } from "../../services/judging/claims";
import {
  matchingVolunteers,
  volunteerCoverage,
  volunteerFilter,
} from "../../services/volunteer";
import { refuseBugTester } from "../hackathon/admin/roster";
import { toSlug } from "../hackathon/crud";

// Every application for an edition, with the person. One read: an edition
// has tens of volunteers, so filtering and counting happen on the rows
// rather than in several queries.
const loadRoster = (db: DrizzleDB, hackathonId: string) =>
  db.query.hackathonVolunteerApplications.findMany({
    where: { hackathonId },
    with: {
      user: { columns: { id: true, name: true, email: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

// The organisers' side: who offered, what they can cover, and the decision.
// Approving does NOT grant the "volunteer" staff tier (check-in scanner
// access). That is a deliberate grant on the Staff page.
export const volunteerAdminRouter = createTRPCRouter({
  // The roster, filtered, with coverage over everyone so the counts do not
  // move as the filters do. Phones are in the answers, so bug testers are
  // turned away like they are from the attendee roster.
  list: isAdmin.input(volunteerFilter).query(async ({ ctx, input }) => {
    refuseBugTester(ctx.admin.role);
    const roster = await loadRoster(ctx.db as DrizzleDB, input.hackathonId);
    return {
      applications: matchingVolunteers(roster, input),
      coverage: volunteerCoverage(roster),
    };
  }),

  // The filtered roster again for the CSV, as its own endpoint so the one call
  // that hands over every volunteer's phone is explicit and audited.
  exportApplications: isAdmin
    .input(volunteerFilter)
    .query(async ({ ctx, input }) => {
      refuseBugTester(ctx.admin.role);
      const roster = await loadRoster(ctx.db as DrizzleDB, input.hackathonId);
      const rows = matchingVolunteers(roster, input);

      await recordAdminAction(ctx.db as DrizzleDB, {
        userId: ctx.userId,
        action: "volunteer.export",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: {
          rowCount: rows.length,
          status: input.status ?? null,
          role: input.role ?? null,
          block: input.block ?? null,
        },
      });

      return rows;
    }),

  // Approves or declines. Either can follow the other, so a mistaken click is
  // undone; a withdrawn application is the person's own choice and is left
  // alone. The email goes out on the transition only, so a second click on the
  // same button neither mails nor writes another audit row.
  decide: isAdmin
    .input(
      z.object({
        applicationId: z.string().uuid(),
        decision: z.enum(["approved", "declined"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const before = await db.query.hackathonVolunteerApplications.findFirst({
        where: { id: input.applicationId },
        columns: { status: true, hackathonId: true, userId: true, mode: true },
        with: { user: { columns: { email: true } } },
      });
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Application not found",
        });
      }
      if (before.status === "withdrawn") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The applicant withdrew, so there is nothing to decide.",
        });
      }
      if (before.status === input.decision) {
        return { success: true, status: input.decision, changed: false };
      }

      // Conditional on the status read above: two organisers deciding at once
      // cannot both win, and neither can overwrite a withdrawal that landed
      // in between.
      const [updated] = await db
        .update(applications)
        .set({
          status: input.decision,
          reviewedById: ctx.userId as string,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(applications.id, input.applicationId),
            eq(applications.status, before.status),
          ),
        )
        .returning({ id: applications.id });
      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This application changed while you were looking at it. Reload and try again.",
        });
      }

      await recordAdminAction(db, {
        userId: ctx.userId,
        action:
          input.decision === "approved"
            ? "volunteer.approve"
            : "volunteer.decline",
        resourceId: input.applicationId,
        metadata: {
          hackathonId: before.hackathonId,
          applicantId: before.userId,
          from: before.status,
        },
      });

      // Best-effort: the decision stands if the mail does not go out, and the
      // log is the only record that it did not.
      const email = before.user?.email;
      if (email) {
        try {
          const hackathon = await db.query.hackathons.findFirst({
            where: { id: before.hackathonId },
            columns: { name: true },
          });
          const hackathonName = hackathon?.name ?? "the hackathon";
          const mail = await import("@query/auth/email");
          if (input.decision === "approved") {
            await mail.sendVolunteerApprovedEmail({
              email,
              hackathonName,
              mode: before.mode,
              volunteerUrl: `${portalOrigin()}/hackathons/${toSlug(hackathonName) || before.hackathonId}/volunteer`,
            });
          } else {
            await mail.sendVolunteerDeclinedEmail({ email, hackathonName });
          }
        } catch (error) {
          // oxlint-disable-next-line no-console
          console.error(
            `[Email Service] Volunteer ${input.decision} notice failed for application ${input.applicationId}:`,
            error,
          );
        }
      }

      return { success: true, status: input.decision, changed: true };
    }),
});

