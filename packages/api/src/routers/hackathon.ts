import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import {
  hackathons,
  hackathonParticipants,
  hackathonTeams,
  hackathonProjects,
  members,
  hackathonEvents,
  hackathonEventAttendees,
} from "@query/db";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { CacheKeys } from "../middleware/cache";
import { isAdmin } from "../middleware/procedures";

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
      const cacheKey = `hackathons:list:${input.status || 'all'}:${input.upcoming ? 'upcoming' : 'all'}:${input.limit}:${input.offset}`;

      // Check cache first
      const cached = ctx.cache.get<typeof allHackathons>(cacheKey);
      if (cached) return cached;

      const now = new Date();

      const allHackathons = await ctx.db!.query.hackathons.findMany({
        where: and(
          eq(hackathons.isPublic, true),
          input.status ? eq(hackathons.status, input.status) : undefined,
          input.upcoming ? gte(hackathons.startDate, now) : undefined
        ),
        limit: input.limit,
        offset: input.offset,
        orderBy: (hackathons, { desc }) => [desc(hackathons.startDate)],
      });

      ctx.cache.set(cacheKey, allHackathons, 60);

      return allHackathons;
    }),

  listAll: isAdmin
    .query(async ({ ctx }) => {
      return await ctx.db!.query.hackathons.findMany({
        orderBy: (hackathons, { desc }) => [desc(hackathons.startDate)],
      });
    }),


  getById: publicProcedure
    .input(z.object({ id: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      // Check cache first
      const cacheKey = CacheKeys.hackathon(input.id);
      const cached = ctx.cache.get<typeof hackathon>(cacheKey);
      if (cached) return cached;

      const hackathon = await ctx.db!.query.hackathons.findFirst({
        where: eq(hackathons.id, input.id),
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      ctx.cache.set(cacheKey, hackathon, 120);

      return hackathon;
    }),

  create: isAdmin
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
      const [newHackathon] = await ctx.db!
        .insert(hackathons)
        .values({
          ...input,
          status: "draft",
        })
        .returning();

      ctx.cache.deletePattern('hackathons:*');

      return newHackathon;
    }),

  update: isAdmin
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

      const existing = await ctx.db!.query.hackathons.findFirst({
        where: eq(hackathons.id, id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found",
        });
      }

      const [updatedHackathon] = await ctx.db!
        .update(hackathons)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(hackathons.id, id))
        .returning();

      ctx.cache.delete(CacheKeys.hackathon(id));
      ctx.cache.deletePattern('hackathons:*');

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
      return await ctx.db!.transaction(async (tx) => {
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
    const registrations = await ctx.db!.query.hackathonParticipants.findMany({
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
      const cacheKey = `hackathon:${input.hackathonId}:participants`;
      const cached = ctx.cache.get<typeof participants>(cacheKey);
      if (cached) return cached;

      const participants = await ctx.db!.query.hackathonParticipants.findMany({
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
      return await ctx.db!.transaction(async (tx) => {
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
      const cacheKey = `hackathon:${input.hackathonId}:projects`;
      const cached = ctx.cache.get<typeof projects>(cacheKey);
      if (cached) return cached;

      const projects = await ctx.db!.query.hackathonProjects.findMany({
        where: eq(hackathonProjects.hackathonId, input.hackathonId),
        with: {
          team: {
            with: {
              participants: {
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
                },
              },
            },
          },
        },
        orderBy: (hackathonProjects, { desc }) => [desc(hackathonProjects.submittedAt)],
      });

      ctx.cache.set(cacheKey, projects, 120);

      return projects;
    }),

  listTeams: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const teams = await ctx.db!.query.hackathonTeams.findMany({
        where: eq(hackathonTeams.hackathonId, input.hackathonId),
        with: {
          captain: {
            columns: { id: true, name: true, image: true },
          },
          participants: {
            columns: {
              id: true,
              userId: true,
              registrationStatus: true,
            },
            with: {
              user: {
                columns: { id: true, name: true, image: true },
              },
            },
          },
        },
        orderBy: (hackathonTeams, { desc }) => [desc(hackathonTeams.createdAt)],
      });

      return teams;
    }),

  joinTeam: protectedProcedure
    .input(z.object({
      hackathonId: z.string().uuid("Invalid hackathon ID"),
      teamId: z.string().uuid("Invalid team ID"),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db!.transaction(async (tx) => {
        const participant = await tx.query.hackathonParticipants.findFirst({
          where: and(
            eq(hackathonParticipants.hackathonId, input.hackathonId),
            eq(hackathonParticipants.userId, ctx.userId!)
          ),
        });

        if (!participant) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You must be registered for this hackathon to join a team",
          });
        }

        if (participant.teamId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You are already part of a team. Leave your current team first.",
          });
        }


        const team = await tx.query.hackathonTeams.findFirst({
          where: and(
            eq(hackathonTeams.id, input.teamId),
            eq(hackathonTeams.hackathonId, input.hackathonId),
          ),
        });

        if (!team) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
        }

        if (!team.isOpen) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This team is not accepting new members" });
        }

        if (team.currentMembers >= team.maxMembers) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This team is full" });
        }


        await tx
          .update(hackathonParticipants)
          .set({ teamId: team.id })
          .where(eq(hackathonParticipants.id, participant.id));

        const [updatedTeam] = await tx
          .update(hackathonTeams)
          .set({
            currentMembers: sql`${hackathonTeams.currentMembers} + 1`,
            isOpen: team.currentMembers + 1 < team.maxMembers,
            updatedAt: new Date(),
          })
          .where(eq(hackathonTeams.id, team.id))
          .returning();

        return updatedTeam;
      });
    }),

  leaveTeam: protectedProcedure
    .input(z.object({
      hackathonId: z.string().uuid("Invalid hackathon ID"),
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db!.transaction(async (tx) => {
        const participant = await tx.query.hackathonParticipants.findFirst({
          where: and(
            eq(hackathonParticipants.hackathonId, input.hackathonId),
            eq(hackathonParticipants.userId, ctx.userId!)
          ),
        });

        if (!participant || !participant.teamId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You are not part of a team",
          });
        }

        const team = await tx.query.hackathonTeams.findFirst({
          where: eq(hackathonTeams.id, participant.teamId),
        });

        if (!team) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
        }


        await tx
          .update(hackathonParticipants)
          .set({ teamId: null })
          .where(eq(hackathonParticipants.id, participant.id));

        const newCount = team.currentMembers - 1;

        if (newCount <= 0) {
          await tx.delete(hackathonTeams).where(eq(hackathonTeams.id, team.id));
          return { deleted: true };
        }


        let newCaptainId = team.captainId;
        if (team.captainId === ctx.userId) {
          const nextMember = await tx.query.hackathonParticipants.findFirst({
            where: and(
              eq(hackathonParticipants.teamId, team.id),
            ),
          });
          newCaptainId = nextMember?.userId ?? team.captainId;
        }

        await tx
          .update(hackathonTeams)
          .set({
            currentMembers: newCount,
            captainId: newCaptainId,
            isOpen: true,
            updatedAt: new Date(),
          })
          .where(eq(hackathonTeams.id, team.id));

        return { deleted: false };
      });
    }),

  adminGetAttendees: isAdmin
    .input(z.object({
      hackathonId: z.string().uuid("Invalid hackathon ID"),
    }))
    .query(async ({ ctx, input }) => {
      const attendees = await ctx.db!.query.hackathonParticipants.findMany({
        where: eq(hackathonParticipants.hackathonId, input.hackathonId),
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              image: true,
            }
          },
          team: {
            columns: {
              id: true,
              name: true,
            }
          }
        },
        orderBy: (participants, { desc }) => [desc(participants.registeredAt)],
      });

      return attendees;
    }),

  scanParticipantPass: isAdmin
    .input(z.object({
      hackathonId: z.string().uuid("Invalid hackathon ID"),
      eventId: z.string().uuid("Invalid event ID"),
      participantId: z.string().uuid("Invalid participant ID"),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify participant exists and belongs to this hackathon
      const participant = await ctx.db!.query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.id, input.participantId),
          eq(hackathonParticipants.hackathonId, input.hackathonId)
        ),
        with: { user: true }
      });

      if (!participant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Participant not found or not registered for this hackathon." });
      }

      // 2. Verify event exists and belongs to this hackathon
      const event = await ctx.db!.query.hackathonEvents.findFirst({
        where: and(
          eq(hackathonEvents.id, input.eventId),
          eq(hackathonEvents.hackathonId, input.hackathonId)
        )
      });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
      }

      // 3. Check for existing check-in to prevent duplicates
      const existingScan = await ctx.db!.query.hackathonEventAttendees.findFirst({
        where: and(
          eq(hackathonEventAttendees.eventId, input.eventId),
          eq(hackathonEventAttendees.participantId, input.participantId)
        )
      });

      if (existingScan) {
        throw new TRPCError({ code: "CONFLICT", message: `${participant.user.name} is already checked into ${event.name}.` });
      }

      // 4. Record attendance
      await ctx.db!.insert(hackathonEventAttendees).values({
        eventId: input.eventId,
        participantId: input.participantId,
      });

      return { success: true, message: `Successfully checked in ${participant.user.name}!` };
    }),

  getEvents: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      return await ctx.db!.query.hackathonEvents.findMany({
        where: eq(hackathonEvents.hackathonId, input.hackathonId),
        orderBy: (events, { asc }) => [asc(events.startTime)],
      });
    }),

  myParticipantRecord: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      return await ctx.db!.query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.hackathonId, input.hackathonId),
          eq(hackathonParticipants.userId, ctx.userId!)
        ),
        with: {
          team: true,
        }
      });
    }),

  getPublicProjects: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const projects = await ctx.db!.query.hackathonProjects.findMany({
        where: and(
          eq(hackathonProjects.hackathonId, input.hackathonId),
          // We only show projects that are submitted, judging, or winner. Drafts stay hidden.
          inArray(hackathonProjects.status, ["submitted", "judging", "winner"])
        ),
        with: {
          team: {
            columns: {
              id: true,
              name: true,
            }
          },
        },
        orderBy: (projects, { desc }) => [desc(projects.submittedAt)],
      });
      return projects;
    }),
});