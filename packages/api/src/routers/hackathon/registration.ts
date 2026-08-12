import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import { CacheKeys } from "../../middleware/cache";
import {
  hackathons,
  hackathonParticipants,
  members,
} from "@query/db";
import { eq, and, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

/**
 * Postgres unique_violation on unique_participant_per_hackathon — a second
 * submission of the same form. Drizzle wraps every driver error in a
 * DrizzleQueryError whose own `code` is undefined and whose message is only the
 * failed SQL; the pg error carrying the SQLSTATE sits on `.cause`, so the chain
 * has to be walked rather than the top-level object inspected.
 */
const isDuplicateRegistration = (error: unknown) => {
  for (let cursor: unknown = error, depth = 0; cursor && depth < 5; depth++) {
    if (typeof cursor !== "object") break;
    const candidate = cursor as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (candidate.code === "23505") return true;
    if (candidate.constraint === "unique_participant_per_hackathon")
      return true;
    if (candidate.message?.includes("unique_participant_per_hackathon"))
      return true;
    cursor = candidate.cause;
  }
  return false;
};

export const hackathonRegistrationRouter = createTRPCRouter({
  register: protectedProcedure
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        // Personal info
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        phone: z.string().min(1).max(30),
        age: z.number().int().min(13).max(120),
        gender: z.string().max(50).optional(),
        pronouns: z.string().max(50).optional(),
        race: z.string().max(100).optional(),
        underrepresented: z.boolean().optional(),
        // Academic info
        school: z.string().min(1).max(300),
        major: z.string().min(1).max(300),
        graduationYear: z.number().int().min(2020).max(2035),
        levelOfStudy: z.enum([
          "Freshman",
          "Sophomore",
          "Junior",
          "Senior",
          "Graduate",
          "PhD",
          "Other",
        ]),
        country: z.string().min(1).max(100),
        firstGeneration: z.boolean().optional(),
        // Experience
        hackathonsAttended: z.number().int().min(0).max(100).optional(),
        resumeUrl: z.string().url().max(500).optional().or(z.literal("")),
        linkedinUrl: z.string().url().max(500).optional().or(z.literal("")),
        githubUrl: z.string().url().max(500).optional().or(z.literal("")),
        whyAttend: z
          .string()
          .trim()
          .min(1, "Tell us why you want to attend")
          .max(2000),
        // Logistics
        shirtSize: z.enum(["XS", "S", "M", "L", "XL", "XXL"]).optional(),
        dietaryRestrictions: z.array(z.string().max(100)).max(10).optional(),
        emergencyContact: z.string().max(200).optional(),
        emergencyPhone: z.string().max(20).optional(),
        needsHardware: z.boolean().optional(),
        // Consent
        agreeToCodeOfConduct: z
          .boolean()
          .refine((v) => v === true, {
            message: "You must agree to the Code of Conduct",
          }),
        mlhCodeOfConduct: z.boolean().optional(),
        mlhDataSharing: z.boolean().optional(),
        mlhInformationalEmails: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { participant, hackathonName } = await (
          ctx.db as DrizzleDB
        ).transaction(async (tx) => {
          const hackathon = await tx.query.hackathons.findFirst({
            where: eq(hackathons.id, input.hackathonId),
          });

          if (!hackathon) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Hackathon not found",
            });
          }

          if (hackathon.status !== "open") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Registration is not open for this hackathon",
            });
          }

          if (
            hackathon.registrationDeadline &&
            new Date() > hackathon.registrationDeadline
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Registration deadline has passed",
            });
          }

          const existingParticipant =
            await tx.query.hackathonParticipants.findFirst({
              where: and(
                eq(hackathonParticipants.hackathonId, input.hackathonId),
                eq(hackathonParticipants.userId, ctx.userId as string),
              ),
            });

          if (existingParticipant) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "You are already registered for this hackathon",
            });
          }

          // Nothing is locked yet, so this only turns away a form submitted
          // against an event that was already visibly full; the seat itself is
          // claimed and checked below.
          if (
            hackathon.maxParticipants &&
            hackathon.currentParticipants >= hackathon.maxParticipants
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This hackathon is full",
            });
          }

          // A membership is annual and edition-independent, so it is keyed on
          // the person alone; the edition clause used to be here and made a
          // paying member read as a non-member the moment a new edition opened.
          const member = await tx.query.members.findFirst({
            where: eq(members.userId, ctx.userId as string),
          });

          /**
           * Claiming the seat before inserting anything is what makes capacity
           * hold across processes: this statement takes the hackathon row's
           * exclusive lock, so a registration racing for the same last seat
           * blocks here and, once we commit, re-runs `+ 1` against the count we
           * wrote rather than against the snapshot it read above. Reading the
           * row back inside the same transaction therefore gives the seat this
           * registration actually holds, and going over the limit rolls the
           * whole claim back. It also keeps admin.ts's recount honest — that
           * path locks the same row first, so it cannot count participants
           * while a half-finished registration is in flight.
           */
          await tx
            .update(hackathons)
            .set({
              currentParticipants: sql`${hackathons.currentParticipants} + 1`,
            })
            .where(eq(hackathons.id, input.hackathonId));

          const claimed = await tx.query.hackathons.findFirst({
            where: eq(hackathons.id, input.hackathonId),
            columns: { currentParticipants: true, maxParticipants: true },
          });

          if (
            claimed?.maxParticipants &&
            claimed.currentParticipants > claimed.maxParticipants
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This hackathon is full",
            });
          }

          const [participant] = await tx
            .insert(hackathonParticipants)
            .values({
              hackathonId: input.hackathonId,
              userId: ctx.userId as string,
              memberId: member?.id,
              // Personal
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              age: input.age,
              gender: input.gender,
              pronouns: input.pronouns,
              race: input.race,
              underrepresented: input.underrepresented,
              // Academic
              school: input.school,
              major: input.major,
              graduationYear: input.graduationYear,
              levelOfStudy: input.levelOfStudy,
              country: input.country,
              firstGeneration: input.firstGeneration,
              // Experience
              hackathonsAttended: input.hackathonsAttended,
              resumeUrl: input.resumeUrl || undefined,
              linkedinUrl: input.linkedinUrl || undefined,
              githubUrl: input.githubUrl || undefined,
              whyAttend: input.whyAttend,
              // Logistics
              shirtSize: input.shirtSize,
              dietaryRestrictions: input.dietaryRestrictions || [],
              emergencyContact: input.emergencyContact,
              emergencyPhone: input.emergencyPhone,
              needsHardware: input.needsHardware,
              // Consent
              agreeToCodeOfConduct: input.agreeToCodeOfConduct,
              mlhCodeOfConduct: input.mlhCodeOfConduct,
              mlhDataSharing: input.mlhDataSharing,
              mlhInformationalEmails: input.mlhInformationalEmails,
              registrationStatus: "pending",
            })
            .returning();

          return { participant, hackathonName: hackathon.name };
        });

        // Invalidate what this registration changed, once it has committed: the
        // hackathon's seat count and roster, and this user's own list. Anything
        // broader takes every other user's cached hackathon data down with it.
        // getById is reachable by id or by name and caches under whichever was
        // asked for, so the name-keyed copy of the seat count has to go too.
        ctx.cache.delete(CacheKeys.hackathon(input.hackathonId));
        ctx.cache.delete(CacheKeys.hackathon(hackathonName));
        ctx.cache.delete(`hackathon:${input.hackathonId}:participants`);
        ctx.cache.delete(`hackathon:registrations:${ctx.userId as string}`);

        return participant;
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
        if (isDuplicateRegistration(error)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You are already registered for this hackathon",
          });
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        // Unexpected error during registration
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Registration failed: ${message}`,
        });
      }
    }),


  myRegistrations: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = `hackathon:registrations:${ctx.userId}`;
    const cached = ctx.cache.get<typeof registrations>(cacheKey);
    if (cached) return cached;

    const registrations = await (
      ctx.db as DrizzleDB
    ).query.hackathonParticipants.findMany({
      where: eq(hackathonParticipants.userId, ctx.userId as string),
      with: {
        hackathon: true,
        team: {
          with: {
            // submittedById names the teammate who filed a solo entry, and a
            // participant id is the entire content of that person's event pass
            // QR — a teammate does not need it to see the submission.
            projects: { columns: { submittedById: false } },
          },
        },
      },
      orderBy: (hackathonParticipants, { desc }) => [
        desc(hackathonParticipants.registeredAt),
      ],
    });

    ctx.cache.set(cacheKey, registrations, 30);
    return registrations;
  }),


  participants: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:participants`;
      const cached = ctx.cache.get<typeof participants>(cacheKey);
      if (cached) return cached;

      const participants = await (
        ctx.db as DrizzleDB
      ).query.hackathonParticipants.findMany({
        where: eq(hackathonParticipants.hackathonId, input.hackathonId),
        // Anyone can read this roster, so it carries neither the decision made
        // on each application — registrationStatus names everyone who was
        // rejected or waitlisted — nor the participant id, which is the entire
        // content of that participant's event pass QR and would let a stranger
        // enumerate passes for the whole event.
        // The joined `user` relation below is the public identity; the raw
        // userId adds nothing a caller needs and only widens what a scrape of
        // this endpoint yields.
        columns: {
          hackathonId: true,
          teamId: true,
        },
        // A public list has to be bounded rather than handing out the whole
        // attendee table per request; staff read it all via adminGetAttendees.
        limit: 500,
        orderBy: (participants, { asc }) => [asc(participants.registeredAt)],
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
          team: true,
        },
      });

      ctx.cache.set(cacheKey, participants, 60);

      return participants;
    }),

});
