import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  hackathonTeams,
  hackathonParticipants,
  hackathonProjects,
  hackathons,
} from "@query/db";
import { eq, and, or, isNull, inArray, lt, sql } from "drizzle-orm";
import { VOLATILE_TTL } from "../middleware/cache";
import type { DrizzleDB } from "@query/db";

type Tx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

const HOUR = 60 * 60 * 1000;

/** All hackathon milestones, as hour offsets from the hacking start time. */
const TEAM_WINDOW_OPEN_HOURS = 12;
const TEAM_WINDOW_CLOSE_HOURS = 34;
const SUBMISSION_HARD_DEADLINE_HOURS = 36;
/** Rosters freeze 12h before the hard submission deadline, i.e. at +24h. */
const LEAVE_LOCK_HOURS = SUBMISSION_HARD_DEADLINE_HOURS - 12;

export function computeTeamWindow(baseTime: Date, now: Date) {
  const at = (hours: number) => new Date(baseTime.getTime() + hours * HOUR);

  const opensAt = at(TEAM_WINDOW_OPEN_HOURS);
  const closesAt = at(TEAM_WINDOW_CLOSE_HOURS);
  const leaveLocksAt = at(LEAVE_LOCK_HOURS);

  const isOpen = now >= opensAt && now <= closesAt;

  return {
    opensAt,
    closesAt,
    leaveLocksAt,
    isOpen,
    canCreate: isOpen,
    canJoin: isOpen,
    // Leaving shuts earlier than the rest of the window so rosters are stable
    // through the final crunch and judging.
    canLeave: isOpen && now < leaveLocksAt,
  };
}

/**
 * The submission window, as three moments and the state between them.
 *
 * Exported and used by `submitProject` itself, so the page and the procedure
 * cannot disagree: /submit rendered no window state at all, which meant an
 * attendee could write a full description and learn it was refused only when
 * they pressed submit.
 */
export function computeSubmissionWindow(baseTime: Date, now: Date) {
  const at = (hours: number) => new Date(baseTime.getTime() + hours * HOUR);

  const opensAt = at(TEAM_WINDOW_OPEN_HOURS);
  /** After this, an existing submission is frozen — new ones still land. */
  const editsCloseAt = at(TEAM_WINDOW_CLOSE_HOURS);
  const closesAt = at(SUBMISSION_HARD_DEADLINE_HOURS);

  return {
    opensAt,
    editsCloseAt,
    closesAt,
    isOpen: now >= opensAt && now <= closesAt,
    notYetOpen: now < opensAt,
    canEditExisting: now >= opensAt && now <= editsCloseAt,
  };
}

async function loadHackathonBaseTime(db: DrizzleDB, hackathonId: string) {
  const hackathon = await db.query.hackathons.findFirst({
    where: eq(hackathons.id, hackathonId),
  });
  if (!hackathon) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Hackathon not found." });
  }
  return hackathon.hackingStartTime ?? hackathon.startDate;
}

async function loadTeamWindow(db: DrizzleDB, hackathonId: string) {
  const baseTime = await loadHackathonBaseTime(db, hackathonId);
  return computeTeamWindow(baseTime, new Date());
}

/**
 * Withdrawal follows the submission window, not the team one. On the team
 * window it shut at +34h while submitting ran to +36h, so for the last two
 * hours a project could be filed and then not taken back.
 */
async function checkWithdrawWindow(db: DrizzleDB, hackathonId: string) {
  const baseTime = await loadHackathonBaseTime(db, hackathonId);
  const now = new Date();
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
        "The submission window has closed. Ask an organiser if a project needs to be pulled.",
    });
  }

  return window;
}

async function checkTeamEditWindow(db: DrizzleDB, hackathonId: string) {
  const window = await loadTeamWindow(db, hackathonId);
  const now = new Date();

  if (now < window.opensAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Team creation and editing is not open yet. It starts 12 hours after the hacking begins.",
    });
  }
  if (now > window.closesAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Team creation and editing is closed. It ends 34 hours after the hacking begins.",
    });
  }
  return window;
}

