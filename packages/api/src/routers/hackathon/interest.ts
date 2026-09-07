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
import { hackathonInterest, hackathons, users } from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../../trpc";
import { isAdmin } from "../../middleware/procedures";
import { rateLimit } from "../../middleware/security";
import { VOLATILE_TTL } from "../../middleware/cache";

// The interest list for an edition announced but not yet taking
// registrations. Its own table rather than a participant row with a new
// status: an interested person has agreed to nothing, and putting them in the
// participants table would have every count, export and capacity check treat
// them as a registration. Converting is a staff decision, not a default.

const interestInput = z.object({
  hackathonId: z.string().uuid(),
  school: z.string().trim().max(200).optional(),
  // Free text, not a country enum. The hackathon is global and a dropdown
  // missing somebody's country is a worse failure than an untidy string.
  country: z.string().trim().max(100).optional(),
  graduationYear: z.number().int().min(1900).max(2100).nullable().optional(),
  experience: z.enum(["first", "one_or_two", "three_plus"]).optional(),
});

const blankToNull = (value: string | undefined) =>
  value && value.length > 0 ? value : null;

// Recipients per request — one SMTP round trip each, and more than this does
// not finish inside Cloud Run's timeout. Matches announce.ts.
const MAX_RECIPIENTS_PER_CALL = 500;

// Same reasoning as announce.ts: a claim this old belonged to a batch that
// died, and must be reclaimable or the send can never finish.
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

// The edition the landing page is about. `open` and `in_progress` belong here
// too: /hacklytics is the only public entrance, so filtering to `announced`
// meant that the moment registration opened, the one page telling the world
// about the hackathon said "Nothing announced yet". Soonest first, so
// announcing the year after next does not displace the one being promoted.
const PUBLIC_FUNNEL_STATUSES = ["announced", "open", "in_progress"] as const;

