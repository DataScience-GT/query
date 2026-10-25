// Reads: the clock, the team list and a participant's own submission and projects.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc";
import {
  hackathonTeams,
  hackathonParticipants,
  hackathonProjects,
  hackathons,
  judgingEntries,
} from "@query/db";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { VOLATILE_TTL } from "../../middleware/cache";
import type { DrizzleDB } from "@query/db";
import { assertHackathonVisible } from "../hackathon/visibility";
import { computeSubmissionWindow, loadTeamWindow } from "./windows";
import { ownProjectWhere } from "./guards";

export const teamReadProcedures = {
  /** Lets the UI disable team actions instead of letting the mutation fail. */
  window: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      return await loadTeamWindow(ctx.db as DrizzleDB, input.hackathonId);
    }),

  // Every team in a hackathon, deliberately NOT paginated: the Teams tab finds
  // the caller's own team by searching this list, so with a page size any
  // member of an early team would fall off page one and lose the whole "Your
  // Team" panel, Leave included. Bounded by a short cache instead — the tab
  // refetches after every join, leave and disband.
  list: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      await assertHackathonVisible(ctx, input.hackathonId);

      const cacheKey = `hackathon:${input.hackathonId}:teams`;

      const fetchTeams = () =>
        (ctx.db as NonNullable<typeof ctx.db>).query.hackathonTeams.findMany({
          where: eq(hackathonTeams.hackathonId, input.hackathonId),
          with: {
            captain: {
              columns: { id: true, name: true, image: true },
            },
            participants: {
              // Any signed-in caller reads every team here, so it carries neither the
              // decision on each application (registrationStatus names everyone rejected or
              // waitlisted) nor the participant id, which is the entire content of that
              // participant's pass QR. userId identifies the captain and keys the list.
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
          orderBy: (hackathonTeams, { desc }) => [
            desc(hackathonTeams.createdAt),
          ],
        });

      const cached =
        ctx.cache.get<Awaited<ReturnType<typeof fetchTeams>>>(cacheKey);
      if (cached !== null) return cached;

      const teams = await fetchTeams();
      ctx.cache.set(cacheKey, teams, VOLATILE_TTL);
      return teams;
    }),

  // The one project the caller owns, so the form is filled from exactly the
  // record a resubmit overwrites. Without it a solo hacker sees a blank form
  // over a live submission and a typo fix wipes the links already filed.
  // The submission window for one edition, so /submit can say whether it is
  // open before somebody fills the form in. Same computation the mutation
  // enforces with, so the two cannot drift.
  submissionWindow: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: {
          hackingStartTime: true,
          startDate: true,
          status: true,
        },
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found.",
        });
      }

      const baseTime = hackathon.hackingStartTime ?? hackathon.startDate;
      const window = computeSubmissionWindow(baseTime, new Date());

      return {
        ...window,
        cancelled: hackathon.status === "cancelled",
      };
    }),

  mySubmission: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const participant = await db.query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.hackathonId, input.hackathonId),
          eq(hackathonParticipants.userId, ctx.userId as string),
        ),
        columns: { id: true, teamId: true },
      });

      if (!participant) return null;

      const project = await db.query.hackathonProjects.findFirst({
        where: ownProjectWhere(
          input.hackathonId,
          participant.teamId,
          participant.id,
        ),
        // submittedById is a participant id — a pass QR — and on a team entry it
        // belongs to the captain rather than the caller.
        columns: { submittedById: false },
      });
      if (!project) return null;

      // Whether the project made it into judging, so the submit page can send
      // the team to their judging times instead of leaving them guessing.
      const judging = await db.query.judgingEntries.findFirst({
        where: and(
          eq(judgingEntries.sourceProjectId, project.id),
          isNull(judgingEntries.deletedAt),
        ),
        columns: { id: true },
      });

      return { ...project, inJudging: !!judging };
    }),

  // Every project the caller owns, across hackathons. Reading off the team
  // relation alone leaves a solo hacker's submissions invisible.
  myProjects: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    const participants = await db.query.hackathonParticipants.findMany({
      where: eq(hackathonParticipants.userId, ctx.userId as string),
      columns: { id: true, teamId: true },
    });

    const teamIds = participants
      .map((p) => p.teamId)
      .filter((id): id is string => !!id);
    const soloIds = participants.filter((p) => !p.teamId).map((p) => p.id);

    // No filter would mean "every project in the platform", so bail first.
    if (teamIds.length === 0 && soloIds.length === 0) return [];

    return await db.query.hackathonProjects.findMany({
      where: or(
        teamIds.length
          ? inArray(hackathonProjects.teamId, teamIds)
          : undefined,
        soloIds.length
          ? and(
              isNull(hackathonProjects.teamId),
              inArray(hackathonProjects.submittedById, soloIds),
            )
          : undefined,
      ),
      columns: { submittedById: false },
      with: { team: { columns: { id: true, name: true } } },
      orderBy: (projects, { desc }) => [desc(projects.submittedAt)],
    });
  }),
};
