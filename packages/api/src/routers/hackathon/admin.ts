import { z } from "zod";
import {
  emailConcurrency,
  forEachWithConcurrency,
} from "../../services/fanout";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../../trpc";
import { isAdmin, isScanner } from "../../middleware/procedures";
import { isUniqueViolation } from "../../middleware/db-errors";
import { recordAdminAction } from "../../middleware/audit";
import { MASS_EMAIL_BATCH } from "../../services/email-limits";
import {
  hackathons,
  hackathonParticipants,
  hackathonEvents,
  hackathonEventAttendees,
  users,
} from "@query/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

// Re-derives currentParticipants from the rows that actually hold a seat.
// Rejected and waitlisted applicants do not, and registration.ts only ever
// increments, so a rejected applicant would consume capacity forever. The
// hackathon row is locked first: `SET x = (subquery)` plans the subquery once
// per statement, so a register() committing mid-wait would be overwritten and
// the seat total would drift low enough to admit people past maxParticipants.
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

// Evicts exactly the keys a participant status change moves. The old
// `deletePattern("hackathon*")` matched both namespaces, so one badge scan
// wiped every attendee's cached registrations and the venue-wide events list.
// Each affected user's own registration list goes too, or an acceptance lands
// in their inbox while their dashboard still says pending.
const evictParticipantCaches = (
  cache: { delete: (key: string) => boolean },
  hackathonId: string,
  userIds: string[],
) => {
  cache.delete(`hackathon:${hackathonId}:participants`);
  cache.delete(`hackathon:${hackathonId}:analytics`);
  for (const userId of new Set(userIds)) {
    cache.delete(`hackathon:registrations:${userId}`);
  }
};

const PARTICIPANT_STATUSES = z.enum([
  "pending",
  "approved",
  "rejected",
  "waitlisted",
  "checked_in",
]);

// The WHERE shared by the paged roster and the CSV export, so the downloaded
// file matches the list on screen. ILIKE rather than lower(...) LIKE because
// it reads as what it is; neither indexes at 2000 rows, which scans fine.
const buildAttendeeWhere = (input: {
  hackathonId: string;
  search?: string;
  status?: z.infer<typeof PARTICIPANT_STATUSES>;
}) => {
  const clauses = [eq(hackathonParticipants.hackathonId, input.hackathonId)];

  if (input.status) {
    clauses.push(eq(hackathonParticipants.registrationStatus, input.status));
  }

  const term = input.search?.trim();
  if (term) {
    // Escaped so a literal % or _ in a name searches for that character instead
    // of turning into a wildcard.
    const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push(
      sql`(
        ${hackathonParticipants.firstName} ilike ${pattern}
        or ${hackathonParticipants.lastName} ilike ${pattern}
        or ${hackathonParticipants.school} ilike ${pattern}
        or ${hackathonParticipants.major} ilike ${pattern}
        or ${hackathonParticipants.whyAttend} ilike ${pattern}
        or exists (
          select 1 from ${users}
          where ${users.id} = ${hackathonParticipants.userId}
            and (${users.name} ilike ${pattern} or ${users.email} ilike ${pattern})
        )
      )`,
    );
  }

  return and(...clauses);
};

