// Moving applicants between statuses: single, bulk, waves and acceptance emails.

import { z } from "zod";
import {
  emailConcurrency,
  forEachWithConcurrency,
} from "../../../services/fanout";
import { TRPCError } from "@trpc/server";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import { MASS_EMAIL_BATCH } from "../../../services/email-limits";
import { hackathons, hackathonParticipants } from "@query/db";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import {
  SEATED_STATUSES,
  syncCurrentParticipants,
  assertSeats,
  evictParticipantCaches,
} from "./seats";

export const statusProcedures = {
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

      // `checked_in` is reachable from `approved` and nowhere else. Submitting a
      // project requires it, so it is an authorisation state — setting it on
      // somebody still pending hands them the event with no review. Refused rather
      // than silently allowed: the remedy is one click.
      if (
        input.status === "checked_in" &&
        participant.registrationStatus !== "approved" &&
        participant.registrationStatus !== "checked_in"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `This applicant is ${participant.registrationStatus}. Accept them first — checking somebody in also lets them submit a project.`,
        });
      }

      await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // checked_in seats somebody too: the approved-only check above was
        // read before this transaction, and a concurrent "waitlisted" would
        // otherwise be checked in with no seat.
        if (input.status === "approved" || input.status === "checked_in") {
          await assertSeats(tx as unknown as DrizzleDB, input.hackathonId, [
            input.participantId,
          ]);
        }
        const updated = await tx
          .update(hackathonParticipants)
          .set({
            registrationStatus: input.status,
            // Stamp the arrival the first time only: re-checking someone in must not
            // move the timestamp the attendees table shows.
            ...(input.status === "checked_in" && !participant.checkedInAt
              ? { checkedInAt: new Date() }
              : {}),
          })
          .where(
            and(
              eq(hackathonParticipants.id, input.participantId),
              input.status === "checked_in"
                ? inArray(hackathonParticipants.registrationStatus, [
                    ...SEATED_STATUSES,
                  ])
                : undefined,
            ),
          )
          .returning({ id: hackathonParticipants.id });
        // A concurrent waitlist or reject leaves the seated-only WHERE matching
        // nothing; reporting success would wave them through the desk.
        if (updated.length === 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This applicant's status changed just now. Refresh and check again before letting them in.",
          });
        }
      });

      await syncCurrentParticipants(ctx.db as DrizzleDB, input.hackathonId);

      evictParticipantCaches(ctx.cache, input.hackathonId, [
        participant.userId,
      ]);

      return { success: true };
    }),

  /** What the next wave would take, and what the previous ones did. */
  waveStatus: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const [totals] = await db
        .select({
          pending: sql<number>`count(*) filter (where ${hackathonParticipants.registrationStatus} = 'pending')::int`,
          accepted: sql<number>`count(*) filter (where ${hackathonParticipants.registrationStatus} in ('approved', 'checked_in'))::int`,
        })
        .from(hackathonParticipants)
        .where(eq(hackathonParticipants.hackathonId, input.hackathonId));

      const waves = await db
        .select({
          wave: hackathonParticipants.acceptanceWave,
          accepted: sql<number>`count(*)::int`,
          emailed: sql<number>`count(${hackathonParticipants.acceptanceEmailSentAt})::int`,
        })
        .from(hackathonParticipants)
        .where(
          and(
            eq(hackathonParticipants.hackathonId, input.hackathonId),
            sql`${hackathonParticipants.acceptanceWave} is not null`,
          ),
        )
        .groupBy(hackathonParticipants.acceptanceWave)
        .orderBy(hackathonParticipants.acceptanceWave);

      return {
        pending: totals?.pending ?? 0,
        accepted: totals?.accepted ?? 0,
        waves: waves.map((row) => ({
          wave: row.wave ?? 0,
          accepted: row.accepted,
          emailed: row.emailed,
        })),
        nextWave:
          waves.reduce((max, row) => Math.max(max, row.wave ?? 0), 0) + 1,
      };
    }),

  // Accepts the oldest N pending applications as one numbered wave. Approving
  // only — the acceptance mail is a separate call, because a send of hundreds
  // can die mid-flight and the wave is already committed. Picked with SKIP
  // LOCKED so two organisers take disjoint applicants.
  acceptWave: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        // Matches sendMassAcceptanceEmails: one wave is one mailable batch.
        size: z.number().int().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { id: true },
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      const { wave, picked, full } = await db.transaction(async (tx) => {
        // Serialises waves for this hackathon. SKIP LOCKED below keeps two
        // concurrent waves from picking the same people, but both still read
        // the same max and were recorded as one wave number.
        await tx
          .select({ id: hackathons.id })
          .from(hackathons)
          .where(eq(hackathons.id, input.hackathonId))
          .for("update");

        const [highest] = await tx
          .select({
            max: sql<
              number | null
            >`max(${hackathonParticipants.acceptanceWave})`,
          })
          .from(hackathonParticipants)
          .where(eq(hackathonParticipants.hackathonId, input.hackathonId));

        const wave = (highest?.max ?? 0) + 1;

        // Never past capacity: a wave fills what is left and no more.
        const [seats] = await tx
          .select({
            max: hackathons.maxParticipants,
            seated: sql<number>`(select count(*)::int from ${hackathonParticipants} where ${hackathonParticipants.hackathonId} = ${input.hackathonId} and ${hackathonParticipants.registrationStatus} in ('approved', 'checked_in'))`,
          })
          .from(hackathons)
          .where(eq(hackathons.id, input.hackathonId));
        const size = seats?.max
          ? Math.min(input.size, Math.max(seats.max - seats.seated, 0))
          : input.size;
        if (size === 0) return { wave, picked: [], full: true };

        const picked = await tx
          .select({
            id: hackathonParticipants.id,
            userId: hackathonParticipants.userId,
          })
          .from(hackathonParticipants)
          .where(
            and(
              eq(hackathonParticipants.hackathonId, input.hackathonId),
              eq(hackathonParticipants.registrationStatus, "pending"),
            ),
          )
          .orderBy(hackathonParticipants.registeredAt)
          .limit(size)
          .for("update", { skipLocked: true });

        if (picked.length === 0) return { wave, picked, full: false };

        await tx
          .update(hackathonParticipants)
          .set({
            registrationStatus: "approved",
            acceptanceWave: wave,
            updatedAt: new Date(),
          })
          .where(
            inArray(
              hackathonParticipants.id,
              picked.map((row) => row.id),
            ),
          );

        return { wave, picked, full: false };
      });

      if (picked.length === 0) {
        return {
          wave,
          accepted: 0,
          participantIds: [] as string[],
          message: full
            ? "Every seat is taken. Raise the capacity to accept more."
            : "No pending applications left to accept.",
        };
      }

      await syncCurrentParticipants(db, input.hackathonId);

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.acceptWave",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: { wave, accepted: picked.length, requested: input.size },
      });

      evictParticipantCaches(
        ctx.cache,
        input.hackathonId,
        picked.map((row) => row.userId),
      );

      return {
        wave,
        accepted: picked.length,
        participantIds: picked.map((row) => row.id),
        message: `Wave ${wave}: ${picked.length} accepted. They are not emailed yet.`,
      };
    }),

  sendMassAcceptanceEmails: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        // Each id is one SMTP round trip. The bound is shared with the UI so the two
        // cannot drift — see MASS_EMAIL_BATCH. The UI chunks larger selections.
        participantIds: z.array(z.string().uuid()).min(1).max(MASS_EMAIL_BATCH),
        // Mail people who already had their acceptance. Off by default: the ordinary
        // reason to re-run is that the first run died partway, and everyone before
        // the failure point is already done.
        resend: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { hackathonId } = input;
      // Deduplicated so the skipped count means "not registered for this
      // hackathon" and not "you sent the same id twice".
      const participantIds = [...new Set(input.participantIds)];
      const db = ctx.db as DrizzleDB;

      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, hackathonId),
        columns: { name: true },
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      // Recipients are scoped to this hackathon, like the UPDATE below: a stale id
      // pasted from another event matches no row, and must not be mailed "you've
      // been accepted". Re-checked in memory because an acceptance cannot be unsent.
      const participants = (
        await db.query.hackathonParticipants.findMany({
          where: and(
            inArray(hackathonParticipants.id, participantIds),
            eq(hackathonParticipants.hackathonId, hackathonId),
          ),
          with: { user: { columns: { email: true } } },
        })
      ).filter((participant) => participant.hackathonId === hackathonId);

      if (participants.length === 0) {
        return {
          success: true,
          approved: 0,
          emailed: 0,
          failedEmails: [] as string[],
          skipped: participantIds.length,
          message: `None of the ${participantIds.length} id(s) are registered for this hackathon.`,
        };
      }

      // Already in the building: accepting again would undo check-in, and the
      // email congratulates somebody on an event they are standing in.
      const toAccept = participants.filter(
        (participant) => participant.registrationStatus !== "checked_in",
      );
      const checkedIn = participants.length - toAccept.length;

      // One statement rather than one per recipient: this runs against the full
      // accepted list, and a 500-round-trip transaction holds a pool connection for
      // its whole duration. Checked against capacity first, in the same
      // transaction, so the batch is accepted whole or not at all.
      await db.transaction(async (tx) => {
        await assertSeats(
          tx as unknown as DrizzleDB,
          hackathonId,
          toAccept.map((participant) => participant.id),
        );
        await tx
          .update(hackathonParticipants)
          .set({ registrationStatus: "approved", updatedAt: new Date() })
          .where(
            and(
              inArray(
                hackathonParticipants.id,
                participants.map((participant) => participant.id),
              ),
              eq(hackathonParticipants.hackathonId, hackathonId),
              // Repeated in SQL for a check-in that lands after the read above:
              // submitting a project requires checked_in.
              ne(hackathonParticipants.registrationStatus, "checked_in"),
            ),
          );
      });

      // Approving a rejected or waitlisted applicant hands a seat back out.
      await syncCurrentParticipants(db, hackathonId);

      const { sendAcceptanceEmail } = await import("@query/auth/email");

      let emailed = 0;
      let alreadyEmailed = 0;
      const failedEmails: string[] = [];

      // Width of the SMTP pool; the per-row marker below makes a partial batch
      // safe to resume.
      await forEachWithConcurrency(
        toAccept,
        emailConcurrency(),
        async (participant) => {
          if (!participant.user?.email) return;

          // The marker is read here, not just written below. Re-running after a batch
          // died partway is the normal recovery, and without this everyone before the
          // failure point is congratulated a second time.
          if (participant.acceptanceEmailSentAt && !input.resend) {
            alreadyEmailed++;
            return;
          }

          try {
            await sendAcceptanceEmail({
              email: participant.user.email,
              hackathonName: hackathon.name,
              host: process.env.NEXTAUTH_URL || "https://datasciencegt.org",
            });
            // Stamped one row at a time, right after the send. A batch of hundreds can
            // die partway — Cloud Run kills the request at 300s — and this marker is what
            // keeps a retry from mailing everyone twice.
            await db
              .update(hackathonParticipants)
              .set({ acceptanceEmailSentAt: new Date() })
              .where(eq(hackathonParticipants.id, participant.id));
            emailed++;
          } catch (error) {
            failedEmails.push(participant.user.email);
            // Deliberate operational logging: the only record of which address the
            // provider rejected.
            // oxlint-disable-next-line no-console
            console.error(
              `[Email Service] Failed to send acceptance email to ${participant.user.email}:`,
              error,
            );
          }
        },
      );

      // Thousands of emails that cannot be unsent, in one action.
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.sendMassAcceptanceEmails",
        resourceId: hackathonId,
        severity: "warn",
        metadata: {
          approved: toAccept.length,
          checkedIn,
          emailed,
          alreadyEmailed,
          failed: failedEmails.length,
          resend: input.resend,
        },
      });

      evictParticipantCaches(
        ctx.cache,
        hackathonId,
        participants.map((participant) => participant.userId),
      );

      const skipped = participantIds.length - participants.length;

      // Approved and emailed are reported separately because they differ: the
      // provider throttles and addresses bounce, and an organiser told "sent to
      // 500" when 80 landed has no reason to look again.
      return {
        success: true,
        approved: toAccept.length,
        emailed,
        alreadyEmailed,
        failedEmails,
        skipped,
        message: `Approved ${toAccept.length} participant(s); ${emailed} acceptance email(s) sent.${checkedIn > 0 ? ` ${checkedIn} already checked in and were left alone.` : ""}${alreadyEmailed > 0 ? ` ${alreadyEmailed} had already been emailed and were left alone.` : ""}${failedEmails.length > 0 ? ` ${failedEmails.length} could not be delivered.` : ""}${skipped > 0 ? ` ${skipped} id(s) are not registered for this hackathon and were skipped.` : ""}`,
      };
    }),

  batchUpdateParticipantStatus: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        // Sized for one organiser selecting every applicant at a 2000-person event.
        // The bound stays — unbounded is a memory ceiling, not a feature — but 500
        // silently rejected the whole selection.
        participantIds: z.array(z.string().uuid()).min(1).max(2500),
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

      // One statement, not one per id: 2000 sequential round trips would hold a
      // pool connection for the whole batch. The (id, hackathonId) scoping survives
      // in the AND, and the caller is told how many rows really changed.
      const rows = await (ctx.db as DrizzleDB).transaction(async (tx) => {
        if (status === "approved") {
          await assertSeats(
            tx as unknown as DrizzleDB,
            hackathonId,
            participantIds,
          );
        }
        return tx
          .update(hackathonParticipants)
          .set({
            registrationStatus: status,
            updatedAt: new Date(),
            // coalesce so re-checking in someone who already arrived keeps their original
            // time. `at time zone 'utc'` because the column is timestamp-without-tz: a
            // bare now() goes through the session TimeZone and would disagree with the
            // `new Date()` updateParticipantStatus writes for the same event.
            ...(status === "checked_in"
              ? {
                  checkedInAt: sql`coalesce(${hackathonParticipants.checkedInAt}, now() at time zone 'utc')`,
                }
              : {}),
          })
          .where(
            and(
              inArray(hackathonParticipants.id, participantIds),
              eq(hackathonParticipants.hackathonId, hackathonId),
              // Same rule as the single-participant path, in the WHERE so a 2000-row
              // selection with a few unreviewed applicants still admits everybody else.
              // It matters more here: "Select all N matching" means one wrong click could
              // promote every pending applicant to a state that lets them submit.
              status === "checked_in"
                ? inArray(hackathonParticipants.registrationStatus, [
                    "approved",
                    "checked_in",
                  ])
                : undefined,
            ),
          )
          .returning({
            id: hackathonParticipants.id,
            userId: hackathonParticipants.userId,
          });
      });

      await syncCurrentParticipants(ctx.db as DrizzleDB, hackathonId);

      evictParticipantCaches(
        ctx.cache,
        hackathonId,
        rows.map((row) => row.userId),
      );

      return {
        success: true,
        updated: rows.length,
        // Anything not updated was either not in this hackathon or not accepted yet.
        // Reported so a check-in run that quietly did less cannot pass for complete.
        skipped: participantIds.length - rows.length,
      };
    }),
};
