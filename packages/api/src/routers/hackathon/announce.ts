import { z } from "zod";
import {
  emailConcurrency,
  forEachWithConcurrency,
} from "../../services/fanout";
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

// Mass announcements: "registration is open", "results are up". Separate from
// sendMassAcceptanceEmails because an acceptance also changes a participant's
// status and must be exactly once, while an announcement writes nothing about
// the person. Composing and sending are two steps: createAnnouncement freezes
// the message and audience, sendBatch walks the un-sent rows. That split is
// what makes a send resumable when an organiser's tab closes.

// Recipients per request. See MASS_EMAIL_BATCH on the client: each is an SMTP
// round trip, and more does not finish inside Cloud Run's timeout.
const MAX_RECIPIENTS_PER_CALL = 500;

// How long a claimed-but-unsent recipient stays claimed. Long enough that a
// batch working through 500 round trips is never reclaimed underneath itself,
// short enough that a request killed by a deploy does not strand rows.
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

// `not_accepted` is its own audience and deliberately last. Rejected and
// waitlisted applicants are excluded everywhere else — a "see you this
// weekend" to somebody turned down is worse than no email — but excluding
// them everywhere left silence as the only outcome. Chosen on purpose.
const AUDIENCES = [
  "interested",
  "registered",
  "approved",
  "checked_in",
  "not_accepted",
] as const;

type Audience = (typeof AUDIENCES)[number];

// Everyone in the chosen audience as `{ userId, email }`. Email comes from
// the users table rather than the interest or participant row, so it is the
// address they actually use; it is then copied onto the recipient row,
// freezing the audience at compose time.
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

  // "registered" is everyone holding a seat, at any stage. Rejected and
  // waitlisted are excluded from it and the two narrower audiences; reaching
  // them is what "not_accepted" is for, and it has to be picked deliberately.
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
  // How many people each audience would reach, so the compose screen can say so
  // before anything is sent.
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

  // Announcements for this edition and how far each got, so a reopened tab can
  // pick an unfinished send back up instead of starting a duplicate.
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

  // Freezes a message and its audience. Sends nothing. The recipient rows are
  // the resume marker: sendBatch only looks at rows with no sentAt, so a batch
  // that never ran, a closed tab and a second click converge on the same set.
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

      // A CTA label without a target renders a dead button, and a target without a
      // label renders nothing — both only visible once it is in someone's inbox.
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

  // Sends the next batch. Call until `done`. Each recipient is marked the
  // moment their send returns, so nothing depends on the caller keeping count —
  // the client's offset arithmetic used to be the only thing between a dropped
  // connection and a second delivery to everyone already reached.
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

      // Claim the batch before sending a single message. Selecting `sent_at IS
      // NULL` and marking afterwards left a window where two overlapping requests
      // both read the same rows and both sent. The claim is one atomic UPDATE, so
      // the loser gets a smaller batch rather than a duplicate delivery. A claim
      // older than CLAIM_TIMEOUT_MS is reclaimable, or a request that died
      // mid-flight would leave its rows claimed forever.
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
            // A previously rejected address is left alone rather than retried on every
            // batch, which would stall the loop on a permanent failure.
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
                      lt(
                        hackathonAnnouncementRecipients.claimedAt,
                        claimCutoff,
                      ),
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

      // Fanned out to the width of the SMTP pool. One at a time, a batch of a
      // few hundred outran Cloud Run's 300s request limit long before it ran
      // out of recipients, and the retry then re-sent from wherever it died.
      await forEachWithConcurrency(
        pending,
        emailConcurrency(),
        async (recipient) => {
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

            // Deliberate operational logging: the only record of which address the
            // provider rejected.
            // eslint-disable-next-line no-console
            console.error(
              `[Email Service] Announcement failed for ${recipient.email}:`,
              error,
            );
          }
        },
      );

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
