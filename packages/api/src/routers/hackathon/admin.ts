import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../../trpc";
import { isAdmin, isScanner } from "../../middleware/procedures";
import { isUniqueViolation } from "../../middleware/db-errors";
import {
  hackathons,
  hackathonParticipants,
  hackathonEvents,
  hackathonEventAttendees,
  users,
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
 * Evicts exactly the keys a participant status change moves.
 *
 * The old `deletePattern("hackathon*")` matched both the `hackathon:` and
 * `hackathons:` namespaces, so a single badge scan wiped every attendee's
 * cached registrations and the events list the whole venue reads. At 2000
 * people that turns a once-per-TTL query into a per-request one, during the
 * hour the schedule page is busiest.
 *
 * Each affected user's own registration list has to go too, or an acceptance
 * lands in somebody's inbox while their dashboard still says pending.
 */
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

/**
 * The WHERE shared by the paged roster and the CSV export, so the file an
 * organiser downloads always matches the list they were looking at.
 *
 * Search covers the same fields the old client-side filter did. ILIKE rather
 * than lower(...) LIKE because it reads as what it is; neither uses an index
 * at this row count, and 2000 rows is well inside what a scan handles.
 */
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
    // Escaped so a literal % or _ in somebody's name searches for that
    // character instead of turning into a wildcard.
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

      // Filtering happens in the database, not in the browser. The old version
      // shipped every participant row — 35 columns including resumes, phone
      // numbers and 2000-character essays — so the client could filter an array
      // it had already downloaded. At 2000 attendees that is megabytes of PII
      // per keystroke-triggered refetch.
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
          orderBy: (participants, { desc }) => [desc(participants.registeredAt)],
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
        // How many match the current filter, so the pager knows where it ends.
        // Deliberately not the unfiltered total: those are different numbers
        // and conflating them makes the last page unreachable.
        matching: totals?.count ?? 0,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /**
   * The whole filtered roster, for CSV export.
   *
   * Its own endpoint rather than a flag on adminGetAttendees so the one call
   * that hands over every attendee's PII is explicit at the call site and can
   * be audited or restricted on its own later.
   */
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

      evictParticipantCaches(ctx.cache, input.hackathonId, [participant.userId]);

      return { success: true };
    }),


  sendMassAcceptanceEmails: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        // Each id is one SMTP round trip. 500 is roughly what fits inside a
        // Cloud Run request, and it matches the daily ceiling of the consumer
        // Gmail account this currently sends through — the UI chunks a larger
        // selection rather than handing the request a batch it cannot finish.
        participantIds: z.array(z.string().uuid()).min(1).max(500),
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

      // One statement rather than one per recipient: this runs against the
      // full accepted list, and a 500-round-trip transaction holds a pool
      // connection for its whole duration.
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
      const failedEmails: string[] = [];

      for (const participant of participants) {
        if (!participant.user?.email) continue;
        try {
          await sendAcceptanceEmail({
            email: participant.user.email,
            hackathonName: hackathon.name,
            host: process.env.NEXTAUTH_URL || "https://datasciencegt.org"
          });
          // Stamped one row at a time, immediately after the send. A batch of
          // hundreds can die partway through — Cloud Run kills the request at
          // 300s — and this marker is what keeps a retry from mailing everyone
          // who already heard from us a second time.
          await db
            .update(hackathonParticipants)
            .set({ acceptanceEmailSentAt: new Date() })
            .where(eq(hackathonParticipants.id, participant.id));
          emailed++;
        } catch (error) {
          failedEmails.push(participant.user.email);
          // Deliberate server-side operational logging: this is the only record
          // of which address the provider rejected.
          // eslint-disable-next-line no-console
          console.error(`[Email Service] Failed to send acceptance email to ${participant.user.email}:`, error);
        }
      }

      evictParticipantCaches(
        ctx.cache,
        hackathonId,
        participants.map((participant) => participant.userId),
      );

      const skipped = participantIds.length - participants.length;

      // Approved and emailed are reported separately because they genuinely
      // differ: the provider throttles, addresses bounce, and an organiser told
      // "sent to 500" when 80 were delivered has no reason to look again.
      return {
        success: true,
        approved: participants.length,
        emailed,
        failedEmails,
        skipped,
        message: `Approved ${participants.length} participant(s); ${emailed} acceptance email(s) sent.${failedEmails.length > 0 ? ` ${failedEmails.length} could not be delivered.` : ""}${skipped > 0 ? ` ${skipped} id(s) are not registered for this hackathon and were skipped.` : ""}`,
      };
    }),


  batchUpdateParticipantStatus: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        // Sized for one organiser selecting every applicant at a 2000-person
        // event. The bound stays — an unbounded array is a memory ceiling, not
        // a feature — but 500 silently rejected the whole selection.
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
      // pool connection open for the whole batch. Scoping by (id, hackathonId)
      // is preserved exactly by the AND, so an id pasted from another hackathon
      // still matches nothing, and the caller is told how many rows really
      // changed rather than how many ids were submitted.
      const rows = await (ctx.db as DrizzleDB)
        .update(hackathonParticipants)
        .set({
          registrationStatus: status,
          updatedAt: new Date(),
          // coalesce so a batch that re-checks in someone who already arrived
          // keeps their original arrival time. `at time zone 'utc'` because the
          // column is timestamp-without-tz and drizzle reads it back as UTC — a
          // bare now() would be cast through the session TimeZone and disagree
          // with the `new Date()` that updateParticipantStatus writes for the
          // very same event.
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

      return { success: true, updated: rows.length };
    }),


  analytics: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const scope = eq(hackathonParticipants.hackathonId, input.hackathonId);

      // Counted by the database. This used to load every participant row —
      // all 35 columns, including the essays — to produce a handful of
      // integers, and it backs both the stat tiles and the analytics page.
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
        // unnest so each restriction in the array counts once, rather than
        // pulling every array back to be flattened in JS.
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


  /**
   * Who scanned into one event.
   *
   * The scanner writes these rows and, until now, nothing ever read or removed
   * them — so a station left pointed at the wrong event produced dozens of
   * check-ins an organiser could see the count of but not the contents.
   */
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

      // Scoped through the event's own hackathonId rather than trusting the
      // pair in the input, so an eventId from another edition returns nothing
      // instead of that edition's roster.
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

  /**
   * Undoes one scan.
   *
   * The scan path is deliberately hard to fool — a duplicate is a CONFLICT and
   * an ended event is a FORBIDDEN — but none of that helps when the mistake is
   * the event itself. Somebody has to be able to take a row back out.
   */
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

      // RETURNING rather than a preceding existence check: it names the row
      // this statement removed, so a scan already undone by another organiser
      // reads as "nothing to undo" instead of a second success.
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

      // A scan changes one event's attendee count and nothing else. This runs
      // at every door station all weekend, so it must not touch the roster or
      // any attendee's cached registrations.
      ctx.cache.delete(`hackathon:${input.hackathonId}:events`);

      return {
        success: true,
        message: `Successfully checked in ${participant.user.name || participant.user.email}!`,
      };
    }),

});
