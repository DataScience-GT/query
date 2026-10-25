// Submitting a project for the hackathon, and taking it back.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc";
import { notHackathonBanned } from "../../middleware/procedures";
import {
  hackathonTeams,
  hackathonParticipants,
  hackathonProjects,
  hackathons,
  judgingEntries,
} from "@query/db";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { isUniqueViolation } from "../../middleware/db-errors";
import type { DrizzleDB } from "@query/db";
import { computeSubmissionWindow, checkWithdrawWindow } from "./windows";
import type { Tx } from "./windows";
import { ownProjectWhere, checkCheckedIn } from "./guards";

type Hackathon = typeof hackathons.$inferSelect;
type Project = typeof hackathonProjects.$inferSelect;

const optionalUrl = z
  .string()
  .url("Must be a valid URL")
  .optional()
  .or(z.literal(""));

const submitProjectInput = z.object({
  hackathonId: z.string().uuid(),
  teamId: z.string().uuid().optional(), // Can be solo
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(120, "Project name must be 120 characters or fewer"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description must be 5,000 characters or fewer"),
  technologies: z.array(z.string().max(60)).max(30).optional(),
  tracks: z.array(z.string().max(100)).max(20).optional(),
  challenges: z.array(z.string().max(100)).max(20).optional(),
  // Promoting submissions into judging files the project under the CreateX
  // challenge from this flag.
  isCreateX: z.boolean().optional(),
  githubUrl: optionalUrl,
  demoUrl: optionalUrl,
  videoUrl: optionalUrl,
});

// Promotion into judging matches these strings to challenges by label, so
// only what this hackathon offers is kept. Dropped rather than refused:
// the form pre-fills a saved project's tracks but only shows current ones,
// so a track removed since could not be unticked and every edit would fail.
const keepOffered = (allowed: string[] | null, picked?: string[]) =>
  picked && allowed?.length
    ? picked.filter((value) => allowed.includes(value))
    : picked;

/** Throws unless submissions are open now. Returns when edits to one close. */
function assertSubmissionsOpen(hackathon: Hackathon, now: Date) {
  const baseTime = hackathon.hackingStartTime ?? hackathon.startDate;
  const window = computeSubmissionWindow(baseTime, now);

  if (window.notYetOpen) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Project submission is not open yet. It starts 12 hours after the hacking begins.",
    });
  }

  if (now > window.closesAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Project submission closed. The submission window ended 36 hours after the hacking started.",
    });
  }

  return window.editsCloseAt;
}

// An organiser pulled it: re-saving would put it back in the gallery.
// The column covers a pull made from the admin projects screen; a
// removed judging entry covers one made from judging (a team can
// only withdraw before judging has the project, so a removed
// judging entry means an organiser did it).
async function assertNotPulledByOrganiser(tx: Tx, project: Project) {
  const withdrawn = () =>
    new TRPCError({
      code: "FORBIDDEN",
      message:
        "An organiser withdrew this project, so it can no longer be resubmitted.",
    });

  if (project.withdrawnByAdminAt) throw withdrawn();

  const pulled = await tx.query.judgingEntries.findFirst({
    where: and(
      eq(judgingEntries.sourceProjectId, project.id),
      isNotNull(judgingEntries.deletedAt),
    ),
    columns: { id: true },
  });
  if (pulled) throw withdrawn();
}

/** Only the captain of a team in this hackathon may submit for it. */
async function assertTeamCaptain(
  tx: Tx,
  hackathonId: string,
  teamId: string,
  userId: string,
) {
  // Verify team belongs to this hackathon
  const team = await tx.query.hackathonTeams.findFirst({
    where: and(
      eq(hackathonTeams.id, teamId),
      eq(hackathonTeams.hackathonId, hackathonId),
    ),
  });

  if (!team) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Team not found for this hackathon.",
    });
  }

  // Verify captain ownership using teamId comparison (not nested object)
  if (team.captainId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the team captain can submit the project.",
    });
  }
}

