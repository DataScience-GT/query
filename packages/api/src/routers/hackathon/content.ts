import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import {
  hackathonParticipants,
  hackathonProjects,
  hackathonTeams,
} from "@query/db";
import { eq, and, inArray } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

export const hackathonContentRouter = createTRPCRouter({
  getTeams: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const teams = await (ctx.db as DrizzleDB).query.hackathonTeams.findMany({
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


  projects: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:projects`;
      const cached = ctx.cache.get<typeof projects>(cacheKey);
      if (cached) return cached;

      const projects = await (
        ctx.db as DrizzleDB
      ).query.hackathonProjects.findMany({
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
        orderBy: (hackathonProjects, { desc }) => [
          desc(hackathonProjects.submittedAt),
        ],
      });

      ctx.cache.set(cacheKey, projects, 120);

      return projects;
    }),


  myParticipantRecord: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.hackathonId, input.hackathonId),
          eq(hackathonParticipants.userId, ctx.userId as string),
        ),
        with: {
          team: true,
        },
      });
    }),


  getPublicProjects: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const projects = await (
        ctx.db as DrizzleDB
      ).query.hackathonProjects.findMany({
        where: and(
          eq(hackathonProjects.hackathonId, input.hackathonId),
          // We only show projects that are submitted, judging, or winner. Drafts stay hidden.
          inArray(hackathonProjects.status, ["submitted", "judging", "winner"]),
        ),
        with: {
          team: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: (projects, { desc }) => [desc(projects.submittedAt)],
      });
      return projects;
    }),
});