/**
 * The single project row a participant owns in a hackathon: their team's entry
 * if they are on a team, otherwise the solo entry they filed themselves. Shared
 * by submitProject and mySubmission so the form is prefilled from exactly the
 * row a resubmit updates — two copies of this rule drifting apart is how a
 * resubmit ends up filing a duplicate instead of an edit.
 */
function ownProjectWhere(
  hackathonId: string,
  teamId: string | null | undefined,
  participantId: string,
) {
  return and(
    eq(hackathonProjects.hackathonId, hackathonId),
    teamId
      ? eq(hackathonProjects.teamId, teamId)
      : and(
          isNull(hackathonProjects.teamId),
          eq(hackathonProjects.submittedById, participantId),
        ),
  );
}

/**
 * Only admitted applicants take part.
 *
 * This used to block `rejected` and `waitlisted` alone — and every participant
 * is created `pending`, which passed. So teams formed and projects were
 * submitted with no review having happened at all, while the product showed
 * organisers an approve/reject screen that decided nothing but an email.
 * Registration is now an application: review has to land before anyone builds.
 *
 * `checked_in` counts because somebody standing at the door with a scanned
 * badge has plainly been admitted, whatever their row said beforehand.
 */
const ADMITTED_STATUSES = ["approved", "checked_in"];

