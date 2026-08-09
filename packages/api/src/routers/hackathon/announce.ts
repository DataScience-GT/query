import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  hackathonAnnouncements,
  hackathonAnnouncementRecipients,
  hackathonInterest,
  hackathonParticipants,
  hackathons,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter } from "../../trpc";
import { isAdmin } from "../../middleware/procedures";

/**
 * Mass announcements: "registration is open", "the schedule is live",
 * "results are up".
 *
 * Kept separate from sendMassAcceptanceEmails because the two differ in the
 * thing that matters — an acceptance also changes a participant's status and
 * must be exactly once, while an announcement writes nothing about the person
 * it is about. Sharing one procedure would have meant one set of guarantees
 * serving two jobs badly.
 *
 * Composing and sending are two steps. `createAnnouncement` freezes the message
 * and its audience into rows; `sendBatch` walks the un-sent ones. That split is
 * what makes a send resumable: the loop runs in an organiser's browser, and
 * before this a closed tab left no record of who had already been mailed —
 * re-running it mailed everyone again.
 */

/** Recipients per request. See MASS_EMAIL_BATCH on the client: each one is an
 *  SMTP round trip, and a request carrying more does not finish inside Cloud
 *  Run's timeout. */
const MAX_RECIPIENTS_PER_CALL = 500;

/**
 * How long a claimed-but-unsent recipient stays claimed.
 *
 * Long enough that a batch still working through its 500 SMTP round trips is
 * never reclaimed underneath itself, short enough that a request killed by a
 * deploy does not strand its rows for the rest of the event.
 */
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * `not_accepted` is deliberately its own audience and deliberately last.
 *
 * Rejected and waitlisted applicants are excluded from every other audience —
 * a "see you this weekend" to somebody who was turned down is worse than no
 * email at all. But excluding them everywhere meant nothing in the product
 * could reach them, so the only outcome was silence. This audience exists to be
 * chosen on purpose, for a message written for it.
 */
const AUDIENCES = [
  "interested",
  "registered",
  "approved",
  "checked_in",
  "not_accepted",
] as const;

type Audience = (typeof AUDIENCES)[number];

/**
 * Everyone in the chosen audience, as `{ userId, email }`.
 *
 * Email is read from the users table rather than stored alongside the interest
 * or participant row, so the address is the one the person actually uses — it
 * is then copied onto the recipient row, freezing the audience at compose time.
 */
const resolveAudience = async (
  db: DrizzleDB,
  hackathonId: string,
  audience: Audience,
) => {
  if (audience === "interested") {
    return await db
      .select({ userId: hackathonInterest.userId, email: users.email })
      .from(hackathonInterest)
      .innerJoin(users, eq(users.id, hackathonInterest.userId))
      .where(
        and(
          eq(hackathonInterest.hackathonId, hackathonId),
          isNotNull(users.email),
        ),
      )
      .orderBy(asc(hackathonInterest.userId));
  }

  // "registered" is everyone holding a seat, whatever stage they are at.
  // Rejected and waitlisted applicants are excluded from it and from the two
  // narrower audiences; reaching them is what "not_accepted" is for, and it has
  // to be picked deliberately.
  const statuses =
    audience === "registered"
      ? (["pending", "approved", "checked_in"] as const)
      : audience === "not_accepted"
        ? (["rejected", "waitlisted"] as const)
        : ([audience] as const);

  return await db
    .select({ userId: hackathonParticipants.userId, email: users.email })
    .from(hackathonParticipants)
    .innerJoin(users, eq(users.id, hackathonParticipants.userId))
    .where(
      and(
        eq(hackathonParticipants.hackathonId, hackathonId),
        inArray(hackathonParticipants.registrationStatus, [...statuses]),
        isNotNull(users.email),
      ),
    )
    .orderBy(asc(hackathonParticipants.userId));
};

