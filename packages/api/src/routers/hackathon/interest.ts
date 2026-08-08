import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { hackathonInterest, hackathons, users } from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../../trpc";
import { isAdmin } from "../../middleware/procedures";

/**
 * The interest list for an edition that has been announced but is not yet
 * taking registrations.
 *
 * Deliberately its own table rather than a `hackathon_participant` row with a
 * new status: an interested person has agreed to nothing, and putting them in
 * the participants table would have every count, export and capacity check
 * treat them as a registration. Converting one into the other is a decision
 * staff make when registration opens, not a status default.
 */

const interestInput = z.object({
  hackathonId: z.string().uuid(),
  school: z.string().trim().max(200).optional(),
  // Free text, not a country enum. The hackathon is global and a dropdown that
  // is missing somebody's country is a worse failure than an untidy string.
  country: z.string().trim().max(100).optional(),
  graduationYear: z.number().int().min(1900).max(2100).nullable().optional(),
  experience: z.enum(["first", "one_or_two", "three_plus"]).optional(),
});

const blankToNull = (value: string | undefined) =>
  value && value.length > 0 ? value : null;

/** Recipients per request — one SMTP round trip each, and a request carrying
 *  more than this does not finish inside Cloud Run's timeout. Matches
 *  announce.ts. */
const MAX_RECIPIENTS_PER_CALL = 500;

/**
 * The edition the landing page is about.
 *
 * `open` and `in_progress` belong here, not just `announced`: /hacklytics is
 * the only public entrance — the 2027 site's single CTA and the navbar both
 * land on it — and filtering to `announced` alone meant that the moment an
 * organiser opened registration, the one page telling the world about the
 * hackathon said "Nothing announced yet".
 *
 * Soonest first, so announcing the year after next does not displace the one
 * being promoted now.
 */
const PUBLIC_FUNNEL_STATUSES = ["announced", "open", "in_progress"] as const;

async function findAnnounced(db: DrizzleDB) {
  return db.query.hackathons.findFirst({
    where: and(
      inArray(hackathons.status, [...PUBLIC_FUNNEL_STATUSES]),
      eq(hackathons.isPublic, true),
    ),
    orderBy: asc(hackathons.startDate),
  });
}

