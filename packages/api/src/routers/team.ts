import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
    hackathonTeams,
    hackathonParticipants,
    hackathonProjects,
    hackathons,
} from "@query/db";
import { eq, and } from "drizzle-orm";

async function checkTeamEditWindow(db: any, hackathonId: string) {
    const hackathon = await db.query.hackathons.findFirst({
        where: eq(hackathons.id, hackathonId),
    });
    if (!hackathon) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found." });
    }
    const now = new Date();
    const baseTime = hackathon.hackingStartTime ?? hackathon.startDate;
    const startEdit = new Date(baseTime.getTime() + 12 * 60 * 60 * 1000);
    const endEdit = new Date(baseTime.getTime() + 34 * 60 * 60 * 1000);
    if (now < startEdit) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Team creation and editing is not open yet. It starts 12 hours after the hacking begins.",
        });
    }
    if (now > endEdit) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Team creation and editing is closed. It ends 34 hours after the hacking begins.",
        });
    }
}

export const teamRouter = createTRPCRouter({
    createTeam: protectedProcedure
        .input(
            z.object({
                hackathonId: z.string().uuid("Invalid hackathon ID"),
                name: z.string().min(1, "Team name is required").max(100),
                description: z.string().max(500).optional(),
                maxMembers: z.number().int().min(2).max(4).default(4),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await checkTeamEditWindow(ctx.db, input.hackathonId);
            // 1. Check if user is registered for this hackathon
            const participant = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathonParticipants.findFirst({
                where: and(
                    eq(hackathonParticipants.hackathonId, input.hackathonId),
                    eq(hackathonParticipants.userId, ctx.userId as string)
                ),
            });

            if (!participant) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "You are not registered for this hackathon.",
                });
            }

            // 2. Check if user is already in a team
            if (participant.teamId) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "You are already in a team for this hackathon.",
                });
            }

            try {
                return await (ctx.db as NonNullable<typeof ctx.db>).transaction(async (tx) => {
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

                    // 4. Update the participant's team ID
                    if (newTeam) {
                        await tx
                            .update(hackathonParticipants)
                            .set({ teamId: newTeam.id })
                            .where(eq(hackathonParticipants.id, participant.id));
                    }

                    return newTeam;
                });
            } catch (error: unknown) {
                if (error instanceof TRPCError) throw error;
                const message = error instanceof Error ? error.message : "Unknown error";
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to create team: ${message}`,
                });
            }
        }),

    joinTeam: protectedProcedure
        .input(
            z.object({
                hackathonId: z.string().uuid("Invalid hackathon ID"),
                teamId: z.string().uuid("Invalid team ID"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await checkTeamEditWindow(ctx.db, input.hackathonId);
            // 1. Verify user is registered for hackathon
            const participant = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathonParticipants.findFirst({
                where: and(
                    eq(hackathonParticipants.hackathonId, input.hackathonId),
                    eq(hackathonParticipants.userId, ctx.userId as string)
                ),
            });

            if (!participant) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "You are not registered for this hackathon.",
                });
            }

            // 2. Check if already in a team
            if (participant.teamId) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "You are already in a team.",
                });
            }

            try {
                return await (ctx.db as NonNullable<typeof ctx.db>).transaction(async (tx) => {
                    // 3. Find the team and check capacity
                    const team = await tx.query.hackathonTeams.findFirst({
                        where: and(
                            eq(hackathonTeams.id, input.teamId),
                            eq(hackathonTeams.hackathonId, input.hackathonId)
                        ),
                    });

                    if (!team) {
                        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
                    }

                    if (!team.isOpen) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "This team is closed." });
                    }

                    if (team.currentMembers >= team.maxMembers) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "This team is full." });
                    }

                    // 4. Join the team
                    await tx
                        .update(hackathonParticipants)
                        .set({ teamId: team.id })
                        .where(eq(hackathonParticipants.id, participant.id));

                    // 5. Increment team member count
                    await tx
                        .update(hackathonTeams)
                        .set({ currentMembers: team.currentMembers + 1 })
                        .where(eq(hackathonTeams.id, team.id));

                    return { success: true };
                });
            } catch (error: unknown) {
                if (error instanceof TRPCError) throw error;
                const message = error instanceof Error ? error.message : "Unknown error";
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to join team: ${message}`,
                });
            }
        }),

    leaveTeam: protectedProcedure
        .input(
            z.object({
                hackathonId: z.string().uuid("Invalid hackathon ID"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await checkTeamEditWindow(ctx.db, input.hackathonId);
            const participant = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathonParticipants.findFirst({
                where: and(
                    eq(hackathonParticipants.hackathonId, input.hackathonId),
                    eq(hackathonParticipants.userId, ctx.userId as string)
                ),
            });

            if (!participant || !participant.teamId) {
                throw new TRPCError({ code: "NOT_FOUND", message: "You are not in a team." });
            }

            try {
                return await (ctx.db as NonNullable<typeof ctx.db>).transaction(async (tx) => {
                    const team = await tx.query.hackathonTeams.findFirst({
                        where: eq(hackathonTeams.id, participant.teamId!),
                    });

                    if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });

                    // If captain is the only one left, they can "leave" which deletes the team
                    if (team.captainId === ctx.userId as string) {
                        if (team.currentMembers <= 1) {
                            // Delete team projects first
                            await tx.delete(hackathonProjects).where(eq(hackathonProjects.teamId, team.id));
                            // Delete team
                            await tx.delete(hackathonTeams).where(eq(hackathonTeams.id, team.id));
                            // Mark user as solo
                            await tx.update(hackathonParticipants).set({ teamId: null }).where(eq(hackathonParticipants.id, participant.id));
                            return { success: true, message: "Team disbanded." };
                        }

                        throw new TRPCError({
                            code: "FORBIDDEN",
                            message: "The captain cannot leave a multi-member team. You must disband it or transfer ownership.",
                        });
                    }

                    // 1. Remove user from team
                    await tx
                        .update(hackathonParticipants)
                        .set({ teamId: null })
                        .where(eq(hackathonParticipants.id, participant.id));

                    // 2. Decrement team member count
                    await tx
                        .update(hackathonTeams)
                        .set({ currentMembers: Math.max(0, team.currentMembers - 1) })
                        .where(eq(hackathonTeams.id, team.id));

                    return { success: true };
                });
            } catch (error: unknown) {
                if (error instanceof TRPCError) throw error;
                const message = error instanceof Error ? error.message : "Unknown error";
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to leave team: ${message}`,
                });
            }
        }),

    disbandTeam: protectedProcedure
        .input(
            z.object({
                hackathonId: z.string().uuid("Invalid hackathon ID"),
                teamId: z.string().uuid("Invalid team ID"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await checkTeamEditWindow(ctx.db, input.hackathonId);
            const team = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathonTeams.findFirst({
                where: and(
                    eq(hackathonTeams.id, input.teamId),
                    eq(hackathonTeams.hackathonId, input.hackathonId)
                ),
            });

            if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
            if (team.captainId !== ctx.userId as string) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Only the captain can disband the team." });
            }

            try {
                return await (ctx.db as NonNullable<typeof ctx.db>).transaction(async (tx) => {
                    // 1. Remove all members
                    await tx
                        .update(hackathonParticipants)
                        .set({ teamId: null })
                        .where(eq(hackathonParticipants.teamId, team.id));

                    // 2. Delete projects
                    await tx.delete(hackathonProjects).where(eq(hackathonProjects.teamId, team.id));

                    // 3. Delete team
                    await tx.delete(hackathonTeams).where(eq(hackathonTeams.id, team.id));

                    return { success: true };
                });
            } catch (error: unknown) {
                if (error instanceof TRPCError) throw error;
                const message = error instanceof Error ? error.message : "Unknown error";
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to disband team: ${message}`,
                });
            }
        }),

    submitProject: protectedProcedure
        .input(
            z.object({
                hackathonId: z.string().uuid(),
                teamId: z.string().uuid().optional(), // Can be solo
                name: z.string().min(1, "Project name is required"),
                description: z.string().min(10, "Description must be at least 10 characters"),
                technologies: z.array(z.string()).optional(),
                tracks: z.array(z.string()).optional(),
                challenges: z.array(z.string()).optional(),
                githubUrl: z.string().url("Must be a valid URL").optional().or(z.literal('')),
                demoUrl: z.string().url("Must be a valid URL").optional().or(z.literal('')),
                videoUrl: z.string().url("Must be a valid URL").optional().or(z.literal('')),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // 1. Verify user is registered for hackathon
            const participant = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathonParticipants.findFirst({
                where: and(
                    eq(hackathonParticipants.hackathonId, input.hackathonId),
                    eq(hackathonParticipants.userId, ctx.userId as string)
                ),
                with: { team: true },
            });

            if (!participant) {
                throw new TRPCError({ code: "NOT_FOUND", message: "You are not registered for this hackathon." });
            }

            // 1.5. Verify hackathon is not past the submission window
            const hackathon = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathons.findFirst({
                where: eq(hackathons.id, input.hackathonId),
            });

            if (!hackathon) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found." });
            }

            const now = new Date();
            const baseTime = hackathon.hackingStartTime ?? hackathon.startDate;
            const startSubmission = new Date(baseTime.getTime() + 12 * 60 * 60 * 1000);
            const devpostFinalDeadline = new Date(baseTime.getTime() + 34 * 60 * 60 * 1000);
            const hardDeadline = new Date(baseTime.getTime() + 36 * 60 * 60 * 1000);

            if (now < startSubmission) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Project submission is not open yet. It starts 12 hours after the hacking begins.",
                });
            }

            if (now > hardDeadline) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Project submission closed. The submission window ended 36 hours after the hacking started.",
                });
            }

            // Fetch existing project to check for edit restrictions
            let existingProject;
            if (input.teamId) {
                existingProject = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathonProjects.findFirst({
                    where: and(
                        eq(hackathonProjects.hackathonId, input.hackathonId),
                        eq(hackathonProjects.teamId, input.teamId)
                    )
                });
            }

            if (existingProject && now > devpostFinalDeadline) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Project edits are closed. Devposts must be final 34 hours after the hacking starts.",
                });
            }

            // Validate team ownership to prevent IDOR attacks
            // Use teamId from participant record instead of nested team object
            if (input.teamId) {
                // Verify team belongs to this hackathon
                const team = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathonTeams.findFirst({
                    where: and(
                        eq(hackathonTeams.id, input.teamId),
                        eq(hackathonTeams.hackathonId, input.hackathonId)
                    ),
                });

                if (!team) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Team not found for this hackathon.",
                    });
                }

                // Verify captain ownership using teamId comparison (not nested object)
                if (team.captainId !== ctx.userId as string) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Only the team captain can submit the project.",
                    });
                }
            } else {
                // No team ID provided - solo submission (participant is already in the team)
            }

            try {
                return await (ctx.db as NonNullable<typeof ctx.db>).transaction(async (tx) => {
                    // We clean up empty strings to be null
                    const githubUrl = input.githubUrl === '' ? undefined : input.githubUrl;
                    const demoUrl = input.demoUrl === '' ? undefined : input.demoUrl;
                    const videoUrl = input.videoUrl === '' ? undefined : input.videoUrl;

                    let finalProject;
                    if (existingProject) {
                        // Update existing
                        const [updated] = await tx.update(hackathonProjects).set({
                            name: input.name,
                            description: input.description,
                            technologies: input.technologies || [],
                            tracks: input.tracks || [],
                            challenges: input.challenges || [],
                            githubUrl,
                            demoUrl,
                            videoUrl,
                            status: "submitted",
                            submittedAt: new Date()
                        }).where(eq(hackathonProjects.id, existingProject.id)).returning();
                        finalProject = updated;
                    } else {
                        // Insert new
                        const [inserted] = await tx.insert(hackathonProjects).values({
                            hackathonId: input.hackathonId,
                            teamId: input.teamId,
                            name: input.name,
                            description: input.description,
                            technologies: input.technologies || [],
                            tracks: input.tracks || [],
                            challenges: input.challenges || [],
                            githubUrl,
                            demoUrl,
                            videoUrl,
                            status: "submitted",
                            submittedAt: new Date()
                        }).returning();
                        finalProject = inserted;
                    }

                    // Mark the participant as having submitted
                    await tx.update(hackathonParticipants).set({
                        hasSubmittedProject: true
                    }).where(eq(hackathonParticipants.id, participant.id));

                    return finalProject;
                });
            } catch (error: unknown) {
                if (error instanceof TRPCError) throw error;
                const message = error instanceof Error ? error.message : "Unknown error";
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to submit project: ${message}`,
                });
            }
        }),

    list: protectedProcedure
        .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
        .query(async ({ ctx, input }) => {
            const teams = await (ctx.db as NonNullable<typeof ctx.db>).query.hackathonTeams.findMany({
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
});
