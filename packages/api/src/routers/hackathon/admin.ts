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
import { eq, and, inArray, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

/**
 * Re-derives hackathons.currentParticipants from the rows that actually hold a
 * seat. Rejected and waitlisted applicants do not hold one, and registration.ts
 * only ever increments the column, so every status change has to recompute it
 * from the participant table rather than trust the stored number — otherwise a
 * rejected applicant consumes capacity forever.
 *
 * The hackathon row is locked before the count is taken. `SET x = (subquery)`
 * plans that uncorrelated subquery once per statement, so without the lock a
 * register() committing while this UPDATE waits would have its increment
 * overwritten by a count taken before it landed: the seat total would drift
 * permanently low and eventually admit people past maxParticipants.
 */
const syncCurrentParticipants = (db: DrizzleDB, hackathonId: string) =>
  db.transaction(async (tx) => {
    await tx
      .select({ id: hackathons.id })
      .from(hackathons)
      .where(eq(hackathons.id, hackathonId))
      .for("update");

    await tx
      .update(hackathons)
      .set({
        currentParticipants: sql`(select count(*)::int from ${hackathonParticipants} where ${hackathonParticipants.hackathonId} = ${hackathonId} and ${hackathonParticipants.registrationStatus} in ('pending', 'approved', 'checked_in'))`,
      })
      .where(eq(hackathons.id, hackathonId));
  });

/**
 * Postgres unique_violation. Drizzle wraps every driver error in a
 * DrizzleQueryError, which carries no `code` — the pg error holding the
 * SQLSTATE sits on `.cause` — so the chain has to be walked. Checking only the
 * top-level object silently never matches in production, however well it works
 * against a mock that throws a bare `{ code: "23505" }`.
 */
const isUniqueViolation = (error: unknown) => {
  for (let cursor = error, depth = 0; cursor && depth < 5; depth++) {
    if (typeof cursor !== "object") break;
    if ((cursor as { code?: string }).code === "23505") return true;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return false;
};

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
        .set({
          registrationStatus: input.status,
          // Stamp the arrival the first time only: re-checking someone in must
          // not move the timestamp the attendees table shows.
          ...(input.status === "checked_in" && !participant.checkedInAt
            ? { checkedInAt: new Date() }
            : {}),
        })
        .where(eq(hackathonParticipants.id, input.participantId));

      await syncCurrentParticipants(ctx.db as DrizzleDB, input.hackathonId);

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
      const { hackathonId } = input;
      // Deduplicated so the skipped count below measures "not registered for
      // this hackathon" and not "you sent the same id twice".
      const participantIds = [...new Set(input.participantIds)];
      const db = ctx.db as DrizzleDB;

      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, hackathonId),
        columns: { name: true }
      });

      if (!hackathon) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found" });
      }

      // Recipients are scoped to this hackathon, exactly like the UPDATE below:
      // a stale id pasted from another event matches no row here, so it must not
      // be mailed "you've been accepted" for a hackathon it never applied to.
      // The list is re-checked in memory because an acceptance email cannot be
      // unsent — nothing outside this hackathon may reach the send loop.
      const participants = (
        await db.query.hackathonParticipants.findMany({
          where: and(
            inArray(hackathonParticipants.id, participantIds),
            eq(hackathonParticipants.hackathonId, hackathonId),
          ),
          with: { user: { columns: { email: true } } }
        })
      ).filter((participant) => participant.hackathonId === hackathonId);

      await db.transaction(async (tx) => {
        for (const participant of participants) {
          await tx
            .update(hackathonParticipants)
            .set({ registrationStatus: "approved", updatedAt: new Date() })
            .where(
              and(
                eq(hackathonParticipants.id, participant.id),
                eq(hackathonParticipants.hackathonId, hackathonId),
              ),
            );
        }
      });

      // Approving a rejected or waitlisted applicant hands a seat back out.
      await syncCurrentParticipants(db, hackathonId);

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

      const skipped = participantIds.length - participants.length;

      return { success: true, count: participants.length, skipped, message: `Successfully approved and sent acceptance emails to ${participants.length} participants.${skipped > 0 ? ` ${skipped} id(s) are not registered for this hackathon and were skipped.` : ""}` };
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

      // Each UPDATE is scoped by (id, hackathonId), so an id pasted from
      // another hackathon matches nothing. The caller is told how many rows
      // really changed rather than how many ids were submitted.
      const updated = await (ctx.db as DrizzleDB).transaction(async (tx) => {
        let changed = 0;
        for (const participantId of participantIds) {
          const rows = await tx
            .update(hackathonParticipants)
            .set({
              registrationStatus: status,
              updatedAt: new Date(),
              // coalesce so a batch that re-checks in someone who already
              // arrived keeps their original arrival time. `at time zone 'utc'`
              // because the column is timestamp-without-tz and drizzle reads it
              // back as UTC — a bare now() would be cast through the session
              // TimeZone and disagree with the `new Date()` that
              // updateParticipantStatus writes for the very same event.
              ...(status === "checked_in"
                ? {
                    checkedInAt: sql`coalesce(${hackathonParticipants.checkedInAt}, now() at time zone 'utc')`,
                  }
                : {}),
            })
            .where(
              and(
                eq(hackathonParticipants.id, participantId),
                eq(hackathonParticipants.hackathonId, hackathonId),
              ),
            )
            .returning({ id: hackathonParticipants.id });
          changed += rows.length;
        }
        return changed;
      });

      await syncCurrentParticipants(ctx.db as DrizzleDB, hackathonId);

      ctx.cache.deletePattern("hackathon*");

      return { success: true, updated };
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

      // 2b. A pass is only good for the window the event actually runs in.
      // Nothing else bounds a scan, so a scanner left on the wrong event would
      // otherwise keep admitting people to a meal that finished hours ago.
      if (event.endTime < new Date()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${event.name} has already ended.`,
        });
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

      const alreadyCheckedIn = `${participant.user.name || participant.user.email} is already checked into ${event.name}.`;

      if (existingScan) {
        throw new TRPCError({
          code: "CONFLICT",
          message: alreadyCheckedIn,
        });
      }

      // 4. Record attendance. unique('unique_event_participant') is the real
      // guard: two scanners can both pass the read above, so the loser's 23505
      // has to read as the same conflict the sequential duplicate returns
      // instead of a raw INTERNAL_SERVER_ERROR.
      try {
        await (ctx.db as DrizzleDB).insert(hackathonEventAttendees).values({
          eventId: input.eventId,
          participantId: input.participantId,
        });
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: alreadyCheckedIn,
          });
        }
        throw error;
      }

      // Invalidate hackathon caches after attendance scan
      ctx.cache.deletePattern("hackathon*");

      return {
        success: true,
        message: `Successfully checked in ${participant.user.name || participant.user.email}!`,
      };
    }),

});