export const hackathonInterestRouter = createTRPCRouter({
  /**
   * Public: the coming-soon page has to render for somebody who has never
   * signed in — that visitor is the entire audience for it.
   */
  getUpcoming: publicProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB | null;
    if (!db) return null;

    const upcoming = await findAnnounced(db);
    if (!upcoming) return null;

    return {
      id: upcoming.id,
      name: upcoming.name,
      description: upcoming.description,
      location: upcoming.location,
      startDate: upcoming.startDate,
      endDate: upcoming.endDate,
      theme: upcoming.theme,
      websiteUrl: upcoming.websiteUrl,
      // The page shows an interest form or a register CTA off this: the two
      // states are the same edition at different moments, not different pages.
      status: upcoming.status,
      registrationOpen:
        upcoming.status === "open" || upcoming.status === "in_progress",
      registrationDeadline: upcoming.registrationDeadline,
    };
  }),

  /** Whether the caller is already on the list, and what they told us. */
  myInterest: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await (ctx.db as DrizzleDB).query.hackathonInterest.findFirst({
        where: and(
          eq(hackathonInterest.hackathonId, input.hackathonId),
          eq(hackathonInterest.userId, ctx.userId),
        ),
      });
      return row ?? null;
    }),

  /**
   * Upserted, so submitting twice edits one entry rather than failing on the
   * unique index or quietly creating a second. Somebody coming back to correct
   * their graduation year should not have to find a delete button.
   */
  registerInterest: protectedProcedure
    .input(interestInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const target = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { id: true, status: true, isPublic: true },
      });

      // A draft edition is not public, so it answers the way a made-up id does
      // rather than confirming that staff are planning something.
      if (!target || !target.isPublic || target.status === "draft") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That hackathon is not accepting interest.",
        });
      }

      if (target.status !== "announced") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            target.status === "open"
              ? "Registration is open — you can sign up properly now."
              : "This hackathon is no longer collecting interest.",
        });
      }

      const values = {
        school: blankToNull(input.school),
        country: blankToNull(input.country),
        graduationYear: input.graduationYear ?? null,
        experience: input.experience ?? null,
      };

      await db
        .insert(hackathonInterest)
        .values({
          hackathonId: input.hackathonId,
          userId: ctx.userId,
          ...values,
        })
        .onConflictDoUpdate({
          target: [hackathonInterest.hackathonId, hackathonInterest.userId],
          set: { ...values, updatedAt: new Date() },
        });

      return { onList: true };
    }),

  /** Leaving the list. Idempotent, so a second click is not an error. */
  withdrawInterest: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await (ctx.db as DrizzleDB)
        .delete(hackathonInterest)
        .where(
          and(
            eq(hackathonInterest.hackathonId, input.hackathonId),
            eq(hackathonInterest.userId, ctx.userId),
          ),
        );
      return { onList: false };
    }),

  /**
   * How many people are waiting to be told registration opened, and how many
   * already were — so the admin screen can offer the send, and say what it
   * would do, before anything leaves.
   */
  registrationOpenEmailStatus: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const [counts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          sent: sql<number>`count(${hackathonInterest.registrationOpenEmailSentAt})::int`,
        })
        .from(hackathonInterest)
        .innerJoin(users, eq(users.id, hackathonInterest.userId))
        .where(
          and(
            eq(hackathonInterest.hackathonId, input.hackathonId),
            isNotNull(users.email),
          ),
        );

      const total = counts?.total ?? 0;
      const sent = counts?.sent ?? 0;
      return { total, sent, pending: total - sent };
    }),

  /**
   * Tells the interest list that registration opened.
   *
   * The list exists for this one moment and nothing sent it — organisers had to
   * hand-compose an announcement, and the runbook said so. Marked per recipient
   * before the next one is attempted, so a closed tab, a timeout or an
   * impatient second click resumes rather than mailing anyone twice.
   */
  notifyRegistrationOpen: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        /** Where the CTA points. Defaults to the public funnel page. */
        registerUrl: z.string().url().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { id: true, name: true, status: true },
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      // Telling the list to go and register while registration is shut is the
      // one failure this message cannot recover from — everyone who acts on it
      // lands on a closed page.
      if (hackathon.status !== "open" && hackathon.status !== "in_progress") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Registration is not open for this hackathon yet, so there is nothing to announce.",
        });
      }

      const pending = await db
        .select({
          id: hackathonInterest.id,
          email: users.email,
        })
        .from(hackathonInterest)
        .innerJoin(users, eq(users.id, hackathonInterest.userId))
        .where(
          and(
            eq(hackathonInterest.hackathonId, input.hackathonId),
            isNull(hackathonInterest.registrationOpenEmailSentAt),
            isNotNull(users.email),
          ),
        )
        .orderBy(asc(hackathonInterest.id))
        .limit(MAX_RECIPIENTS_PER_CALL);

      const { sendRegistrationOpenEmail } = await import("@query/auth/email");

      let sent = 0;
      const failed: string[] = [];

      for (const row of pending) {
        if (!row.email) continue;
        try {
          await sendRegistrationOpenEmail({
            email: row.email,
            hackathonName: hackathon.name,
            registerUrl: input.registerUrl,
          });

          // Stamped immediately after the send, not in a batch at the end: a
          // crash half-way through otherwise re-mails everyone already reached.
          await db
            .update(hackathonInterest)
            .set({ registrationOpenEmailSentAt: new Date() })
            .where(eq(hackathonInterest.id, row.id));

          sent++;
        } catch (error) {
          failed.push(row.email);
          // Deliberate server-side operational logging: this is the only record
          // of which address the provider rejected.
          // eslint-disable-next-line no-console
          console.error(
            `[Email Service] Registration-open notice failed for ${row.email}:`,
            error,
          );
        }
      }

      return {
        sent,
        failed,
        // Anything left is either a further batch or an address that failed.
        done: pending.length < MAX_RECIPIENTS_PER_CALL,
      };
    }),

  /**
   * The list itself, for staff. Joined to `user` rather than storing a copy of
   * the email, so a person who changes their address stays reachable.
   */
  listInterest: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return (ctx.db as DrizzleDB)
        .select({
          userId: hackathonInterest.userId,
          name: users.name,
          email: users.email,
          school: hackathonInterest.school,
          country: hackathonInterest.country,
          graduationYear: hackathonInterest.graduationYear,
          experience: hackathonInterest.experience,
          createdAt: hackathonInterest.createdAt,
        })
        .from(hackathonInterest)
        .innerJoin(users, eq(users.id, hackathonInterest.userId))
        .where(eq(hackathonInterest.hackathonId, input.hackathonId))
        .orderBy(desc(hackathonInterest.createdAt))
        .limit(5000);
    }),
});
