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
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { isAdmin } from "../../middleware/procedures";
import { rateLimit } from "../../middleware/security";

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

// `not_accepted`, `waitlisted` and `rejected` are their own audiences and
// deliberately last. Rejected and waitlisted applicants are excluded everywhere
// else — a "see you this weekend" to somebody turned down is worse than no
// email — but excluding them everywhere left silence as the only outcome.
// Chosen on purpose. The two narrow ones exist because the two groups need
// different messages: "we have no place for you" is wrong for someone still
// waiting on a seat.
const AUDIENCES = [
  "interested",
  "registered",
  "approved",
  "checked_in",
  "not_accepted",
  "waitlisted",
  "rejected",
] as const;

type Audience = (typeof AUDIENCES)[number];

// How many announcements listForMe returns to a hacker's event page.
const LATEST_FOR_ME = 3;

// The message itself, shared by createAnnouncement and sendTestToMe so a test
// goes through exactly the validation the real send does.
const messageInput = z.object({
  subject: z.string().trim().min(1).max(200),
  heading: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  ctaLabel: z.string().trim().max(60).optional(),
  // Also rendered as a link on hackers' event pages, which only link a web
  // address. `.url()` alone accepts data: and mailto: too.
  ctaUrl: z
    .string()
    .url()
    .max(500)
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "The button link must start with http:// or https://")
    .optional(),
});