export const hackathonAnnounceRouter = createTRPCRouter({
  /** How many people each audience would reach, so the compose screen can say
   *  so before anything is sent. */
  audienceCounts: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const entries = await Promise.all(
        AUDIENCES.map(async (audience) => {
          const rows = await resolveAudience(db, input.hackathonId, audience);
          const emails = new Set(rows.map((r) => r.email));
          return [audience, emails.size] as const;
        }),
      );

      return Object.fromEntries(entries) as Record<Audience, number>;
    }),

  /**
   * Announcements for this edition and how far each one got — so a reopened tab
   * can pick an unfinished send back up instead of starting a duplicate.
   */
  listAnnouncements: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const rows = await db
        .select({
          id: hackathonAnnouncements.id,
          subject: hackathonAnnouncements.subject,
          audience: hackathonAnnouncements.audience,
          createdAt: hackathonAnnouncements.createdAt,
          total: sql<number>`count(${hackathonAnnouncementRecipients.id})::int`,
          sent: sql<number>`count(${hackathonAnnouncementRecipients.sentAt})::int`,
          failed: sql<number>`count(${hackathonAnnouncementRecipients.failedAt})::int`,
        })
        .from(hackathonAnnouncements)
        .leftJoin(
          hackathonAnnouncementRecipients,
          eq(
            hackathonAnnouncementRecipients.announcementId,
            hackathonAnnouncements.id,
          ),
        )
        .where(eq(hackathonAnnouncements.hackathonId, input.hackathonId))
        .groupBy(hackathonAnnouncements.id)
        .orderBy(desc(hackathonAnnouncements.createdAt))
        .limit(50);

      return rows.map((row) => ({
        ...row,
        pending: row.total - row.sent - row.failed,
      }));
    }),

  /**
   * Freezes a message and its audience. Sends nothing.
   *
   * The recipient rows written here are the resume marker: `sendBatch` only
   * ever looks at rows with no `sentAt`, so a batch that never ran, a tab that
   * was closed and a second click all converge on the same remaining set.
   */
  createAnnouncement: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        audience: z.enum(AUDIENCES),
        subject: z.string().trim().min(1).max(200),
        heading: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(5000),
        ctaLabel: z.string().trim().max(60).optional(),
        ctaUrl: z.string().url().max(500).optional(),
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

      // A CTA label without a target renders a dead button, and a target
      // without a label renders nothing at all — neither is what the organiser
      // meant, and both are only visible once it is in someone's inbox.
      if (!!input.ctaLabel !== !!input.ctaUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A button needs both a label and a link, or neither.",
        });
      }

      const all = await resolveAudience(db, input.hackathonId, input.audience);

      // Deduplicated: somebody on the interest list who later registered would
      // otherwise be counted, and mailed, twice.
      const seen = new Set<string>();
      const recipients = all.filter((row) => {
        if (!row.email || seen.has(row.email)) return false;
        seen.add(row.email);
        return true;
      });

      if (recipients.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That audience has nobody in it.",
        });
      }

      const [announcement] = await db
        .insert(hackathonAnnouncements)
        .values({
          hackathonId: input.hackathonId,
          audience: input.audience,
          subject: input.subject,
          heading: input.heading,
          body: input.body,
          ctaLabel: input.ctaLabel ?? null,
          ctaUrl: input.ctaUrl ?? null,
          createdById: ctx.userId as string,
        })
        .returning({ id: hackathonAnnouncements.id });

      if (!announcement) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create the announcement",
        });
      }

      for (let i = 0; i < recipients.length; i += 1000) {
        await db.insert(hackathonAnnouncementRecipients).values(
          recipients.slice(i, i + 1000).map((row) => ({
            announcementId: announcement.id,
            userId: row.userId,
            email: row.email as string,
          })),
        );
      }

      return {
        announcementId: announcement.id,
        totalRecipients: recipients.length,
      };
    }),

  /**
   * Sends the next batch of an announcement. Call until `done`.
   *
   * Each recipient is marked the moment their send returns, so nothing depends
   * on the caller keeping count — the client's offset arithmetic used to be the
   * only thing standing between a dropped connection and a second delivery to
   * everyone already reached.
   */
  sendBatch: isAdmin
    .input(z.object({ announcementId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const announcement = await db.query.hackathonAnnouncements.findFirst({
        where: eq(hackathonAnnouncements.id, input.announcementId),
      });

      if (!announcement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Announcement not found",
        });
      }

      /**
       * Claim the batch before sending a single message.
       *
       * Selecting `sent_at IS NULL` and marking afterwards left a window: two
       * overlapping requests — two organisers, or one impatient double-click —
       * both read the same rows and both sent to them. The claim is a single
       * atomic UPDATE, so exactly one request wins each row and the loser gets
       * a smaller batch rather than a duplicate delivery.
       *
       * A claim older than CLAIM_TIMEOUT_MS is reclaimable: a request that died
       * mid-flight (timeout, deploy, crash) would otherwise leave its rows
       * claimed forever and the send permanently unfinishable. The window is
       * generous — re-sending to somebody is worse than making an organiser
       * wait — and only a batch that genuinely stopped can hit it.
       */
      const claimCutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS);

      const pending = await db
        .update(hackathonAnnouncementRecipients)
        .set({ claimedAt: new Date() })
        .where(
          and(
            eq(
              hackathonAnnouncementRecipients.announcementId,
              input.announcementId,
            ),
            isNull(hackathonAnnouncementRecipients.sentAt),
            // A previously rejected address is left alone rather than retried
            // on every batch, which would stall the loop on a permanent
            // failure.
            isNull(hackathonAnnouncementRecipients.failedAt),
            or(
              isNull(hackathonAnnouncementRecipients.claimedAt),
              lt(hackathonAnnouncementRecipients.claimedAt, claimCutoff),
            ),
            inArray(
              hackathonAnnouncementRecipients.id,
              db
                .select({ id: hackathonAnnouncementRecipients.id })
                .from(hackathonAnnouncementRecipients)
                .where(
                  and(
                    eq(
                      hackathonAnnouncementRecipients.announcementId,
                      input.announcementId,
                    ),
                    isNull(hackathonAnnouncementRecipients.sentAt),
                    isNull(hackathonAnnouncementRecipients.failedAt),
                    or(
                      isNull(hackathonAnnouncementRecipients.claimedAt),
                      lt(hackathonAnnouncementRecipients.claimedAt, claimCutoff),
                    ),
                  ),
                )
                .orderBy(asc(hackathonAnnouncementRecipients.id))
                .limit(MAX_RECIPIENTS_PER_CALL),
            ),
          ),
        )
        .returning({
          id: hackathonAnnouncementRecipients.id,
          email: hackathonAnnouncementRecipients.email,
        });

      const { sendAnnouncementEmail } = await import("@query/auth/email");

      let sent = 0;
      const failed: string[] = [];

      for (const recipient of pending) {
        try {
          await sendAnnouncementEmail({
            email: recipient.email,
            subject: announcement.subject,
            heading: announcement.heading,
            body: announcement.body,
            ctaLabel: announcement.ctaLabel ?? undefined,
            ctaUrl: announcement.ctaUrl ?? undefined,
          });

          await db
            .update(hackathonAnnouncementRecipients)
            .set({ sentAt: new Date() })
            .where(eq(hackathonAnnouncementRecipients.id, recipient.id));

          sent++;
        } catch (error) {
          failed.push(recipient.email);
          await db
            .update(hackathonAnnouncementRecipients)
            .set({ failedAt: new Date() })
            .where(eq(hackathonAnnouncementRecipients.id, recipient.id));

          // Deliberate server-side operational logging: this is the only
          // record of which address the provider rejected.
          // eslint-disable-next-line no-console
          console.error(
            `[Email Service] Announcement failed for ${recipient.email}:`,
            error,
          );
        }
      }

      const [remaining] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(hackathonAnnouncementRecipients)
        .where(
          and(
            eq(
              hackathonAnnouncementRecipients.announcementId,
              input.announcementId,
            ),
            isNull(hackathonAnnouncementRecipients.sentAt),
            isNull(hackathonAnnouncementRecipients.failedAt),
          ),
        );

      return {
        sent,
        failed,
        remaining: remaining?.count ?? 0,
        done: (remaining?.count ?? 0) === 0,
      };
    }),
});
