// Forming a team: create, join, leave, disband and open or close the roster.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../../trpc";
import { notHackathonBanned } from "../../middleware/procedures";
import {
  hackathonTeams,
  hackathonParticipants,
  hackathonProjects,
} from "@query/db";
import { eq, and, isNull, lt, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";
import { checkTeamEditWindow } from "./windows";
import { checkAdmitted, assertNoLiveSoloSubmission } from "./guards";

export const teamProcedures = {
  createTeam: notHackathonBanned
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        name: z.string().min(1, "Team name is required").max(100),
        description: z.string().max(500).optional(),
        maxMembers: z.number().int().min(2).max(4).default(4),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkTeamEditWindow(ctx.db as DrizzleDB, input.hackathonId);

      try {
        return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
          async (tx) => {
            // 1. Registered for this hackathon? Read inside the transaction so a
            // double-submit cannot both see no team.
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

            checkAdmitted(participant.registrationStatus);

            // 2. Check if user is already in a team
            if (participant.teamId) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "You are already in a team for this hackathon.",
              });
            }

            await assertNoLiveSoloSubmission(
              tx,
              input.hackathonId,
              participant.id,
            );

            // 3. Create the team
            const [newTeam] = await tx
              .insert(hackathonTeams)
              .values({
                hackathonId: input.hackathonId,
                name: input.name,
                description: input.description,
                captainId: ctx.userId as string,
                currentMembers: 1, // The captain is the first member
                maxMembers: input.maxMembers,
              })
              .returning();

            // 4. Claim the participant's team slot. `teamId is null` settles the race:
            // the loser matches no row and rolls back the team it just inserted.
            if (newTeam) {
              const claimed = await tx
                .update(hackathonParticipants)
                .set({ teamId: newTeam.id })
                .where(
                  and(
                    eq(hackathonParticipants.id, participant.id),
                    isNull(hackathonParticipants.teamId),
                  ),
                );

              if (claimed.rowCount === 0) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "You are already in a team for this hackathon.",
                });
              }
            }

            return newTeam;
          },
        );
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create team.",
          cause: error,
        });
      }
    }),

  joinTeam: notHackathonBanned
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        teamId: z.string().uuid("Invalid team ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkTeamEditWindow(ctx.db as DrizzleDB, input.hackathonId);

      try {
        return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
          async (tx) => {
            // 1. Verify registration. Read inside the transaction so the slot claim below
            // settles against the same row.
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

            checkAdmitted(participant.registrationStatus);

            // 2. Check if already in a team
            if (participant.teamId) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "You are already in a team.",
              });
            }

            await assertNoLiveSoloSubmission(
              tx,
              input.hackathonId,
              participant.id,
            );

            // 3. Find the team and check capacity
            const team = await tx.query.hackathonTeams.findFirst({
              where: and(
                eq(hackathonTeams.id, input.teamId),
                eq(hackathonTeams.hackathonId, input.hackathonId),
              ),
            });

            if (!team) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Team not found.",
              });
            }

            if (!team.isOpen) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "This team is closed.",
              });
            }

            if (team.currentMembers >= team.maxMembers) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "This team is full.",
              });
            }

            // 4. Join. `teamId is null` carries the check above into the write, so a
            // racing join loses here instead of moving the user off the team it seated.
            const joined = await tx
              .update(hackathonParticipants)
              .set({ teamId: team.id })
              .where(
                and(
                  eq(hackathonParticipants.id, participant.id),
                  isNull(hackathonParticipants.teamId),
                ),
              );

            if (joined.rowCount === 0) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "You are already in a team.",
              });
            }

            // 5. Take the seat. The count above is a snapshot, so the increment carries
            // the capacity test: whoever loses the last seat updates no row.
            const seated = await tx
              .update(hackathonTeams)
              .set({
                currentMembers: sql`${hackathonTeams.currentMembers} + 1`,
              })
              .where(
                and(
                  eq(hackathonTeams.id, team.id),
                  lt(hackathonTeams.currentMembers, hackathonTeams.maxMembers),
                ),
              );

            if (seated.rowCount === 0) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "This team is full.",
              });
            }

            return { success: true };
          },
        );
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to join team.",
          cause: error,
        });
      }
    }),

  leaveTeam: protectedProcedure
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const window = await checkTeamEditWindow(
        ctx.db as DrizzleDB,
        input.hackathonId,
      );

      if (!window.canLeave) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Teams are locked. You cannot leave a team within 12 hours of the project deadline.",
        });
      }

      const participant = await (
        ctx.db as NonNullable<typeof ctx.db>
      ).query.hackathonParticipants.findFirst({
        where: and(
          eq(hackathonParticipants.hackathonId, input.hackathonId),
          eq(hackathonParticipants.userId, ctx.userId as string),
        ),
      });

      if (!participant || !participant.teamId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You are not in a team.",
        });
      }

      try {
        return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
          async (tx) => {
            // Locked, so the member count below is current: a join commits its
            // seat under this row's lock, and deleting the team around a join
            // still in flight dropped that member silently.
            const [team] = await tx
              .select()
              .from(hackathonTeams)
              .where(eq(hackathonTeams.id, participant.teamId!))
              .for("update");

            if (!team)
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Team not found.",
              });

            // If captain is the only one left, they can "leave" which deletes the team
            if (team.captainId === (ctx.userId as string)) {
              if (team.currentMembers <= 1) {
                const project = await tx.query.hackathonProjects.findFirst({
                  where: eq(hackathonProjects.teamId, team.id),
                });

                // Disbanding takes the team's project with it, so a submission has to be
                // withdrawn deliberately, not as a side effect.
                if (project && project.status !== "draft") {
                  throw new TRPCError({
                    code: "FORBIDDEN",
                    message:
                      "Your team has a submitted project. It must be withdrawn before you can leave.",
                  });
                }

                // Delete team projects first
                await tx
                  .delete(hackathonProjects)
                  .where(eq(hackathonProjects.teamId, team.id));
                // Delete team
                await tx
                  .delete(hackathonTeams)
                  .where(eq(hackathonTeams.id, team.id));
                // Mark user as solo
                await tx
                  .update(hackathonParticipants)
                  .set({ teamId: null })
                  .where(eq(hackathonParticipants.id, participant.id));
                return { success: true, message: "Team disbanded." };
              }

              // Names only what exists. There is no ownership transfer, and telling a stuck
              // captain to do something the product cannot do leaves them no move.
              throw new TRPCError({
                code: "FORBIDDEN",
                message:
                  "The captain cannot leave a team that still has other members. Disband the team, or ask a teammate to leave first.",
              });
            }

            // 1. Give up the seat. `teamId = team.id` makes a second Leave match no row
            // instead of decrementing twice.
            const left = await tx
              .update(hackathonParticipants)
              .set({ teamId: null })
              .where(
                and(
                  eq(hackathonParticipants.id, participant.id),
                  eq(hackathonParticipants.teamId, team.id),
                ),
              );

            // Already out; idempotent for the caller, but must not decrement.
            if (left.rowCount === 0) {
              return { success: true };
            }

            // 2. Decrement in the database so a concurrent join is not overwritten.
            // Drifting low to 1 makes the captain branch above delete the team and its
            // project with members still on it.
            await tx
              .update(hackathonTeams)
              .set({
                currentMembers: sql`greatest(${hackathonTeams.currentMembers} - 1, 0)`,
              })
              .where(eq(hackathonTeams.id, team.id));

            return { success: true };
          },
        );
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to leave team.",
          cause: error,
        });
      }
    }),

  disbandTeam: protectedProcedure
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        teamId: z.string().uuid("Invalid team ID"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const window = await checkTeamEditWindow(
        ctx.db as DrizzleDB,
        input.hackathonId,
      );

      // Disbanding empties a roster just as leaving does, so it shuts at the same
      // lock.
      if (!window.canLeave) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Teams are locked. You cannot disband a team within 12 hours of the project deadline.",
        });
      }

      const team = await (
        ctx.db as NonNullable<typeof ctx.db>
      ).query.hackathonTeams.findFirst({
        where: and(
          eq(hackathonTeams.id, input.teamId),
          eq(hackathonTeams.hackathonId, input.hackathonId),
        ),
      });

      if (!team)
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
      if (team.captainId !== (ctx.userId as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the captain can disband the team.",
        });
      }

      try {
        return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
          async (tx) => {
            // Same lock joinTeam's seat update takes: a join still in flight
            // finishes first or finds no team, instead of landing on a deleted one.
            await tx
              .select({ id: hackathonTeams.id })
              .from(hackathonTeams)
              .where(eq(hackathonTeams.id, team.id))
              .for("update");

            const project = await tx.query.hackathonProjects.findFirst({
              where: eq(hackathonProjects.teamId, team.id),
            });

            // Disbanding takes the team's project with it, so a submission has to be
            // withdrawn deliberately, not as a side effect.
            if (project && project.status !== "draft") {
              throw new TRPCError({
                code: "FORBIDDEN",
                message:
                  "Your team has a submitted project. It must be withdrawn before you can disband the team.",
              });
            }

            // 1. Remove all members
            await tx
              .update(hackathonParticipants)
              .set({ teamId: null })
              .where(eq(hackathonParticipants.teamId, team.id));

            // 2. Delete projects
            await tx
              .delete(hackathonProjects)
              .where(eq(hackathonProjects.teamId, team.id));

            // 3. Delete team
            await tx
              .delete(hackathonTeams)
              .where(eq(hackathonTeams.id, team.id));

            return { success: true };
          },
        );
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to disband team.",
          cause: error,
        });
      }
    }),

  // Lets the captain stop new joins without disbanding. joinTeam already
  // refuses a closed team; this is the only writer of the flag.
  setOpen: protectedProcedure
    .input(
      z.object({
        hackathonId: z.string().uuid("Invalid hackathon ID"),
        teamId: z.string().uuid("Invalid team ID"),
        isOpen: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkTeamEditWindow(ctx.db as DrizzleDB, input.hackathonId);

      const db = ctx.db as NonNullable<typeof ctx.db>;
      const team = await db.query.hackathonTeams.findFirst({
        where: and(
          eq(hackathonTeams.id, input.teamId),
          eq(hackathonTeams.hackathonId, input.hackathonId),
        ),
      });

      if (!team)
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
      if (team.captainId !== (ctx.userId as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the captain can open or close the team.",
        });
      }

      await db
        .update(hackathonTeams)
        .set({ isOpen: input.isOpen, updatedAt: new Date() })
        .where(eq(hackathonTeams.id, team.id));

      // Not in CACHE_INVALIDATION_MAP, so the namespace fallback would sweep
      // `team:*` and leave the cached roster list showing the old flag.
      ctx.cache.delete(`hackathon:${input.hackathonId}:teams`);

      return { success: true };
    }),
};
