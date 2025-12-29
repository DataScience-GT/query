import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import {
  hackathons,
  hackathonParticipants,
  hackathonTeams,
  hackathonProjects,
  members,
} from "@query/db";
import { eq, and, gte, sql } from "drizzle-orm";

export const hackathonRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        status: z.enum(["draft", "open", "closed", "in_progress", "completed", "cancelled"]).optional(),
        upcoming: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      const allHackathons = await ctx.db.query.hackathons.findMany({
        where: and(
          eq(hackathons.isPublic, true),
          input.status ? eq(hackathons.status, input.status) : undefined,
          input.upcoming ? gte(hackathons.startDate, now) : undefined
        ),
        limit: input.limit,
        offset: input.offset,
        orderBy: (hackathons, { desc }) => [desc(hackathons.startDate)],
      });

      return allHackathons;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const hackathon = await ctx.db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.id),
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      return hackathon;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        location: z.string().max(500).optional(),
        startDate: z.date(),
        endDate: z.date(),
        registrationDeadline: z.date().optional(),
        maxParticipants: z.number().int().positive().max(10000).optional(),
        prizes: z.array(
          z.object({
            place: z.string().max(50),
            amount: z.number().nonnegative(),
            description: z.string().max(500).optional(),
          })
        ).max(20).optional(),
        rules: z.string().max(10000).optional(),
        theme: z.string().max(200).optional(),
        websiteUrl: z.string().url().max(500).optional(),
      }).refine(data => data.endDate > data.startDate, {
        message: "End date must be after start date",
      }).refine(data => !data.registrationDeadline || data.registrationDeadline <= data.startDate, {
        message: "Registration deadline must be before start date",
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [newHackathon] = await ctx.db
        .insert(hackathons)
        .values({
          ...input,
          status: "draft",
        })
        .returning();

      return newHackathon;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid("Invalid hackathon ID"),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        location: z.string().max(500).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        registrationDeadline: z.date().optional(),
        maxParticipants: z.number().int().positive().max(10000).optional(),
        status: z.enum(["draft", "open", "closed", "in_progress", "completed", "cancelled"]).optional(),
        prizes: z.array(
          z.object({
            place: z.string().max(50),
            amount: z.number().nonnegative(),
            description: z.string().max(500).optional(),
          })
        ).max(20).optional(),
        rules: z.string().max(10000).optional(),
        theme: z.string().max(200).optional(),
        websiteUrl: z.string().url().max(500).optional(),
        isPublic: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Verify hackathon exists
      const existing = await ctx.db.query.hackathons.findFirst({
        where: eq(hackathons.id, id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      const [updatedHackathon] = await ctx.db
        .update(hackathons)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(hackathons.id, id))
        .returning();

      return updatedHackathon;
    }),

  register: protectedProcedure
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        shirtSize: z.enum(["XS", "S", "M", "L", "XL", "XXL"]).optional(),
        dietaryRestrictions: z.array(z.string().max(100)).max(10).optional(),
        emergencyContact: z.string().max(200).optional(),
        emergencyPhone: z.string().max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Use transaction to prevent race conditions
      return await ctx.db.transaction(async (tx) => {
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

        const existingParticipant = await tx.query.hackathonParticipants.findFirst({
          where: and(
            eq(hackathonParticipants.hackathonId, input.hackathonId),
            eq(hackathonParticipants.userId, ctx.userId!)
          ),
        });

        if (existingParticipant) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You are already registered for this hackathon",
          });
        }

        if (hackathon.maxParticipants && hackathon.currentParticipants >= hackathon.maxParticipants) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This hackathon is full",
          });
        }

        const member = await tx.query.members.findFirst({
          where: eq(members.userId, ctx.userId!),
        });

        const [participant] = await tx
          .insert(hackathonParticipants)
          .values({
            hackathonId: input.hackathonId,
            userId: ctx.userId!,
            memberId: member?.id,
            shirtSize: input.shirtSize,
            dietaryRestrictions: input.dietaryRestrictions || [],
            emergencyContact: input.emergencyContact,
            emergencyPhone: input.emergencyPhone,
            registrationStatus: "approved",
          })
          .returning();

        await tx
          .update(hackathons)
          .set({
            currentParticipants: sql`${hackathons.currentParticipants} + 1`,
          })
          .where(eq(hackathons.id, input.hackathonId));

        return participant;
      });
    }),

  myRegistrations: protectedProcedure.query(async ({ ctx }) => {
    const registrations = await ctx.db.query.hackathonParticipants.findMany({
      where: eq(hackathonParticipants.userId, ctx.userId!),
      with: {
        hackathon: true,
        team: true,
      },
      orderBy: (hackathonParticipants, { desc }) => [desc(hackathonParticipants.registeredAt)],
    });

    return registrations;
  }),

  participants: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const participants = await ctx.db.query.hackathonParticipants.findMany({
        where: eq(hackathonParticipants.hackathonId, input.hackathonId),
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

      return participants;
    }),

  createTeam: protectedProcedure
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        name: z.string().min(1).max(100),
        description: z.string().max(1000).optional(),
        maxMembers: z.number().int().min(1).max(10).default(4),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx) => {
        const participant = await tx.query.hackathonParticipants.findFirst({
          where: and(
            eq(hackathonParticipants.hackathonId, input.hackathonId),
            eq(hackathonParticipants.userId, ctx.userId!)
          ),
        });

        if (!participant) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You must be registered for this hackathon to create a team",
          });
        }

        if (participant.teamId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You are already part of a team",
          });
        }

        const [newTeam] = await tx
          .insert(hackathonTeams)
          .values({
            hackathonId: input.hackathonId,
            name: input.name,
            description: input.description,
            maxMembers: input.maxMembers,
            currentMembers: 1,
            captainId: ctx.userId!,
          })
          .returning();

        if (!newTeam) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create team",
          });
        }

        await tx
          .update(hackathonParticipants)
          .set({ teamId: newTeam.id })
          .where(eq(hackathonParticipants.id, participant.id));

        return newTeam;
      });
    }),

  projects: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const projects = await ctx.db.query.hackathonProjects.findMany({
        where: eq(hackathonProjects.hackathonId, input.hackathonId),
        with: {
          team: {
            with: {
              participants: {
                with: {
                  user: {
                    columns: {
                      id: true,
                      name: true,
                      image: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: (hackathonProjects, { desc }) => [desc(hackathonProjects.submittedAt)],
      });

      return projects;
    }),
});