function checkAdmitted(registrationStatus: string) {
  if (ADMITTED_STATUSES.includes(registrationStatus)) return;

  if (registrationStatus === "pending") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Your registration is still being reviewed. You can form a team once you have been accepted.",
    });
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Your registration for this hackathon is ${registrationStatus}.`,
  });
}

/**
 * Submitting needs more than acceptance: the person has to be in the building.
 *
 * Acceptance is a decision made weeks earlier and says nothing about whether
 * somebody turned up. Requiring the badge scan means a project can only come
 * from a team that is actually at the event — which is also what the judging
 * table numbers, the printed cards and the in-person scoring all assume.
 */
function checkCheckedIn(registrationStatus: string) {
  if (registrationStatus === "checked_in") return;

  checkAdmitted(registrationStatus);

  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "You need to check in at the event before submitting. Find a volunteer and have your badge scanned.",
  });
}

/**
 * Joining a team after submitting solo orphans the solo row: `ownProjectWhere`
 * then resolves to the team's entry, so the solo one stays `submitted`, stays
 * in the gallery, and is promoted into judging with nobody able to withdraw it.
 * `draft` is fine — withdrawal returns a project there, and it reaches neither.
 */
async function assertNoLiveSoloSubmission(
  tx: Tx,
  hackathonId: string,
  participantId: string,
) {
  const solo = await tx.query.hackathonProjects.findFirst({
    where: ownProjectWhere(hackathonId, null, participantId),
    columns: { status: true },
  });

  if (solo && solo.status !== "draft") {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "You already have a solo project submitted. Withdraw it from Submit Project before joining a team.",
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkTeamEditWindow(ctx.db as DrizzleDB, input.hackathonId);

      try {
        return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
          async (tx) => {
            // 1. Check if user is registered for this hackathon. Read inside
            // the transaction so a double-submit cannot both see no team.
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

            // 4. Claim the participant's team slot. The `teamId is null`
            // condition is what settles a race: whoever loses it matches no row
            // and rolls the team it just inserted back out again.
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
        const message =
          error instanceof Error ? error.message : "Unknown error";
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkTeamEditWindow(ctx.db as DrizzleDB, input.hackathonId);

      try {
        return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
          async (tx) => {
            // 1. Verify user is registered for hackathon. Read inside the
            // transaction so the slot claim below settles against the same row.
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

            // 4. Join the team. The `teamId is null` condition carries the
            // check above into the write, so a racing join loses here instead
            // of quietly moving the user off the team it already seated them on.
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

            // 5. Take the seat. The count read above is a snapshot, so the
            // increment carries the capacity test with it: whoever loses a
            // race for the last seat updates no row and is turned away.
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
        const message =
          error instanceof Error ? error.message : "Unknown error";
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
            const team = await tx.query.hackathonTeams.findFirst({
              where: eq(hackathonTeams.id, participant.teamId!),
            });

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

                // Disbanding takes the team's project with it, so a submission
                // has to be withdrawn deliberately, not as a side effect.
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

              // Names only what exists. There is no ownership transfer, and
              // telling a stuck captain to do something the product cannot do
              // leaves them with no move at all.
              throw new TRPCError({
                code: "FORBIDDEN",
                message:
                  "The captain cannot leave a team that still has other members. Disband the team, or ask a teammate to leave first.",
              });
            }

            // 1. Give up the seat. The `teamId = team.id` condition makes a
            // second Leave match no row instead of decrementing twice.
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

            // 2. Decrement, computed by the database so a concurrent join is
            // not overwritten. Drifting low to 1 makes the captain branch above
            // delete the team and its project with members still on it.
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
        const message =
          error instanceof Error ? error.message : "Unknown error";
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const window = await checkTeamEditWindow(
        ctx.db as DrizzleDB,
        input.hackathonId,
      );

      // Disbanding empties a roster just as leaving does, so it shuts at the
      // same lock.
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
            const project = await tx.query.hackathonProjects.findFirst({
              where: eq(hackathonProjects.teamId, team.id),
            });

            // Disbanding takes the team's project with it, so a submission has
            // to be withdrawn deliberately, not as a side effect.
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
        const message =
          error instanceof Error ? error.message : "Unknown error";
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
        description: z
          .string()
          .min(10, "Description must be at least 10 characters"),
        technologies: z.array(z.string()).optional(),
        tracks: z.array(z.string()).optional(),
        challenges: z.array(z.string()).optional(),
        // Judge routing filters on exactly this, and nothing else in the
        // product ever set it — every CreateX judge got an empty pool.
        isCreateX: z.boolean().optional(),
        githubUrl: z
          .string()
          .url("Must be a valid URL")
          .optional()
          .or(z.literal("")),
        demoUrl: z
          .string()
          .url("Must be a valid URL")
          .optional()
          .or(z.literal("")),
        videoUrl: z
          .string()
          .url("Must be a valid URL")
          .optional()
          .or(z.literal("")),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Verify user is registered for hackathon
      const participant = await (
        ctx.db as NonNullable<typeof ctx.db>
      ).query.hackathonParticipants.findFirst({
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
      const hackathon = await (
        ctx.db as NonNullable<typeof ctx.db>
      ).query.hackathons.findFirst({
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

      const now = new Date();
      const baseTime = hackathon.hackingStartTime ?? hackathon.startDate;
      const window = computeSubmissionWindow(baseTime, now);
      const devpostFinalDeadline = window.editsCloseAt;

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

      // Someone who is on a team always submits as that team, whether or not
      // the client sent the id along.
      const teamId = input.teamId ?? participant.teamId ?? undefined;

      try {
        return await (ctx.db as NonNullable<typeof ctx.db>).transaction(
          async (tx) => {
            // Fetch existing project to check for edit restrictions. Read
            // inside the transaction, since the update-or-insert decision below
            // turns on it.
            // A solo entry is found by its author, exactly as a team entry is
            // found by its team, so editing a submission works the same either
            // way instead of filing a second row or being refused.
            const existingProject = await tx.query.hackathonProjects.findFirst({
              where: ownProjectWhere(
                input.hackathonId,
                teamId,
                participant.id,
              ),
            });

            if (existingProject && now > devpostFinalDeadline) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message:
                  "Project edits are closed. Devposts must be final 34 hours after the hacking starts.",
              });
            }

            // Validate team ownership to prevent IDOR attacks
            // Use teamId from participant record instead of nested team object
            if (teamId) {
              // Verify team belongs to this hackathon
              const team = await tx.query.hackathonTeams.findFirst({
                where: and(
                  eq(hackathonTeams.id, teamId),
                  eq(hackathonTeams.hackathonId, input.hackathonId),
                ),
              });

              if (!team) {
                throw new TRPCError({
                  code: "NOT_FOUND",
                  message: "Team not found for this hackathon.",
                });
              }

              // Verify captain ownership using teamId comparison (not nested object)
              if (team.captainId !== (ctx.userId as string)) {
                throw new TRPCError({
                  code: "FORBIDDEN",
                  message: "Only the team captain can submit the project.",
                });
              }
            }

            // We clean up empty strings to be null
            const githubUrl =
              input.githubUrl === "" ? undefined : input.githubUrl;
            const demoUrl = input.demoUrl === "" ? undefined : input.demoUrl;
            const videoUrl = input.videoUrl === "" ? undefined : input.videoUrl;

            let finalProject;
            if (existingProject) {
              // Update existing
              const [updated] = await tx
                .update(hackathonProjects)
                .set({
                  name: input.name,
                  description: input.description,
                  technologies: input.technologies || [],
                  tracks: input.tracks || [],
                  challenges: input.challenges || [],
                  isCreateX: input.isCreateX ?? false,
                  githubUrl,
                  demoUrl,
                  videoUrl,
                  // Only ever forward, never backwards. Writing "submitted"
                  // unconditionally let a team editing a demo link after
                  // promotion knock their project out of "judging" — which
                  // re-opened withdrawProject's status guard and let them
                  // withdraw a project judges were actively scoring.
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
                  hackathonId: input.hackathonId,
                  teamId,
                  submittedById: participant.id,
                  name: input.name,
                  description: input.description,
                  technologies: input.technologies || [],
                  tracks: input.tracks || [],
                  challenges: input.challenges || [],
                  isCreateX: input.isCreateX ?? false,
                  githubUrl,
                  demoUrl,
                  videoUrl,
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
          },
        );
      } catch (error: unknown) {
        if (error instanceof TRPCError) throw error;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to submit project: ${message}`,
        });
      }
    }),

  /**
   * Puts a submission back to draft.
   *
   * disbandTeam and the sole-captain branch of leaveTeam both refuse while a
   * submitted project exists and tell the user it "must be withdrawn first".
   * Nothing could do that — submitProject is the only writer and always writes
   * "submitted" — so that instruction named an action the product did not have
   * and the two flows were simply dead ends.
   */
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

          // Only the captain files or withdraws on a team's behalf, matching
          // the rule submitProject already applies.
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

          // Once judging has it, withdrawing would pull a project out from
          // under scores that already reference it.
          if (project.status === "judging" || project.status === "winner") {
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

  /** Lets the UI disable team actions instead of letting the mutation fail. */
  window: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      return await loadTeamWindow(ctx.db as DrizzleDB, input.hackathonId);
    }),

  /**
   * Every team in a hackathon.
   *
   * Deliberately NOT paginated. The Teams tab finds the caller's own team by
   * searching this list, so with a page size any member of an early-created
   * team would fall off page one and lose their entire "Your Team" panel,
   * including Leave Team, with nothing on screen explaining why.
   *
   * Bounded by caching instead. The TTL is deliberately short: the tab
   * refetches immediately after every join, leave and disband, and a long TTL
   * served from another instance would show a roster the user just changed.
   */
  list: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:teams`;

      const fetchTeams = () =>
        (ctx.db as NonNullable<typeof ctx.db>).query.hackathonTeams.findMany({
          where: eq(hackathonTeams.hackathonId, input.hackathonId),
          with: {
            captain: {
              columns: { id: true, name: true, image: true },
            },
            participants: {
              // Any signed-in caller can read every team here, so it carries
              // neither the decision made on each application —
              // registrationStatus names everyone rejected or waitlisted — nor
              // the participant id, which is the entire content of that
              // participant's event pass QR. userId identifies the captain and
              // keys the list.
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

  /**
   * The one project the caller owns in a hackathon, so the submission form can
   * be filled from exactly the record a resubmit would overwrite. Without this
   * a solo hacker sees a blank form over a live submission, and saving a typo
   * fix silently wipes the links they had already filed.
   */
  /**
   * The submission window for one edition, so /submit can say whether it is
   * open before somebody fills the form in. Same computation the mutation
   * enforces with, so the two cannot drift.
   */
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
        // submittedById is a participant id — a pass QR — and for a team entry
        // it belongs to the captain rather than the caller.
        columns: { submittedById: false },
      });

      return project ?? null;
    }),

  /**
   * Every project the caller owns, across hackathons. Reading these off the
   * team relation alone leaves a solo hacker's submissions invisible.
   */
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
});