// A CTA label without a target renders a dead button, and a target without a
// label renders nothing — both only visible once it is in someone's inbox.
const assertCompleteCta = (input: { ctaLabel?: string; ctaUrl?: string }) => {
  if (!!input.ctaLabel !== !!input.ctaUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A button needs both a label and a link, or neither.",
    });
  }
};

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
  // them is what "not_accepted" (both), "waitlisted" and "rejected" are for,
  // and one has to be picked deliberately.
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
  //
  // `sentAt` alone does not mean "emailed": an in-app post is born with it
  // stamped. Only sendBatch sets `claimedAt`, so `sent` counts rows with both,
  // and `inAppOnly` is an announcement whose every row is stamped but never
  // claimed. `pending` is counted directly, not total - sent - failed, which
  // would leave in-app rows looking like an unfinished send.
  listAnnouncements: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      return await db
        .select({
          id: hackathonAnnouncements.id,
          subject: hackathonAnnouncements.subject,
          audience: hackathonAnnouncements.audience,
          createdAt: hackathonAnnouncements.createdAt,
          total: sql<number>`count(${hackathonAnnouncementRecipients.id})::int`,
          sent: sql<number>`count(${hackathonAnnouncementRecipients.id}) filter (where ${hackathonAnnouncementRecipients.sentAt} is not null and ${hackathonAnnouncementRecipients.claimedAt} is not null)::int`,
          failed: sql<number>`count(${hackathonAnnouncementRecipients.failedAt})::int`,
          pending: sql<number>`count(${hackathonAnnouncementRecipients.id}) filter (where ${hackathonAnnouncementRecipients.sentAt} is null and ${hackathonAnnouncementRecipients.failedAt} is null)::int`,
          inAppOnly: sql<boolean>`count(${hackathonAnnouncementRecipients.id}) > 0 and count(${hackathonAnnouncementRecipients.id}) filter (where ${hackathonAnnouncementRecipients.sentAt} is not null and ${hackathonAnnouncementRecipients.claimedAt} is null) = count(${hackathonAnnouncementRecipients.id})`,
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
    }),

  // Freezes a message and its audience. Sends nothing. The recipient rows are
  // the resume marker: sendBatch only looks at rows with no sentAt, so a batch
  // that never ran, a closed tab and a second click converge on the same set.
  createAnnouncement: isAdmin
    .input(
      messageInput.extend({
        hackathonId: z.string().uuid(),
        audience: z.enum(AUDIENCES),
        // Published to the recipients' event pages and not emailed. The rows are
        // written already marked delivered, so sendBatch has nothing to claim.
        inAppOnly: z.boolean().optional(),
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

      assertCompleteCta(input);

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

      // In-app only has no send step to resume. A recipient left without `sentAt`
      // would show as an unfinished send, and "Resume sending" would then email
      // everybody; stamping it here means `sentAt` on these rows reads "delivered
      // to the event page", not "emailed". `claimedAt` stays null, and sendBatch
      // claims every row it emails, so the two remain distinguishable.
      const deliveredAt = input.inAppOnly ? new Date() : null;

      for (let i = 0; i < recipients.length; i += 1000) {
        await db.insert(hackathonAnnouncementRecipients).values(
          recipients.slice(i, i + 1000).map((row) => ({
            announcementId: announcement.id,
            userId: row.userId,
            email: row.email as string,
            ...(deliveredAt ? { sentAt: deliveredAt } : {}),
          })),
        );
      }

      return {
        announcementId: announcement.id,
        totalRecipients: recipients.length,
        inAppOnly: !!input.inAppOnly,
      };
    }),

  // The composed message, to the caller's own address only. No announcement and
  // no recipient rows are written, so a test leaves nothing for sendBatch to
  // find and cannot be mistaken for a send. Same send function and same
  // validation as the real thing.
  sendTestToMe: isAdmin.input(messageInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;

    assertCompleteCta(input);

    // Every test is a real SMTP message. A burst of three covers fixing a typo and
    // trying again; after that, one every ten seconds.
    const limit = rateLimit(`announcement-test:${ctx.userId}`, 3, 0.1);
    if (!limit.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        // Not `retryAfter`: that is the limiter's backoff, not when the next
        // token refills, so it would say "1 seconds" and then refuse again.
        message: "Too many test emails. Try again in a few seconds.",
      });
    }

    const me = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId as string),
      columns: { email: true },
    });

    if (!me?.email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Your account has no email address to send a test to.",
      });
    }

    const { sendAnnouncementEmail } = await import("@query/auth/email");

    try {
      await sendAnnouncementEmail({
        email: me.email,
        // Marked so a test is never mistaken for the real one in an inbox.
        subject: `[Test] ${input.subject}`,
        heading: input.heading,
        body: input.body,
        ctaLabel: input.ctaLabel,
        ctaUrl: input.ctaUrl,
      });
    } catch (error) {
      // Deliberate operational logging, as in sendBatch.
      // oxlint-disable-next-line no-console
      console.error("[Email Service] Announcement test failed:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The test email could not be sent.",
      });
    }

    return { sentTo: me.email };
  }),

  // The latest announcements addressed to the caller, for their event page.
  // Read off the recipient rows written at compose time: the audience was frozen
  // then and is not recomputed, so somebody who registered afterwards does not
  // see a message that was never sent to them. Only the message comes back, not
  // the audience, other recipients or send state.
  listForMe: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const rows = await db
        .select({
          subject: hackathonAnnouncements.subject,
          heading: hackathonAnnouncements.heading,
          body: hackathonAnnouncements.body,
          ctaLabel: hackathonAnnouncements.ctaLabel,
          ctaUrl: hackathonAnnouncements.ctaUrl,
          createdAt: hackathonAnnouncements.createdAt,
          deliveredAt: hackathonAnnouncementRecipients.sentAt,
        })
        .from(hackathonAnnouncements)
        .innerJoin(
          hackathonAnnouncementRecipients,
          and(
            eq(
              hackathonAnnouncementRecipients.announcementId,
              hackathonAnnouncements.id,
            ),
            eq(hackathonAnnouncementRecipients.userId, ctx.userId),
          ),
        )
        .where(eq(hackathonAnnouncements.hackathonId, input.hackathonId))
        .orderBy(desc(hackathonAnnouncements.createdAt))
        .limit(LATEST_FOR_ME);

      return rows.map((row) => ({
        subject: row.subject,
        heading: row.heading,
        body: row.body,
        cta:
          row.ctaLabel && row.ctaUrl
            ? { label: row.ctaLabel, url: row.ctaUrl }
            : null,
        // Not yet emailed to this person, or the address bounced: the message is
        // still theirs, dated from when it was composed.
        sentAt: row.deliveredAt ?? row.createdAt,
      }));
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

      // Fanned out to the width of the SMTP pool; one at a time, a few hundred
      // recipients outran Cloud Run's 300s limit.
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
            // oxlint-disable-next-line no-console
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