export const hackathonAdminRouter = createTRPCRouter({
  adminGetAttendees: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
        search: z.string().trim().max(200).optional(),
        status: PARTICIPANT_STATUSES.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      // Filtering happens in the database. The old version shipped every
      // participant row — 35 columns including resumes, phone numbers and
      // 2000-character essays — so the client could filter an array it had already
      // downloaded: megabytes of PII per keystroke-triggered refetch.
      const where = buildAttendeeWhere(input);

      const [rows, [totals]] = await Promise.all([
        db.query.hackathonParticipants.findMany({
          where,
          with: {
            user: {
              columns: { id: true, name: true, email: true, image: true },
            },
            team: { columns: { id: true, name: true } },
          },
          orderBy: (participants, { desc }) => [
            desc(participants.registeredAt),
          ],
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(hackathonParticipants)
          .where(where),
      ]);

      return {
        attendees: rows,
        // How many match the current filter, so the pager knows where it ends. Not
        // the unfiltered total — conflating them makes the last page unreachable.
        matching: totals?.count ?? 0,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  // Just the ids matching the current filter, so "select all" means every
  // matching applicant rather than the fifty on screen. A bulk approve that
  // silently covers 50 of 2000 while reporting success is worse than one that
  // fails outright. Ids, not rows: the set is fixed at the moment the organiser
  // chose it instead of re-evaluating a filter that may have moved.
  adminGetAttendeeIds: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        search: z.string().trim().max(200).optional(),
        status: PARTICIPANT_STATUSES.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await (ctx.db as DrizzleDB)
        .select({ id: hackathonParticipants.id })
        .from(hackathonParticipants)
        .where(buildAttendeeWhere(input))
        // Matches the batch mutation's own cap, so a selection can always be
        // acted on in a single call.
        .limit(2500);

      return rows.map((row) => row.id);
    }),

  // The whole filtered roster, for CSV export. Its own endpoint rather than a
  // flag so the one call that hands over every attendee's PII is explicit at
  // the call site and can be audited or restricted later.
  exportAttendees: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        search: z.string().trim().max(200).optional(),
        status: PARTICIPANT_STATUSES.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).query.hackathonParticipants.findMany({
        where: buildAttendeeWhere(input),
        with: {
          user: { columns: { id: true, name: true, email: true } },
          team: { columns: { id: true, name: true } },
        },
        orderBy: (participants, { desc }) => [desc(participants.registeredAt)],
      });
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

      await (ctx.db as DrizzleDB)
        .update(hackathonParticipants)
        .set({
          registrationStatus: input.status,
          // Stamp the arrival the first time only: re-checking someone in must not move
          // the timestamp the attendees table shows.
          ...(input.status === "checked_in" && !participant.checkedInAt
            ? { checkedInAt: new Date() }
            : {}),
        })
        .where(eq(hackathonParticipants.id, input.participantId));

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

      const { wave, picked } = await db.transaction(async (tx) => {
        const [highest] = await tx
          .select({
            max: sql<
              number | null
            >`max(${hackathonParticipants.acceptanceWave})`,
          })
          .from(hackathonParticipants)
          .where(eq(hackathonParticipants.hackathonId, input.hackathonId));

        const wave = (highest?.max ?? 0) + 1;

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
          .limit(input.size)
          .for("update", { skipLocked: true });

        if (picked.length === 0) return { wave, picked };

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

        return { wave, picked };
      });

      if (picked.length === 0) {
        return {
          wave,
          accepted: 0,
          participantIds: [] as string[],
          message: "No pending applications left to accept.",
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

      // One statement rather than one per recipient: this runs against the full
      // accepted list, and a 500-round-trip transaction holds a pool connection for
      // its whole duration.
      await db
        .update(hackathonParticipants)
        .set({ registrationStatus: "approved", updatedAt: new Date() })
        .where(
          and(
            inArray(
              hackathonParticipants.id,
              participants.map((participant) => participant.id),
            ),
            eq(hackathonParticipants.hackathonId, hackathonId),
          ),
        );

      // Approving a rejected or waitlisted applicant hands a seat back out.
      await syncCurrentParticipants(db, hackathonId);

      const { sendAcceptanceEmail } = await import("@query/auth/email");

      let emailed = 0;
      let alreadyEmailed = 0;
      const failedEmails: string[] = [];

      // Sent at the width of the SMTP pool rather than one at a time; the
      // per-row marker below is what makes that safe to resume after a batch
      // that still runs out of request time.
      await forEachWithConcurrency(
        participants,
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
            // eslint-disable-next-line no-console
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
          approved: participants.length,
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
        approved: participants.length,
        emailed,
        alreadyEmailed,
        failedEmails,
        skipped,
        message: `Approved ${participants.length} participant(s); ${emailed} acceptance email(s) sent.${alreadyEmailed > 0 ? ` ${alreadyEmailed} had already been emailed and were left alone.` : ""}${failedEmails.length > 0 ? ` ${failedEmails.length} could not be delivered.` : ""}${skipped > 0 ? ` ${skipped} id(s) are not registered for this hackathon and were skipped.` : ""}`,
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
      const rows = await (ctx.db as DrizzleDB)
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

  analytics: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const scope = eq(hackathonParticipants.hackathonId, input.hackathonId);

      // Counted by the database. This used to load every participant row — all 35
      // columns, essays included — to produce a handful of integers, and it backs
      // both the stat tiles and the analytics page.
      const [byStatus, bySize, byDiet] = await Promise.all([
        db
          .select({
            status: hackathonParticipants.registrationStatus,
            count: sql<number>`count(*)::int`,
          })
          .from(hackathonParticipants)
          .where(scope)
          .groupBy(hackathonParticipants.registrationStatus),
        db
          .select({
            size: hackathonParticipants.shirtSize,
            count: sql<number>`count(*)::int`,
          })
          .from(hackathonParticipants)
          .where(scope)
          .groupBy(hackathonParticipants.shirtSize),
        // unnest so each restriction counts once, rather than pulling every array
        // back to be flattened in JS.
        db
          .select({
            restriction: sql<string>`btrim(restriction)`.as("restriction"),
            count: sql<number>`count(*)::int`,
          })
          .from(hackathonParticipants)
          .innerJoin(
            sql`unnest(${hackathonParticipants.dietaryRestrictions}) as restriction`,
            sql`true`,
          )
          .where(scope)
          .groupBy(sql`btrim(restriction)`),
      ]);

      const statusBreakdown = {
        approved: 0,
        pending: 0,
        rejected: 0,
        waitlisted: 0,
        checked_in: 0,
      };

      let totalRegistrations = 0;
      for (const row of byStatus) {
        totalRegistrations += row.count;
        if (row.status && row.status in statusBreakdown) {
          statusBreakdown[row.status as keyof typeof statusBreakdown] =
            row.count;
        }
      }

      const shirtSizes: Record<string, number> = {};
      for (const row of bySize) {
        if (row.size) shirtSizes[row.size] = row.count;
      }

      const dietaryRestrictions: Record<string, number> = {};
      for (const row of byDiet) {
        if (row.restriction) dietaryRestrictions[row.restriction] = row.count;
      }

      return {
        totalRegistrations,
        statusBreakdown,
        shirtSizes,
        dietaryRestrictions,
      };
    }),

  // Who scanned into one event. The scanner writes these rows and nothing ever
  // read them, so a station left on the wrong event produced dozens of check-ins
  // an organiser could count but not inspect.
  getEventAttendees: isScanner
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      // Scoped through the event's own hackathonId rather than the pair in the
      // input, so an eventId from another edition returns nothing.
      const event = await db.query.hackathonEvents.findFirst({
        where: and(
          eq(hackathonEvents.id, input.eventId),
          eq(hackathonEvents.hackathonId, input.hackathonId),
        ),
        columns: { id: true },
      });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      const [rows, [totals]] = await Promise.all([
        db.query.hackathonEventAttendees.findMany({
          where: eq(hackathonEventAttendees.eventId, input.eventId),
          with: {
            participant: {
              columns: { id: true, firstName: true, lastName: true },
              with: { user: { columns: { name: true, email: true } } },
            },
          },
          orderBy: (attendees, { desc }) => [desc(attendees.checkedInAt)],
          limit: input.limit,
          offset: input.offset,
        }),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(hackathonEventAttendees)
          .where(eq(hackathonEventAttendees.eventId, input.eventId)),
      ]);

      return { attendees: rows, matching: totals?.count ?? 0 };
    }),

  // Undoes one scan. The scan path is hard to fool — duplicates CONFLICT, ended
  // events are FORBIDDEN — but none of that helps when the mistake is the event
  // itself. Somebody has to be able to take a row back out.
  removeEventAttendance: isScanner
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        eventId: z.string().uuid("Invalid event ID"),
        participantId: z.string().uuid("Invalid participant ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const event = await db.query.hackathonEvents.findFirst({
        where: and(
          eq(hackathonEvents.id, input.eventId),
          eq(hackathonEvents.hackathonId, input.hackathonId),
        ),
        columns: { id: true },
      });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      // RETURNING rather than a preceding existence check: it names the row this
      // statement removed, so a scan already undone reads as "nothing to undo".
      const deleted = await db
        .delete(hackathonEventAttendees)
        .where(
          and(
            eq(hackathonEventAttendees.eventId, input.eventId),
            eq(hackathonEventAttendees.participantId, input.participantId),
          ),
        )
        .returning({ id: hackathonEventAttendees.id });

      if (deleted.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That participant is not checked into this event.",
        });
      }

      // Volunteers reach this, so it is the widest-held destructive action in the
      // product — worth a record of who undid which scan.
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.removeEventAttendance",
        resourceId: input.participantId,
        severity: "warn",
        metadata: {
          eventId: input.eventId,
          hackathonId: input.hackathonId,
        },
      });

      ctx.cache.delete(`hackathon:${input.hackathonId}:events`);

      return { success: true };
    }),

  scanParticipantPass: isScanner
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

      // 1b. Only accepted participants may check in. Pending and waitlisted are not
      // yet admitted; rejected never are.
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

      // 2b. A pass is only good for the window the event runs in. Nothing else
      // bounds a scan, so a scanner left on the wrong event would keep admitting
      // people to a meal that finished hours ago.
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

      // 4. Record attendance. unique('unique_event_participant') is the real guard:
      // two scanners can both pass the read above, so the loser's 23505 has to read
      // as the same conflict, not a raw INTERNAL_SERVER_ERROR.
      // Attendance and the roster promotion are one transaction. Split, a promotion
      // failing after the attendance row committed left the scan half-done — and
      // the retry hits the duplicate guard, so that attendee could never submit.
      // Rolling the attendance back makes a rescan the fix.
      let promotedToCheckedIn = false;

      await (ctx.db as DrizzleDB).transaction(async (tx) => {
        try {
          await tx.insert(hackathonEventAttendees).values({
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

        // The first scan is the check-in. `checked_in` previously had no writer
        // anywhere, which was harmless while it was only a label — but submitting now
        // requires it, so nobody could submit and the error told them to do what they
        // had just done. `registrationStatus = 'approved'` is in the WHERE, not only
        // the read: a rejection landing between read and write would otherwise be
        // overwritten. `checkedInAt` is stamped once, so it points at arrival.
        const [promoted] = await tx
          .update(hackathonParticipants)
          .set({
            registrationStatus: "checked_in",
            ...(participant.checkedInAt ? {} : { checkedInAt: new Date() }),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(hackathonParticipants.id, input.participantId),
              eq(hackathonParticipants.registrationStatus, "approved"),
            ),
          )
          .returning({ id: hackathonParticipants.id });

        promotedToCheckedIn = !!promoted;
      });

      // A scan changes one event's attendee count and, on the first one, this
      // attendee's roster row. This runs at every door all weekend, so eviction
      // stays narrow — the old blanket pattern wiped every cached registration.
      ctx.cache.delete(`hackathon:${input.hackathonId}:events`);

      if (promotedToCheckedIn) {
        evictParticipantCaches(ctx.cache, input.hackathonId, [
          participant.userId,
        ]);
      }

      return {
        success: true,
        checkedIn: promotedToCheckedIn,
        message: `Successfully checked in ${participant.user.name || participant.user.email}!`,
      };
    }),
});
