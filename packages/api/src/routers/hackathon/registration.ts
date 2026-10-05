import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import { notHackathonBanned } from "../../middleware/procedures";
import { CacheKeys } from "../../middleware/cache";
import {
  hackathons,
  hackathonParticipants,
  hackathonProjects,
  members,
} from "@query/db";
import { eq, and, isNull, ne } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { assertHackathonVisible } from "./visibility";
import { evictParticipantCaches, syncCurrentParticipants } from "./admin";

// Postgres unique_violation on hackathon_participant_hackathon_user_idx — a second
// submission of the same form. Drizzle wraps every driver error in a
// DrizzleQueryError whose own `code` is undefined; the pg error carrying the
// SQLSTATE sits on `.cause`, so the chain has to be walked.
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
    if (candidate.constraint === "hackathon_participant_hackathon_user_idx")
      return true;
    if (candidate.message?.includes("hackathon_participant_hackathon_user_idx"))
      return true;
    cursor = candidate.cause;
  }
  return false;
};

export const hackathonRegistrationRouter = createTRPCRouter({
  register: notHackathonBanned
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
        // Relative to now: a fixed 2020-2035 accepted years already past and
        // would start refusing real students in 2036.
        graduationYear: z
          .number()
          .int()
          .min(new Date().getFullYear() - 1)
          .max(new Date().getFullYear() + 8),
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

          // No seat is claimed here: capacity counts accepted people, not
          // applications, so applying is never refused for being full. The
          // seat is taken when an organiser accepts (admin.ts assertSeats).
          // A membership is annual and edition-independent, so it is keyed on the
          // person alone; the edition clause used to be here and made a paying member
          // read as a non-member the moment a new edition opened.
          const member = await tx.query.members.findFirst({
            where: eq(members.userId, ctx.userId as string),
          });

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

        // Invalidate what this registration changed, once committed: the hackathon's
        // seat count and roster, and this user's own list. Anything broader takes
        // every other user's cached hackathon data down with it. getById caches under
        // whichever of id or name was asked for, so the name-keyed copy goes too.
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
        // Unexpected error during registration
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Registration failed.",
          cause: error,
        });
      }
    }),


  // Takes back your own registration. There was no way out at all, so an
  // accepted no-show kept a seat for good. Refused once you are part of the
  // event — on a team, checked in, or with a project — since undoing any of
  // those affects other people and is an organiser's call.
  withdrawRegistration: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const participant = await db.query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.hackathonId, input.hackathonId),
          eq(hackathonParticipants.userId, ctx.userId as string),
        ),
        columns: { id: true, teamId: true, registrationStatus: true },
      });

      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not registered for this hackathon.",
        });
      }

      // A finished event's registrations are its record of who took part.
      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { status: true },
      });
      if (
        hackathon?.status === "completed" ||
        hackathon?.status === "cancelled"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This hackathon is over, so registrations can't be withdrawn.",
        });
      }

      if (participant.registrationStatus === "checked_in") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You have already checked in. Ask an organiser if you need to leave the event.",
        });
      }
      if (participant.teamId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Leave your team first, then withdraw.",
        });
      }

      const project = await db.query.hackathonProjects.findFirst({
        where: and(
          eq(hackathonProjects.hackathonId, input.hackathonId),
          eq(hackathonProjects.submittedById, participant.id),
        ),
        columns: { id: true },
      });
      if (project) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Withdraw your project first, then your registration.",
        });
      }

      // The checks above are a read; a badge scan or a team join can land
      // before this. Repeating them here deletes nothing in that case.
      const removed = await db
        .delete(hackathonParticipants)
        .where(
          and(
            eq(hackathonParticipants.id, participant.id),
            ne(hackathonParticipants.registrationStatus, "checked_in"),
            isNull(hackathonParticipants.teamId),
          ),
        )
        .returning({ id: hackathonParticipants.id });
      if (removed.length === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Your registration changed just now. Refresh the page and try again.",
        });
      }

      // An accepted withdrawal frees a seat for the next wave.
      await syncCurrentParticipants(db, input.hackathonId);

      evictParticipantCaches(ctx.cache, input.hackathonId, [
        ctx.userId as string,
      ]);

      return { success: true };
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
            // submittedById names the teammate who filed a solo entry, and a participant
            // id is the entire content of that person's event pass QR — a teammate does
            // not need it to see the submission.
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
      // Public, so it answers to the same visibility rule as the schedule and
      // gallery: a draft edition's roster is staff-only.
      await assertHackathonVisible(ctx, input.hackathonId);

      const cacheKey = `hackathon:${input.hackathonId}:participants`;
      const cached = ctx.cache.get<typeof participants>(cacheKey);
      if (cached) return cached;

      const participants = await (
        ctx.db as DrizzleDB
      ).query.hackathonParticipants.findMany({
        where: eq(hackathonParticipants.hackathonId, input.hackathonId),
        // Anyone can read this roster, so it carries neither the decision made on
        // each application (registrationStatus names everyone rejected or waitlisted)
        // nor the participant id, which is the whole content of that participant's
        // event pass QR and would let a stranger enumerate passes for the event. The
        // joined `user` relation is the public identity; the raw userId adds nothing.
        columns: {
          hackathonId: true,
          teamId: true,
        },
        // A public list has to be bounded rather than handing out the whole attendee
        // table per request; staff read it all via adminGetAttendees.
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
