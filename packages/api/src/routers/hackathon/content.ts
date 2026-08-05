import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import {
  hackathonParticipants,
  hackathonProjects,
  hackathonTeams,
} from "@query/db";
import { eq, and, inArray } from "drizzle-orm";
import { callerIsAdmin } from "../../middleware/procedures";
import type { DrizzleDB } from "@query/db";

// Same visibility rule as getPublicProjects: a project only becomes public once
// its team has actually submitted it. Drafts stay hidden.
const PUBLIC_PROJECT_STATUSES: (typeof hackathonProjects.$inferSelect)["status"][] =
  ["submitted", "judging", "winner"];

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
            // Team rosters are public, so they carry neither the decision made
            // on each application — registrationStatus names everyone who was
            // rejected or waitlisted — nor a participant id, which is the
            // entire content of that participant's event pass QR.
            columns: {
              userId: true,
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
      const fetchProjects = () =>
        (ctx.db as DrizzleDB).query.hackathonProjects.findMany({
          where: eq(hackathonProjects.hackathonId, input.hackathonId),
          // submittedById is a participant id — the same value that is the
          // entire content of that participant's event pass QR — and it is on
          // every solo submission. The rows below are cached once and served to
          // anonymous callers, so it is dropped at the query rather than on the
          // way out. Nothing reads it outside team.ts's resubmit lookup.
          columns: { submittedById: false },
          with: {
            team: {
              with: {
                participants: {
                  // Same rule as getTeams: this list is served to anonymous
                  // callers, so it carries neither registrationStatus nor the
                  // participant id behind each event pass QR.
                  columns: {
                    hackathonId: true,
                    userId: true,
                    teamId: true,
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

      const cacheKey = `hackathon:${input.hackathonId}:projects`;
      let projects =
        ctx.cache.get<Awaited<ReturnType<typeof fetchProjects>>>(cacheKey);

      if (!projects) {
        projects = await fetchProjects();
        ctx.cache.set(cacheKey, projects, 120);
      }

      // The rows are cached unfiltered and scrubbed on the way out, so the same
      // entry can serve staff and the public. Admins keep the full list (the
      // admin projects page shows draft submissions); everyone else sees only
      // work its team has actually submitted.
      if (await callerIsAdmin(ctx)) return projects;

      return projects.filter((project) =>
        PUBLIC_PROJECT_STATUSES.includes(project.status),
      );
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
        // Same rule as `projects` above: submittedById is the participant id
        // behind that person's event pass QR, and this endpoint is anonymous.
        columns: { submittedById: false },
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
