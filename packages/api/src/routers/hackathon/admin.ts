import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../../trpc";
import { isAdmin } from "../../middleware/procedures";
import {
  hackathons,
  hackathonParticipants,
  hackathonEvents,
  hackathonEventAttendees,
} from "@query/db";
import { eq, and, inArray } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

export const hackathonAdminRouter = createTRPCRouter({
  adminGetAttendees: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const attendees = await (
        ctx.db as DrizzleDB
      ).query.hackathonParticipants.findMany({
        where: eq(hackathonParticipants.hackathonId, input.hackathonId),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          team: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: (participants, { desc }) => [desc(participants.registeredAt)],
      });

      return attendees;
    }),


  updateParticipantStatus: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        participantId: z.string().uuid("Invalid participant ID"),
        status: z.enum([
          "pending",
          "approved",
          "rejected",
          "waitlisted",
          "checked_in",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const participant = await (
        ctx.db as DrizzleDB
      ).query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.id, input.participantId),
          eq(hackathonParticipants.hackathonId, input.hackathonId),
        ),
      });

      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Participant not found",
        });
      }

      await (ctx.db as DrizzleDB)
        .update(hackathonParticipants)
        .set({ registrationStatus: input.status })
        .where(eq(hackathonParticipants.id, input.participantId));

      ctx.cache.deletePattern("hackathon*");

      return { success: true };
    }),


  sendMassAcceptanceEmails: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        participantIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { hackathonId, participantIds } = input;
      const db = ctx.db as DrizzleDB;

      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, hackathonId),
        columns: { name: true }
      });

      if (!hackathon) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found" });
      }

      const participants = await db.query.hackathonParticipants.findMany({
        where: inArray(hackathonParticipants.id, participantIds),
        with: { user: { columns: { email: true } } }
      });

      await db.transaction(async (tx) => {
        for (const participantId of participantIds) {
          await tx
            .update(hackathonParticipants)
            .set({ registrationStatus: "approved", updatedAt: new Date() })
            .where(
              and(
                eq(hackathonParticipants.id, participantId),
                eq(hackathonParticipants.hackathonId, hackathonId),
              ),
            );
        }
      });

      for (const participant of participants) {
        if (participant.user?.email) {
          try {
            const { sendAcceptanceEmail } = await import("@query/auth/email");
            await sendAcceptanceEmail({
              email: participant.user.email,
              hackathonName: hackathon.name,
              host: process.env.NEXTAUTH_URL || "https://datasciencegt.org"
            });
            // Deliberate server-side operational logging: acceptance emails are
            // sent in a loop and individual failures are swallowed below, so
            // these lines are the only record of what actually went out.
            // eslint-disable-next-line no-console
            console.log(`[Email Service] Sent acceptance email to ${participant.user.email} for hackathon ${hackathon.name}.`);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[Email Service] Failed to send acceptance email to ${participant.user.email}:`, error);
          }
        }
      }

      ctx.cache.deletePattern("hackathon*");

      return { success: true, count: participantIds.length, message: `Successfully approved and sent acceptance emails to ${participantIds.length} participants.` };
    }),


  batchUpdateParticipantStatus: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        participantIds: z.array(z.string().uuid()).min(1).max(500),
        status: z.enum([
          "pending",
          "approved",
          "rejected",
          "waitlisted",
          "checked_in",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { hackathonId, participantIds, status } = input;

      await (ctx.db as DrizzleDB).transaction(async (tx) => {
        for (const participantId of participantIds) {
          await tx
            .update(hackathonParticipants)
            .set({ registrationStatus: status, updatedAt: new Date() })
            .where(
              and(
                eq(hackathonParticipants.id, participantId),
                eq(hackathonParticipants.hackathonId, hackathonId),
              ),
            );
        }
      });

      ctx.cache.deletePattern("hackathon*");

      return { success: true, updated: participantIds.length };
    }),


  analytics: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const participants = await (
        ctx.db as DrizzleDB
      ).query.hackathonParticipants.findMany({
        where: eq(hackathonParticipants.hackathonId, input.hackathonId),
      });

      const stats = {
        totalRegistrations: participants.length,
        statusBreakdown: {
          approved: 0,
          pending: 0,
          rejected: 0,
          waitlisted: 0,
          checked_in: 0,
        },
        shirtSizes: {} as Record<string, number>,
        dietaryRestrictions: {} as Record<string, number>,
      };

      participants.forEach((p) => {
        // Status breakdown
        if (p.registrationStatus in stats.statusBreakdown) {
          stats.statusBreakdown[
            p.registrationStatus as keyof typeof stats.statusBreakdown
          ]++;
        }

        // Shirt sizes
        if (p.shirtSize) {
          stats.shirtSizes[p.shirtSize] =
            (stats.shirtSizes[p.shirtSize] || 0) + 1;
        }

        // Dietary restrictions
        if (p.dietaryRestrictions && p.dietaryRestrictions.length > 0) {
          p.dietaryRestrictions.forEach((restriction) => {
            const normalized = restriction.trim();
            if (normalized) {
              stats.dietaryRestrictions[normalized] =
                (stats.dietaryRestrictions[normalized] || 0) + 1;
            }
          });
        }
      });

      return stats;
    }),


  scanParticipantPass: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        participantId: z.string().uuid("Invalid participant ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Verify participant exists and belongs to this hackathon
      const participant = await (
        ctx.db as DrizzleDB
      ).query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.id, input.participantId),
          eq(hackathonParticipants.hackathonId, input.hackathonId),
        ),
        with: { user: true },
      });

      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Participant not found or not registered for this hackathon.",
        });
      }

      // 1b. Only accepted participants may check in. Pending and waitlisted
      // registrations are not yet admitted; rejected ones never are.
      if (
        participant.registrationStatus !== "approved" &&
        participant.registrationStatus !== "checked_in"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${participant.user.name || participant.user.email} is not accepted for this hackathon (status: ${participant.registrationStatus}).`,
        });
      }

      // 2. Verify event exists and belongs to this hackathon
      const event = await (ctx.db as DrizzleDB).query.hackathonEvents.findFirst(
        {
          where: and(
            eq(hackathonEvents.id, input.eventId),
            eq(hackathonEvents.hackathonId, input.hackathonId),
          ),
        },
      );

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      // 3. Check for existing check-in to prevent duplicates
      const existingScan = await (
        ctx.db as DrizzleDB
      ).query.hackathonEventAttendees.findFirst({
        where: and(
          eq(hackathonEventAttendees.eventId, input.eventId),
          eq(hackathonEventAttendees.participantId, input.participantId),
        ),
      });

      if (existingScan) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${participant.user.name || participant.user.email} is already checked into ${event.name}.`,
        });
      }

      // 4. Record attendance
      await (ctx.db as DrizzleDB).insert(hackathonEventAttendees).values({
        eventId: input.eventId,
        participantId: input.participantId,
      });

      // Invalidate hackathon caches after attendance scan
      ctx.cache.deletePattern("hackathon*");

      return {
        success: true,
        message: `Successfully checked in ${participant.user.name || participant.user.email}!`,
      };
    }),

});