export const submissionProcedures = {
  submitProject: notHackathonBanned
    .input(submitProjectInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as NonNullable<typeof ctx.db>;

      // 1. Verify user is registered for hackathon
      const participant = await db.query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.hackathonId, input.hackathonId),
          eq(hackathonParticipants.userId, ctx.userId as string),
        ),
        with: { team: true },
      });

      if (!participant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not registered for this hackathon.",
        });
      }

      checkCheckedIn(participant.registrationStatus);

      // 1.5. Verify hackathon is not past the submission window
      const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
      });

      if (!hackathon) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Hackathon not found.",
        });
      }

      if (hackathon.status === "cancelled") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This hackathon has been cancelled.",
        });
      }

      const tracks = keepOffered(hackathon.tracks, input.tracks);
      const challenges = keepOffered(hackathon.challenges, input.challenges);

      const now = new Date();
      const editsCloseAt = assertSubmissionsOpen(hackathon, now);

      // Someone on a team always submits as that team, whether or not the client
      // sent the id.
      const teamId = input.teamId ?? participant.teamId ?? undefined;

      try {
        return await db.transaction(async (tx) => {
          // Read inside the transaction, since the update-or-insert decision turns on
          // it. A solo entry is found by its author exactly as a team entry is found by
          // its team, so editing works the same either way instead of filing a second
          // row or being refused.
          const existingProject = await tx.query.hackathonProjects.findFirst({
            where: ownProjectWhere(input.hackathonId, teamId, participant.id),
          });

          if (existingProject && now > editsCloseAt) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Project edits are closed. Submissions must be final 34 hours after the hacking starts.",
            });
          }

          if (existingProject) {
            await assertNotPulledByOrganiser(tx, existingProject);
          }

          // Team ownership from the participant record, not the nested team object —
          // otherwise this is an IDOR.
          if (teamId) {
            await assertTeamCaptain(
              tx,
              input.hackathonId,
              teamId,
              ctx.userId as string,
            );
          }

          // We clean up empty strings to be null
          const projectFields = {
            name: input.name,
            description: input.description,
            technologies: input.technologies || [],
            tracks: tracks || [],
            challenges: challenges || [],
            isCreateX: input.isCreateX ?? false,
            githubUrl: input.githubUrl === "" ? undefined : input.githubUrl,
            demoUrl: input.demoUrl === "" ? undefined : input.demoUrl,
            videoUrl: input.videoUrl === "" ? undefined : input.videoUrl,
          };

          let finalProject;
          if (existingProject) {
            // Update existing
            const [updated] = await tx
              .update(hackathonProjects)
              .set({
                ...projectFields,
                // Only ever forward. Writing "submitted" unconditionally let a team editing a
                // demo link after promotion knock their project out of "judging", which
                // re-opened withdrawProject's guard and let them withdraw a project judges
                // were actively scoring.
                status:
                  existingProject.status === "judging" ||
                  existingProject.status === "winner"
                    ? existingProject.status
                    : "submitted",
                submittedAt: new Date(),
              })
              .where(eq(hackathonProjects.id, existingProject.id))
              .returning();
            finalProject = updated;
          } else {
            // Insert new
            const [inserted] = await tx
              .insert(hackathonProjects)
              .values({
                ...projectFields,
                hackathonId: input.hackathonId,
                teamId,
                submittedById: participant.id,
                status: "submitted",
                submittedAt: new Date(),
              })
              .returning();
            finalProject = inserted;
          }

          // Mark the participant as having submitted
          await tx
            .update(hackathonParticipants)
            .set({
              hasSubmittedProject: true,
            })
            .where(eq(hackathonParticipants.id, participant.id));

          return finalProject;
        });
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
        // Two first submissions racing (a double click) hit the unique index.
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Your project was already submitted. Refresh to edit it.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit project.",
          cause: error,
        });
      }
    }),

  // Puts a submission back to draft. disbandTeam and the sole-captain branch of
  // leaveTeam both refuse while a submitted project exists and say it "must be
  // withdrawn first" — nothing could do that, since submitProject always wrote
  // "submitted", so both flows were dead ends.
  withdrawProject: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .mutation(async ({ ctx, input }) => {
      await checkWithdrawWindow(ctx.db as DrizzleDB, input.hackathonId);

      return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
        async (tx) => {
          const participant = await tx.query.hackathonParticipants.findFirst({
            where: and(
              eq(hackathonParticipants.hackathonId, input.hackathonId),
              eq(hackathonParticipants.userId, ctx.userId as string),
            ),
          });

          if (!participant) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "You are not registered for this hackathon.",
            });
          }

          const project = await tx.query.hackathonProjects.findFirst({
            where: ownProjectWhere(
              input.hackathonId,
              participant.teamId,
              participant.id,
            ),
          });

          if (!project) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "You do not have a submitted project.",
            });
          }

          // Only the captain files or withdraws on a team's behalf, matching the rule
          // submitProject already applies.
          if (participant.teamId) {
            const team = await tx.query.hackathonTeams.findFirst({
              where: eq(hackathonTeams.id, participant.teamId),
            });
            if (team && team.captainId !== (ctx.userId as string)) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Only the team captain can withdraw the project.",
              });
            }
          }

          // Once judging has it, withdrawing would pull a project out from under scores
          // that already reference it. Judging has it when the status says so or
          // when it was promoted into a judging entry that is still live.
          const inJudging = await tx.query.judgingEntries.findFirst({
            where: and(
              eq(judgingEntries.sourceProjectId, project.id),
              isNull(judgingEntries.deletedAt),
            ),
            columns: { id: true },
          });
          if (
            project.status === "judging" ||
            project.status === "winner" ||
            inJudging
          ) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Judging has started for this project. Ask an organiser if it needs to be pulled.",
            });
          }

          await tx
            .update(hackathonProjects)
            .set({ status: "draft", submittedAt: null })
            .where(eq(hackathonProjects.id, project.id));

          await tx
            .update(hackathonParticipants)
            .set({ hasSubmittedProject: false })
            .where(eq(hackathonParticipants.id, participant.id));

          return { success: true };
        },
      );
    }),
};
