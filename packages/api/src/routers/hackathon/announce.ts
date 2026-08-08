import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
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
 * must be exactly once, while an announcement writes nothing and is safe to
 * repeat. Sharing one procedure would have meant one set of guarantees serving
 * two jobs badly.
 */

/** Recipients per request. See MASS_EMAIL_BATCH on the client: each one is an
 *  SMTP round trip, and a request carrying more does not finish inside Cloud
 *  Run's timeout. */
const MAX_RECIPIENTS_PER_CALL = 500;

const AUDIENCES = [
  "interested",
  "registered",
  "approved",
  "checked_in",
] as const;

type Audience = (typeof AUDIENCES)[number];

/**
 * Everyone in the chosen audience, as `{ userId, email }`.
 *
 * Email is read from the users table rather than stored alongside the interest
 * or participant row, so a person who changes their address gets the mail at
 * the address they actually use.
 */
const resolveAudience = async (
  db: DrizzleDB,
  hackathonId: string,
  audience: Audience,
) => {
  if (audience === "interested") {
    const rows = await db
      .select({ userId: hackathonInterest.userId, email: users.email })
      .from(hackathonInterest)
      .innerJoin(users, eq(users.id, hackathonInterest.userId))
      .where(
        and(
          eq(hackathonInterest.hackathonId, hackathonId),
          isNotNull(users.email),
        ),
      );
    return rows;
  }

  // "registered" is everyone holding a seat, whatever stage they are at.
  // Rejected and waitlisted applicants are deliberately excluded from all
  // three: nothing here is the right channel for telling somebody they are
  // out, and a "see you this weekend" to a rejected applicant is worse than
  // no email at all.
  const statuses =
    audience === "registered"
      ? (["pending", "approved", "checked_in"] as const)
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
    );
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
          return [audience, rows.length] as const;
        }),
      );

      return Object.fromEntries(entries) as Record<Audience, number>;
    }),

  sendAnnouncement: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        audience: z.enum(AUDIENCES),
        subject: z.string().trim().min(1).max(200),
        heading: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(5000),
        ctaLabel: z.string().trim().max(60).optional(),
        ctaUrl: z.string().url().max(500).optional(),
        /** Skip this many recipients. The client walks the audience in batches
         *  and reports progress; the server stays one bounded unit of work. */
        offset: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { id: true, name: true },
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

      const batch = recipients.slice(
        input.offset,
        input.offset + MAX_RECIPIENTS_PER_CALL,
      );

      const { sendAnnouncementEmail } = await import("@query/auth/email");

      let sent = 0;
      const failed: string[] = [];

      for (const recipient of batch) {
        if (!recipient.email) continue;
        try {
          await sendAnnouncementEmail({
            email: recipient.email,
            subject: input.subject,
            heading: input.heading,
            body: input.body,
            ctaLabel: input.ctaLabel,
            ctaUrl: input.ctaUrl,
          });
          sent++;
        } catch (error) {
          failed.push(recipient.email);
          // Deliberate server-side operational logging: this is the only
          // record of which address the provider rejected.
          // eslint-disable-next-line no-console
          console.error(
            `[Email Service] Announcement failed for ${recipient.email}:`,
            error,
          );
        }
      }

      const nextOffset = input.offset + batch.length;

      return {
        sent,
        failed,
        totalRecipients: recipients.length,
        nextOffset,
        done: nextOffset >= recipients.length,
      };
    }),
});