/** What the landing page reads; also the shape held in the cache. */
type UpcomingEdition = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  startDate: Date;
  endDate: Date;
  theme: string | null;
  websiteUrl: string | null;
  status: string;
  registrationOpen: boolean;
  registrationDeadline: Date | null;
};

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
  // Public: the coming-soon page has to render for somebody who has never
  // signed in — that visitor is the entire audience for it.
  getUpcoming: publicProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB | null;
    if (!db) return null;

    // The landing page is the funnel, so this is the most-read query on the site
    // and its answer changes about twice a year. Keyed under `hackathons:` so the
    // eviction every edition write already runs clears it too. getOrSet, so the
    // empty case caches as well: it used to be skipped because a stored null was
    // indistinguishable from a miss, and between editions — most of the year —
    // empty is the answer the funnel keeps asking for.
    return ctx.cache.getOrSet<UpcomingEdition | null>(
      "hackathons:upcoming",
      async () => {
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
          // The page shows an interest form or a register CTA off this: the two states
          // are the same edition at different moments, not different pages.
          status: upcoming.status,
          // Exactly what `register` accepts. It refuses any status but `open` and
          // refuses a passed deadline, so reporting `in_progress` as open put a
          // Register button on the funnel that failed for everyone who pressed it.
          registrationOpen:
            upcoming.status === "open" &&
            (!upcoming.registrationDeadline ||
              new Date() <= upcoming.registrationDeadline),
          registrationDeadline: upcoming.registrationDeadline,
        };
      },
      // Short TTL, because registrationOpen is time-dependent: the deadline can
      // pass while an entry is live, and five seconds bounds how long the page
      // can offer a Register button the server would refuse.
      VOLATILE_TTL,
    );
  }),

  /** Whether the caller is already on the list, and what they told us. */
  myInterest: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await (ctx.db as DrizzleDB).query.hackathonInterest.findFirst(
        {
          where: and(
            eq(hackathonInterest.hackathonId, input.hackathonId),
            eq(hackathonInterest.userId, ctx.userId),
          ),
        },
      );
      return row ?? null;
    }),

  // Upserted, so submitting twice edits one entry rather than failing on the
  // unique index or quietly creating a second. Somebody correcting their
  // graduation year should not have to find a delete button.
  registerInterest: protectedProcedure
    .input(interestInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      // Editing your answers is normal; hammering the upsert is not. Per user,
      // since the row is keyed that way and an IP is shared by a whole campus.
      const limit = rateLimit(`interest:${ctx.userId}`, 20, 0.05);
      if (!limit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many changes. Try again in a minute.",
        });
      }

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

  // How many people are waiting to be told registration opened, and how many
  // already were — so the admin screen can say what the send would do first.
  registrationOpenEmailStatus: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const [counts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          sent: sql<number>`count(${hackathonInterest.registrationOpenEmailSentAt})::int`,
          failed: sql<number>`count(${hackathonInterest.registrationOpenEmailFailedAt})::int`,
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
      const failed = counts?.failed ?? 0;
      return { total, sent, failed, pending: total - sent - failed };
    }),

  // Tells the interest list that registration opened. The list exists for this
  // one moment and nothing sent it. Marked per recipient before the next is
  // attempted, so a closed tab or an impatient second click resumes rather than
  // mailing anyone twice.
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

      // Telling the list to go and register while registration is shut is the one
      // failure this message cannot recover from — everyone who acts on it lands on
      // a closed page.
      if (hackathon.status !== "open" && hackathon.status !== "in_progress") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Registration is not open for this hackathon yet, so there is nothing to announce.",
        });
      }

      // Claim before sending, exactly as announce.ts does. Reading the pending rows
      // and marking them afterwards left a window where two overlapping requests
      // both selected the same people and both mailed them. The claim is one atomic
      // UPDATE; a claim older than CLAIM_TIMEOUT_MS is reclaimable.
      const claimCutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS);

      const claimable = db
        .select({ id: hackathonInterest.id })
        .from(hackathonInterest)
        .innerJoin(users, eq(users.id, hackathonInterest.userId))
        .where(
          and(
            eq(hackathonInterest.hackathonId, input.hackathonId),
            isNull(hackathonInterest.registrationOpenEmailSentAt),
            isNull(hackathonInterest.registrationOpenEmailFailedAt),
            or(
              isNull(hackathonInterest.registrationOpenEmailClaimedAt),
              lt(hackathonInterest.registrationOpenEmailClaimedAt, claimCutoff),
            ),
            isNotNull(users.email),
          ),
        )
        .orderBy(asc(hackathonInterest.id))
        .limit(MAX_RECIPIENTS_PER_CALL);

      const claimed = await db
        .update(hackathonInterest)
        .set({ registrationOpenEmailClaimedAt: new Date() })
        .where(inArray(hackathonInterest.id, claimable))
        .returning({
          id: hackathonInterest.id,
          userId: hackathonInterest.userId,
        });

      // The address is read from the users table so somebody who changed it still
      // gets the mail; the claim above is keyed on the interest row.
      const recipients = await db
        .select({ id: hackathonInterest.id, email: users.email })
        .from(hackathonInterest)
        .innerJoin(users, eq(users.id, hackathonInterest.userId))
        .where(
          inArray(
            hackathonInterest.id,
            claimed.map((row) => row.id),
          ),
        );

      const pending = claimed.length > 0 ? recipients : [];

      const { sendRegistrationOpenEmail } = await import("@query/auth/email");

      let sent = 0;
      const failed: string[] = [];

      // Same fan-out as the other two send sites: the SMTP pool holds five
      // connections and a one-at-a-time batch used one of them.
      await forEachWithConcurrency(pending, emailConcurrency(), async (row) => {
        if (!row.email) return;
        try {
          await sendRegistrationOpenEmail({
            email: row.email,
            hackathonName: hackathon.name,
            registerUrl: input.registerUrl,
          });

          // Stamped immediately after the send, not batched at the end: a crash
          // half-way through otherwise re-mails everyone already reached.
          await db
            .update(hackathonInterest)
            .set({ registrationOpenEmailSentAt: new Date() })
            .where(eq(hackathonInterest.id, row.id));

          sent++;
        } catch (error) {
          failed.push(row.email);
          // Marked failed rather than left pending. Left pending, a permanently bad
          // address is re-attempted every batch and the send never reports finished.
          await db
            .update(hackathonInterest)
            .set({ registrationOpenEmailFailedAt: new Date() })
            .where(eq(hackathonInterest.id, row.id));
          // Deliberate operational logging: the only record of which address the
          // provider rejected.
          // eslint-disable-next-line no-console
          console.error(
            `[Email Service] Registration-open notice failed for ${row.email}:`,
            error,
          );
        }
      });

      // Counted, not inferred from the batch size. `pending.length < MAX` reported
      // "done" while recipients that had just failed were still unsent.
      const [remaining] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(hackathonInterest)
        .innerJoin(users, eq(users.id, hackathonInterest.userId))
        .where(
          and(
            eq(hackathonInterest.hackathonId, input.hackathonId),
            isNull(hackathonInterest.registrationOpenEmailSentAt),
            isNull(hackathonInterest.registrationOpenEmailFailedAt),
            isNotNull(users.email),
          ),
        );

      return {
        sent,
        failed,
        remaining: remaining?.count ?? 0,
        done: (remaining?.count ?? 0) === 0,
      };
    }),

  // The list itself, for staff. Joined to `user` rather than storing a copy of
  // the email, so a person who changes their address stays reachable.
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

  // How many people asked to be told about THIS edition. The admin card used
  // to show currentParticipants (registrations), which is zero while the
  // event is announced — so a live interest list looked unlinked.
  interestCount: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await (ctx.db as DrizzleDB)
        .select({ count: sql<number>`count(*)::int` })
        .from(hackathonInterest)
        .where(eq(hackathonInterest.hackathonId, input.hackathonId));
      return row?.count ?? 0;
    }),
});
