import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
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

/**
 * The edition the landing page is about: announced, not yet open. Soonest
 * first, so announcing the year after next does not displace the one being
 * promoted now.
 */
async function findAnnounced(db: DrizzleDB) {
  return db.query.hackathons.findFirst({
    where: and(
      eq(hackathons.status, "announced"),
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
