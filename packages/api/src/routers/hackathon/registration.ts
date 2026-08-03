import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import {
  hackathons,
  hackathonParticipants,
  members,
} from "@query/db";
import { eq, and, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

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
        whyAttend: z.string().max(2000).optional(),
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
        return await (ctx.db as DrizzleDB).transaction(async (tx) => {
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

          if (
            hackathon.maxParticipants &&
            hackathon.currentParticipants >= hackathon.maxParticipants
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This hackathon is full",
            });
          }

          const member = await tx.query.members.findFirst({
            where: and(
              eq(members.userId, ctx.userId as string),
              eq(members.hackathonId, input.hackathonId),
            ),
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

          await tx
            .update(hackathons)
            .set({
              currentParticipants: sql`${hackathons.currentParticipants} + 1`,
            })
            .where(eq(hackathons.id, input.hackathonId));

          // Invalidate all hackathon caches after successful registration
          ctx.cache.deletePattern("hackathon*");

          return participant;
        });
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
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
            projects: true,
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
        columns: {
          id: true,
          hackathonId: true,
          userId: true,
          teamId: true,
          registrationStatus: true,
        },
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
