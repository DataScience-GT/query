import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import {
  hackathonParticipants,
  hackathonProjects,
  hackathonResults,
  judgingProjects,
} from "@query/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { callerIsAdmin, isAdmin } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { assertHackathonVisible } from "./visibility";
import type { DrizzleDB } from "@query/db";

// Same visibility rule as getPublicProjects: a project becomes public once
// its team has actually submitted it. Drafts stay hidden.
const PUBLIC_PROJECT_STATUSES: (typeof hackathonProjects.$inferSelect)["status"][] =
  ["submitted", "judging", "winner"];

export const hackathonContentRouter = createTRPCRouter({
  // Fixes a submitted project on a team's behalf. team.submitProject refuses
  // every edit once the window closes and withdrawProject tells participants to
  // "ask an organiser" — advice nobody could act on, so a dead demo link found
  // during judging had no remedy. Narrow on purpose: links and copy, not
  // tracks, since tracks decide which judges a project reaches.
  adminUpdateProject: isAdmin
    .input(
      z.object({
        projectId: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().min(1).max(5000).optional(),
        githubUrl: z.string().url().max(500).nullable().optional(),
        demoUrl: z.string().url().max(500).nullable().optional(),
        videoUrl: z.string().url().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...updateData } = input;
      const db = ctx.db as DrizzleDB;

      const existing = await db.query.hackathonProjects.findFirst({
        where: eq(hackathonProjects.id, projectId),
        columns: { id: true, hackathonId: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const [updated] = await db
        .update(hackathonProjects)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(hackathonProjects.id, projectId))
        .returning();

      ctx.cache.delete(`hackathon:${existing.hackathonId}:projects`);
      ctx.cache.deletePattern(
        `hackathon:${existing.hackathonId}:public-projects*`,
      );

      return updated;
    }),

  // Pulls a submission out of the event. The participant-facing path refuses
  // this once judging holds the project, but a plagiarised entry is exactly the
  // case that arises after judging starts.
  adminWithdrawProject: isAdmin
    .input(
      z.object({
        projectId: z.string().uuid(),
        // Withdraw even though judges have already scored it. Their votes stay on the
        // record; the project simply stops being eligible.
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const existing = await db.query.hackathonProjects.findFirst({
        where: eq(hackathonProjects.id, input.projectId),
        columns: { id: true, hackathonId: true, status: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      if (existing.status === "judging" && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Judges are already scoring this project. Withdrawing it removes it from the results — confirm to continue.",
        });
      }

      await db
        .update(hackathonProjects)
        .set({ status: "draft", submittedAt: null, updatedAt: new Date() })
        .where(eq(hackathonProjects.id, input.projectId));

      // The judging entry has to go with it, or the CONFLICT message above is a
      // lie: judges keep being routed to the table, the votes keep counting, and
      // the project can still be published as a placing.
      await db
        .update(judgingProjects)
        .set({ withdrawnAt: new Date() })
        .where(eq(judgingProjects.sourceProjectId, input.projectId));

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.adminWithdrawProject",
        resourceId: input.projectId,
        // Pulling a project judges are actively scoring changes the results.
        severity: existing.status === "judging" ? "critical" : "warn",
        metadata: {
          hackathonId: existing.hackathonId,
          previousStatus: existing.status,
          forced: input.force,
        },
      });

      ctx.cache.delete(`hackathon:${existing.hackathonId}:projects`);
      ctx.cache.deletePattern(
        `hackathon:${existing.hackathonId}:public-projects*`,
      );

      return { success: true };
    }),

  // The published placings, for everyone. Reads only rows with publishedAt set,
  // so a computed-but-unreviewed draft stays invisible until an organiser
  // releases it, and unpublishing takes it back down.
  getResults: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      await assertHackathonVisible(ctx, input.hackathonId);

      const cacheKey = `hackathon:${input.hackathonId}:results`;

      const fetchResults = () =>
        (ctx.db as DrizzleDB).query.hackathonResults.findMany({
          where: and(
            eq(hackathonResults.hackathonId, input.hackathonId),
            isNotNull(hackathonResults.publishedAt),
          ),
          with: {
            project: {
              columns: { id: true, name: true, teamMembers: true },
            },
            sourceProject: {
              columns: { id: true, name: true, githubUrl: true, demoUrl: true },
              with: { team: { columns: { id: true, name: true } } },
            },
          },
          orderBy: (results, { asc }) => [asc(results.placement)],
        });

      const cached =
        ctx.cache.get<Awaited<ReturnType<typeof fetchResults>>>(cacheKey);
      if (cached !== null) return cached;

      const results = await fetchResults();
      ctx.cache.set(cacheKey, results, 60);
      return results;
    }),

  projects: publicProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      await assertHackathonVisible(ctx, input.hackathonId);

      const fetchProjects = () =>
        (ctx.db as DrizzleDB).query.hackathonProjects.findMany({
          where: eq(hackathonProjects.hackathonId, input.hackathonId),
          // submittedById is a participant id — the entire content of that
          // participant's event pass QR — and it is on every solo submission. These
          // rows are cached once and served to anonymous callers, so it is dropped at
          // the query rather than on the way out.
          columns: { submittedById: false },
          with: {
            team: {
              with: {
                participants: {
                  // Same rule as getTeams: served to anonymous callers, so it carries neither
                  // registrationStatus nor the participant id behind each event pass QR.
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

      // The rows are cached unfiltered and scrubbed on the way out, so one entry
      // serves staff and the public. Admins keep the full list (the admin projects
      // page shows drafts); everyone else sees only submitted work.
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


  // The public project gallery. Anonymous, and read by most of the venue at
  // once when demos open — so it is bounded and cached. Uncached it was a full
  // table read with a team join per request, at the busiest moment.
  getPublicProjects: publicProcedure
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertHackathonVisible(ctx, input.hackathonId);

      const cacheKey = `hackathon:${input.hackathonId}:public-projects:${input.limit}:${input.offset}`;

      const fetchPage = () =>
        (ctx.db as DrizzleDB).query.hackathonProjects.findMany({
          where: and(
            eq(hackathonProjects.hackathonId, input.hackathonId),
            // We only show projects that are submitted, judging, or winner. Drafts stay hidden.
            inArray(hackathonProjects.status, [
              ...PUBLIC_PROJECT_STATUSES,
            ]),
          ),
          // Same rule as `projects` above: submittedById is the participant id behind
          // that person's event pass QR, and this endpoint is anonymous.
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
          limit: input.limit,
          offset: input.offset,
        });

      const cached = ctx.cache.get<Awaited<ReturnType<typeof fetchPage>>>(
        cacheKey,
      );
      if (cached !== null) return cached;

      const projects = await fetchPage();
      ctx.cache.set(cacheKey, projects, 60);
      return projects;
    }),
});
