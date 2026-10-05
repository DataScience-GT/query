import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../../trpc";
import {
  judges,
  judgeAssignments,
  judgeVotes,
  judgingProjects,
  judgeQueue,
  hackathons,
  hackathonProjects,
  users,
  hackathonParticipants,
} from "@query/db";
import { eq, and, asc, sql, inArray, isNull } from "drizzle-orm";
import {
  isAdmin,
  isSuperAdmin,
  notHackathonBanned,
} from "../../middleware/procedures";
import { CacheKeys, invalidatePortalContext } from "../../middleware/cache";
import type { DrizzleDB } from "@query/db";
import { isLive, loadGroups, loadPool } from "./dispatch";

// Judges draw tables from a shared pool (dispatch.ts) instead of holding a
// list built in advance. Clears rows an earlier version built that the judge
// never started, which would otherwise read as visits, and returns how many
// projects the judge can be sent to.
async function poolSizeForJudge(
  db: DrizzleDB,
  opts: { judgeId: string; hackathonId: string },
) {
  await db
    .delete(judgeQueue)
    .where(
      and(
        eq(judgeQueue.judgeId, opts.judgeId),
        eq(judgeQueue.hackathonId, opts.hackathonId),
        eq(judgeQueue.isCompleted, false),
        isNull(judgeQueue.startedAt),
        isNull(judgeQueue.arrivedAt),
      ),
    );
  const { pool } = await loadPool(db, opts.judgeId, opts.hackathonId);
  return pool.length;
}

// The labels a judge's track may take, for one edition. Routing matches these
// exactly, so anything else classifies the judge as sponsor/special and
// filters their pool to zero with nothing on screen explaining why. "createX"
// is here because dispatch routes it on the project flag.
async function assertTrackExists(
  db: DrizzleDB,
  hackathonId: string,
  track: string | null | undefined,
): Promise<string | null> {
  if (!track) return null;

  const hackathon = await db.query.hackathons.findFirst({
    where: eq(hackathons.id, hackathonId),
    columns: { tracks: true, challenges: true },
  });

  const allowed = [
    ...(hackathon?.tracks ?? []),
    ...(hackathon?.challenges ?? []),
    "createX",
  ];

  // Case-insensitive match, but the stored value is the edition's own spelling:
  // routing compares exactly, so "ai" must become "AI" here.
  const match = allowed.find(
    (t) => t.toLowerCase() === track.trim().toLowerCase(),
  );

  if (!match) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: allowed.length === 1
        ? "This hackathon has no tracks or challenges configured yet — set them on the edition before assigning a judge to one."
        : `"${track}" is not a track or challenge on this hackathon. Choose one of: ${allowed.join(", ")}.`,
    });
  }

  return match;
}

export const judgeAdminRouter = createTRPCRouter({
  // Judges, optionally scoped to one hackathon. A judges row belongs to exactly
  // one edition and assignToHackathon refuses any judge from another, so an
  // unscoped list offered only judges the server was guaranteed to reject.
  list: isAdmin
    .input(
      z
        .object({ hackathonId: z.string().uuid().optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
    const allJudges = await (ctx.db as DrizzleDB).query.judges.findMany({
      where: input?.hackathonId
        ? eq(judges.hackathonId, input.hackathonId)
        : undefined,
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        assignments: {
          with: {
            hackathon: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: (judges, { desc }) => [desc(judges.createdAt)],
    });

      return allJudges;
    }),

  // Adds a judge directly — a sponsor or a walk-in — rather than waiting for
  // them to apply. By email, because that is what an organiser has; the
  // person needs an account, which signing in once creates.
  create: isAdmin
    .input(
      z
        .object({
          userId: z.string().min(1).max(255).optional(),
          email: z.string().trim().email().max(255).optional(),
          hackathonId: z.string().uuid(),
          name: z.string().max(255).optional(),
        })
        .refine((input) => !!input.userId || !!input.email, {
          message: "Give the judge's email address.",
          path: ["email"],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await (ctx.db as DrizzleDB).query.users.findFirst({
        where: input.userId
          ? eq(users.id, input.userId)
          : sql`lower(${users.email}) = lower(${input.email!})`,
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: input.userId
            ? "User not found"
            : "No account uses that email. Ask them to sign in to the portal once, then add them.",
        });
      }

      const existing = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: and(
          eq(judges.userId, user.id),
          eq(judges.hackathonId, input.hackathonId),
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already a judge for this hackathon",
        });
      }

      const result = await (ctx.db as DrizzleDB)
        .insert(judges)
        .values({
          userId: user.id,
          hackathonId: input.hackathonId,
          name: input.name || user.name,
          email: user.email,
          isActive: true, // Manually created judges are active by default
        })
        .returning();

      // Same as approval: the role gate and the sidebar both cache, so the new
      // judge would otherwise wait out a 5-minute TTL for the Judge tab.
      ctx.cache.deletePattern(`${CacheKeys.judge(user.id)}*`);
      invalidatePortalContext(user.id);

      return result[0];
    }),

  assignToHackathon: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        hackathonId: z.string().uuid(),
        isLead: z.boolean().optional(),
        track: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // A judges row belongs to one hackathon and isJudge authorizes against that.
      // Assigning across editions builds a queue nobody can ever open.
      const judge = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
        columns: { hackathonId: true },
      });

      if (!judge) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Judge not found" });
      }

      if (judge.hackathonId !== input.hackathonId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This judge belongs to a different hackathon",
        });
      }

      const existing = await (
        ctx.db as DrizzleDB
      ).query.judgeAssignments.findFirst({
        where: and(
          eq(judgeAssignments.judgeId, input.judgeId),
          eq(judgeAssignments.hackathonId, input.hackathonId),
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Judge already assigned",
        });
      }

      const track = await assertTrackExists(
        ctx.db as DrizzleDB,
        input.hackathonId,
        input.track,
      );

      const result = await (ctx.db as DrizzleDB)
        .insert(judgeAssignments)
        .values({
          judgeId: input.judgeId,
          hackathonId: input.hackathonId,
          isLead: input.isLead || false,
          track,
        })
        .returning();

      // No queue to build: the judge draws tables from the shared pool as soon
      // as they are active. See dispatch.ts.
      return result[0];
    }),

  // Turns submitted projects into judgeable ones — the only way a judging entry
  // is created. Idempotent: judging_project_source_unique pins one judgeable
  // row per submission, so re-running only adds late submissions.
  promoteSubmissions: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // Serializes concurrent promotions, so two organisers pressing the button
        // together cannot both read the same max table number and duplicate it.
        await tx
          .select({ id: hackathons.id })
          .from(hackathons)
          .where(eq(hackathons.id, input.hackathonId))
          .for("update");

        const submissions = await tx.query.hackathonProjects.findMany({
          where: and(
            eq(hackathonProjects.hackathonId, input.hackathonId),
            inArray(hackathonProjects.status, ["submitted", "judging"]),
          ),
          with: { team: { columns: { name: true } } },
          orderBy: [asc(hackathonProjects.submittedAt)],
        });

        if (submissions.length === 0) {
          return {
            created: 0,
            alreadyPresent: 0,
            total: 0,
          };
        }

        const existing = await tx.query.judgingProjects.findMany({
          where: eq(judgingProjects.hackathonId, input.hackathonId),
          columns: { id: true, sourceProjectId: true, tableNumber: true },
        });

        const promoted = new Set(
          existing
            .map((row) => row.sourceProjectId)
            .filter((id): id is string => !!id),
        );

        const fresh = submissions.filter((s) => !promoted.has(s.id));

        let nextTable = existing.reduce(
          (max, row) => Math.max(max, row.tableNumber),
          0,
        );

        if (fresh.length > 0) {
          await tx.insert(judgingProjects).values(
            fresh.map((submission) => ({
              hackathonId: input.hackathonId,
              sourceProjectId: submission.id,
              name: submission.name,
              description: submission.description,
              tableNumber: ++nextTable,
              // hackathon_project.teamMembers is text[]; this column is a single text
              // field. Joined, not assigned — an array here is a type error at best and
              // "[object Object]" on a judge's screen at worst.
              teamMembers:
                submission.team?.name ??
                (submission.teamMembers?.length
                  ? submission.teamMembers.join(", ")
                  : null),
              projectUrl: submission.demoUrl,
              repoUrl: submission.githubUrl,
              tracks: submission.tracks?.length ? submission.tracks : null,
              challenges: submission.challenges?.length
                ? submission.challenges
                : null,
              isCreateX: submission.isCreateX ?? false,
            })),
          );

          await tx
            .update(hackathonProjects)
            .set({ status: "judging", updatedAt: new Date() })
            .where(
              inArray(
                hackathonProjects.id,
                fresh.map((submission) => submission.id),
              ),
            );
        }

        return {
          created: fresh.length,
          alreadyPresent: submissions.length - fresh.length,
          total: submissions.length,
        };
      });
    }),

  setActive: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Read first, because `.returning()` hands back the row as it now is — the
      // approval email has to know whether this click was the transition.
      const before = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
        columns: { isActive: true },
      });

      const [updated] = await (ctx.db as DrizzleDB)
        .update(judges)
        .set({ isActive: input.isActive })
        .where(eq(judges.id, input.judgeId))
        .returning({
          userId: judges.userId,
          hackathonId: judges.hackathonId,
          email: judges.email,
        });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Judge not found" });
      }

      // Keeps the assignment's own status column honest. judges.isActive is what
      // every judging gate reads; this column was written once as "pending" and
      // never touched, so the table showed approved judges as pending. Mirror only.
      await (ctx.db as DrizzleDB)
        .update(judgeAssignments)
        .set({ status: input.isActive ? "approved" : "pending" })
        .where(
          and(
            eq(judgeAssignments.judgeId, input.judgeId),
            eq(judgeAssignments.hackathonId, updated.hackathonId),
          ),
        );

      // isJudge and judge.isJudge both cache the role for 60s per user per
      // hackathon; approval has to take effect now, not a minute from now.
      ctx.cache.deletePattern(`${CacheKeys.judge(updated.userId)}*`);
      // The sidebar reads portal context, which lives 5 minutes — without this the
      // approved judge waits out that TTL before the Judge tab appears.
      invalidatePortalContext(updated.userId);

      // Approval builds the queue, because nothing else will: judge.register always
      // writes an assignment row and assignToHackathon refuses anyone who has one,
      // so the documented path produced an active judge whose portal said "All
      // Done". Only when the queue is empty — a judge suspended and reinstated must
      // come back to the one they were part-way through.
      let queuedProjects: number | null = null;

      if (input.isActive) {
        // Check and build in one transaction, behind a lock on the judge row.
        // "Empty? then build" is a read then a write, and judge_queue has no unique
        // on (judge, project), so two approvals arriving together both saw an empty
        // queue and gave the judge every project twice.
        queuedProjects = await (ctx.db as DrizzleDB).transaction(async (tx) => {
          await tx
            .select({ id: judges.id })
            .from(judges)
            .where(eq(judges.id, input.judgeId))
            .for("update");

          const assignment = await tx.query.judgeAssignments.findFirst({
            where: and(
              eq(judgeAssignments.judgeId, input.judgeId),
              eq(judgeAssignments.hackathonId, updated.hackathonId),
            ),
            columns: { id: true },
          });

          if (!assignment) return null;

          // Nothing to build: an active judge draws from the shared pool.
          return await poolSizeForJudge(tx as unknown as DrizzleDB, {
            judgeId: input.judgeId,
            hackathonId: updated.hackathonId,
          });
        });
      }

      // Tells the judge they were approved — the register success screen promises
      // this and nothing sent it. Only on the transition, and after the queue
      // exists so "your queue is ready" is true. Best-effort: a mail failure must
      // not undo an approval already in the database.
      if (input.isActive && before?.isActive !== true && updated.email) {
        try {
          const hackathon = await (
            ctx.db as DrizzleDB
          ).query.hackathons.findFirst({
            where: eq(hackathons.id, updated.hackathonId),
            columns: { name: true },
          });

          const { sendJudgeApprovedEmail } = await import("@query/auth/email");
          await sendJudgeApprovedEmail({
            email: updated.email,
            hackathonName: hackathon?.name ?? "the hackathon",
          });
        } catch (error) {
          // Deliberate operational logging: the approval stands and this is the only
          // record that the notice did not go out.
          // eslint-disable-next-line no-console
          console.error(
            `[Email Service] Judge approval notice failed for judge ${input.judgeId}:`,
            error,
          );
        }
      }

      return { success: true, isActive: input.isActive, queuedProjects };
    }),

  // Corrects a judge's track after the fact. Without it a wrong track was
  // permanent: it routes their whole pool, assignToHackathon refuses anyone who
  // already has an assignment row, and no screen could edit it.
  updateAssignmentTrack: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        hackathonId: z.string().uuid(),
        /** Null clears the track, giving the judge the whole project pool. */
        track: z.string().max(200).nullable(),
        // Change the track even though this judge has scored. Completed slots are
        // kept; only the unjudged remainder is rebuilt.
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const assignment = await (
        ctx.db as DrizzleDB
      ).query.judgeAssignments.findFirst({
        where: and(
          eq(judgeAssignments.judgeId, input.judgeId),
          eq(judgeAssignments.hackathonId, input.hackathonId),
        ),
        columns: { id: true },
      });

      if (!assignment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This judge is not assigned to this hackathon",
        });
      }

      const track = await assertTrackExists(
        ctx.db as DrizzleDB,
        input.hackathonId,
        input.track,
      );

      // Counted before anything is written, so the refusal is decided on the state
      // the organiser is looking at.
      const [completed] = await (ctx.db as DrizzleDB)
        .select({ count: sql<number>`count(*)::int` })
        .from(judgeQueue)
        .where(
          and(
            eq(judgeQueue.judgeId, input.judgeId),
            eq(judgeQueue.hackathonId, input.hackathonId),
            eq(judgeQueue.isCompleted, true),
          ),
        );

      // Refuse first, then offer the override. Writing the new track while leaving
      // the old queue makes assignment and queue disagree — the judge carries on
      // scoring the old pool and nothing says so. The organiser sees the cost.
      if ((completed?.count ?? 0) > 0 && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `This judge has already scored ${completed?.count} project(s). Changing their track keeps those scores and sends them to the new track from their next table — confirm to continue.`,
        });
      }

      await (ctx.db as DrizzleDB)
        .update(judgeAssignments)
        .set({ track })
        .where(eq(judgeAssignments.id, assignment.id));

      // Scores already given stay. The judge's next tables come from the new
      // track's pool, since dispatch reads the assignment on every hand-out.
      const projectCount = await poolSizeForJudge(ctx.db as DrizzleDB, {
        judgeId: input.judgeId,
        hackathonId: input.hackathonId,
      });

      return {
        success: true,
        track,
        queueRebuilt: true,
        projectCount,
        keptCompleted: completed?.count ?? 0,
        message:
          (completed?.count ?? 0) > 0
            ? `Track updated. ${completed?.count} scored project(s) kept; their next tables come from the new track.`
            : null,
      };
    }),

  remove: isSuperAdmin
    .input(z.object({ judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // judgeVotes.judgeId cascades on delete, so removing a judge who has scored
      // erases those scores and shifts the normalization behind every ranking.
      const existingVote = await (
        ctx.db as DrizzleDB
      ).query.judgeVotes.findFirst({
        where: eq(judgeVotes.judgeId, input.judgeId),
      });

      if (existingVote) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This judge has already submitted votes and cannot be removed without discarding them.",
        });
      }

      const [removed] = await (ctx.db as DrizzleDB)
        .delete(judges)
        .where(eq(judges.id, input.judgeId))
        .returning({ userId: judges.userId });

      // Or the removed judge keeps a Judge tab every procedure behind it refuses.
      if (removed) {
        ctx.cache.deletePattern(`${CacheKeys.judge(removed.userId)}*`);
        invalidatePortalContext(removed.userId);
      }
      return { success: true };
    }),

  // Bulk-assign projects to all judges for a hackathon. Main-track judges get
  // 3–9 randomly-selected projects; special-label judges (createX, sponsor
  // challenges) get ALL matching projects.
  // The table cards to print, one per judgeable project, each carrying the code
  // a judge scans on arrival — the physical half of scan-to-start.
  tableCards: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).query.judgingProjects.findMany({
        where: and(
          eq(judgingProjects.hackathonId, input.hackathonId),
          isNull(judgingProjects.withdrawnAt),
        ),
        columns: {
          id: true,
          name: true,
          tableNumber: true,
          zone: true,
          qrCode: true,
          teamMembers: true,
        },
        orderBy: [asc(judgingProjects.tableNumber)],
      });
    }),

  /** Per-judge scoring analytics for bias detection and performance review. */
  // The judging floor for the organiser: where every judge is, how evenly the
  // projects have been seen, and whether the judges who actually turned up can
  // finish in time. Nothing here assumes a head count; pace is measured.
  liveProgress: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const now = new Date();

      const [judgeRows, visitRows, voteRows, projectRows] = await Promise.all([
        db.query.judges.findMany({
          where: eq(judges.hackathonId, input.hackathonId),
          columns: { id: true, name: true, email: true, isActive: true },
        }),
        db
          .select({
            judgeId: judgeQueue.judgeId,
            projectId: judgeQueue.projectId,
            isCompleted: judgeQueue.isCompleted,
            startedAt: judgeQueue.startedAt,
            arrivedAt: judgeQueue.arrivedAt,
            tableNumber: judgingProjects.tableNumber,
            projectName: judgingProjects.name,
          })
          .from(judgeQueue)
          .leftJoin(judgingProjects, eq(judgingProjects.id, judgeQueue.projectId))
          .where(eq(judgeQueue.hackathonId, input.hackathonId)),
        db
          .select({
            judgeId: judgeVotes.judgeId,
            projectId: judgeVotes.projectId,
            votedAt: judgeVotes.votedAt,
            durationSeconds: judgeVotes.durationSeconds,
          })
          .from(judgeVotes)
          .innerJoin(
            judgingProjects,
            and(
              eq(judgingProjects.id, judgeVotes.projectId),
              eq(judgingProjects.hackathonId, input.hackathonId),
            ),
          ),
        db.query.judgingProjects.findMany({
          where: and(
            eq(judgingProjects.hackathonId, input.hackathonId),
            isNull(judgingProjects.withdrawnAt),
          ),
          columns: { id: true },
        }),
      ]);

      const voted = new Set(voteRows.map((v) => `${v.judgeId}:${v.projectId}`));
      const secondsSince = (d: Date) =>
        Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
      const minutesSince = (d: Date | null) =>
        d ? Math.floor(secondsSince(d) / 60) : null;

      const judgesOut = judgeRows.map((judge) => {
        const visits = visitRows.filter(
          (r) => r.judgeId === judge.id && (r.startedAt || r.arrivedAt),
        );
        const votes = voteRows.filter((v) => v.judgeId === judge.id);
        const current = visits.find((r) => isLive(r, now)) ?? null;

        // Visits that closed without a score: the cutoff passed, or the judge
        // passed on the table.
        const voided = visits.filter(
          (r) =>
            (r.isCompleted || !isLive(r, now)) &&
            !voted.has(`${judge.id}:${r.projectId}`),
        ).length;

        const lastActivity = [
          ...votes.map((v) => v.votedAt),
          ...visits.map((r) => r.arrivedAt ?? r.startedAt),
        ].reduce<Date | null>(
          (acc, d) => (d && (!acc || d > acc) ? d : acc),
          null,
        );

        const durations = votes
          .map((v) => v.durationSeconds)
          .filter((d): d is number => typeof d === "number" && d > 0)
          .sort((a, b) => a - b);

        const status = !judge.isActive
          ? ("suspended" as const)
          : current
            ? ("judging" as const)
            : visits.length === 0
              ? ("not_started" as const)
              : ("between" as const);

        return {
          judgeId: judge.id,
          name: judge.name,
          email: judge.email,
          status,
          scored: votes.length,
          voided,
          medianSeconds: durations.length
            ? durations[Math.floor(durations.length / 2)]!
            : null,
          idleMinutes: current ? 0 : minutesSince(lastActivity),
          lastActiveAt: lastActivity,
          current: current
            ? {
                tableNumber: current.tableNumber,
                projectName: current.projectName,
                // Walking until the tap or scan, then the judging clock.
                phase: current.arrivedAt ? ("judging" as const) : ("walking" as const),
                seconds: secondsSince((current.arrivedAt ?? current.startedAt)!),
              }
            : null,
        };
      });

      // Worst first: a judge who has stopped is the reason to open this screen.
      const rank = { not_started: 0, between: 1, judging: 2, suspended: 3 };
      judgesOut.sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          (b.idleMinutes ?? 0) - (a.idleMinutes ?? 0),
      );

      // How evenly the main panel has seen the projects. Two looks each is the
      // floor the pool works towards before anyone gets a third. Sponsor and
      // special-label scores cover their own prize, as in dispatch, so they
      // count towards neither the floor nor the pace that estimates it.
      const { groupByJudge } = await loadGroups(db, input.hackathonId);
      const mainVotes = voteRows.filter((v) => groupByJudge(v.judgeId) === "main");
      const TARGET_LOOKS = 2;
      const looks = new Map<string, number>(projectRows.map((p) => [p.id, 0]));
      for (const v of mainVotes) {
        if (looks.has(v.projectId)) looks.set(v.projectId, looks.get(v.projectId)! + 1);
      }
      const counts = [...looks.values()];
      const shortfall = counts.reduce((sum, n) => sum + Math.max(0, TARGET_LOOKS - n), 0);

      // Measured pace over the last 30 minutes, so the estimate tracks the
      // judges who are actually on the floor, not the number who signed up.
      const WINDOW_MIN = 30;
      const windowStart = now.getTime() - WINDOW_MIN * 60_000;
      const recentScores = mainVotes.filter(
        (v) => v.votedAt && v.votedAt.getTime() >= windowStart,
      ).length;
      const activeJudges = judgesOut.filter(
        (j) =>
          j.status !== "suspended" &&
          j.lastActiveAt &&
          j.lastActiveAt.getTime() >= now.getTime() - 15 * 60_000,
      ).length;
      const perMinute = recentScores / WINDOW_MIN;

      return {
        judges: judgesOut.map(({ lastActiveAt: _, ...j }) => j),
        coverage: {
          projects: counts.length,
          unseen: counts.filter((n) => n === 0).length,
          minLooks: counts.length ? Math.min(...counts) : 0,
          atTarget: counts.filter((n) => n >= TARGET_LOOKS).length,
          targetLooks: TARGET_LOOKS,
        },
        pace: {
          activeJudges,
          scoredLast30Min: recentScores,
          // Null until there is a pace to extrapolate from.
          minutesToTarget:
            shortfall === 0 ? 0 : perMinute > 0 ? Math.ceil(shortfall / perMinute) : null,
        },
        totals: {
          judges: judgesOut.length,
          scored: voteRows.length,
          voided: judgesOut.reduce((sum, j) => sum + j.voided, 0),
        },
      };
    }),

  getJudgeAnalytics: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `hackathon:${input.hackathonId}:judge-analytics`;
      const cached = ctx.cache.get<unknown>(cacheKey);
      if (cached) return cached;

      // Fetch votes for this hackathon via an explicit join.
      const allVotes = await (ctx.db as DrizzleDB)
        .select({
          judgeId: judgeVotes.judgeId,
          projectId: judgeVotes.projectId,
          score: judgeVotes.score,
          durationSeconds: judgeVotes.durationSeconds,
          judgeName: judges.name,
          judgeUserId: judges.userId,
        })
        .from(judgeVotes)
        .innerJoin(judges, eq(judges.id, judgeVotes.judgeId))
        .innerJoin(
          judgingProjects,
          and(
            eq(judgingProjects.id, judgeVotes.projectId),
            eq(judgingProjects.hackathonId, input.hackathonId),
          ),
        );

      const queueStats = await (ctx.db as DrizzleDB)
        .select({
          judgeId: judgeQueue.judgeId,
          judgeName: judges.name,
          total: sql<number>`count(*)`,
          completed: sql<number>`sum(case when ${judgeQueue.isCompleted} then 1 else 0 end)`,
        })
        .from(judgeQueue)
        .innerJoin(judges, eq(judges.id, judgeQueue.judgeId))
        .where(eq(judgeQueue.hackathonId, input.hackathonId))
        .groupBy(judgeQueue.judgeId, judges.name);

      const queueMap = new Map(queueStats.map((q) => [q.judgeId, q]));

      // Group votes by judgeId
      const byJudge = new Map<string, typeof allVotes>();
      for (const vote of allVotes) {
        const list = byJudge.get(vote.judgeId) ?? [];
        list.push(vote);
        byJudge.set(vote.judgeId, list);
      }

      // Global mean across all votes
      const allScores = allVotes.map((v) => v.score);
      const globalMean =
        allScores.length > 0
          ? allScores.reduce((a, b) => a + b, 0) / allScores.length
          : 0;

      const round2 = (n: number) => Math.round(n * 100) / 100;

      // A judge with a queue who has scored nothing is exactly who an organizer
      // needs to find mid-event, so drive the list from queues as well as votes.
      const judgeIds = new Set([...byJudge.keys(), ...queueMap.keys()]);

      const analytics = [...judgeIds].map((judgeId) => {
        const votes = byJudge.get(judgeId) ?? ([] as typeof allVotes);
        const scores = votes.map((v) => v.score);
        const mean =
          scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;
        const variance =
          scores.length > 0
            ? scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length
            : 0;
        const std = Math.sqrt(variance);

        // Bias score: how far this judge's mean is from the global mean, in std units
        const biasScore =
          scores.length > 0 ? round2((mean - globalMean) / (std || 1)) : 0;
        const biasLabel: "strict" | "neutral" | "lenient" =
          biasScore < -0.5 ? "strict" : biasScore > 0.5 ? "lenient" : "neutral";

        const avgDuration = votes
          .filter((v) => v.durationSeconds != null)
          .reduce((s, v, _, a) => s + (v.durationSeconds ?? 0) / a.length, 0);

        const qs = queueMap.get(judgeId);
        const completionRate =
          qs && Number(qs.total) > 0
            ? round2(Number(qs.completed) / Number(qs.total))
            : null;

        const firstVote = votes[0];

        return {
          judgeId,
          name: firstVote?.judgeName ?? qs?.judgeName ?? "Unknown",
          votesSubmitted: scores.length,
          mean: round2(mean),
          std: round2(std),
          min: scores.length > 0 ? Math.min(...scores) : 0,
          max: scores.length > 0 ? Math.max(...scores) : 0,
          biasScore,
          biasLabel,
          avgDurationSeconds: avgDuration > 0 ? round2(avgDuration) : null,
          completionRate,
          queueTotal: qs ? Number(qs.total) : null,
          queueCompleted: qs ? Number(qs.completed) : null,
        };
      });

      // Sort: most votes first
      analytics.sort((a, b) => b.votesSubmitted - a.votesSubmitted);

      const result = {
        analytics,
        globalMean: round2(globalMean),
        totalVotes: allVotes.length,
      };
      ctx.cache.set(cacheKey, result, 30);
      return result;
    }),

  register: notHackathonBanned
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        name: z.string().min(1).max(200),
        email: z.string().email().max(200),
        phone: z.string().max(20).optional(),
        company: z.string().max(200).optional(),
        title: z.string().max(200).optional(),
        specialty: z.string().max(200).optional(),
        linkedinUrl: z.string().url().max(500).optional().or(z.literal("")),
        githubUrl: z.string().url().max(500).optional().or(z.literal("")),
        previousExperience: z.string().max(2000).optional(),
        dietaryRestrictions: z.array(z.string()).optional(),
        shirtSize: z.string().optional(),
        whyJudge: z.string().max(2000).optional(),
        preferredTrack: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // Only an edition people can see and that is not over takes judges. Any
        // uuid used to pass, and one that did not exist hit the foreign key as
        // a 500. Announced counts: judges are recruited before registration.
        const hackathon = await tx.query.hackathons.findFirst({
          where: eq(hackathons.id, input.hackathonId),
          columns: { isPublic: true, status: true },
        });
        if (
          !hackathon ||
          !hackathon.isPublic ||
          !["announced", "open", "closed", "in_progress"].includes(
            hackathon.status,
          )
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That hackathon is not taking judge applications.",
          });
        }

        // Check if user is registered as a participant for this hackathon
        const participant = await tx.query.hackathonParticipants.findFirst({
          where: and(
            eq(hackathonParticipants.hackathonId, input.hackathonId),
            eq(hackathonParticipants.userId, ctx.userId as string),
          ),
        });

        if (participant) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "You cannot apply to be a judge because you are registered as a participant for this hackathon.",
          });
        }

        // Find existing judge profile or create one for this hackathon
        let judge = await tx.query.judges.findFirst({
          where: and(
            eq(judges.userId, ctx.userId),
            eq(judges.hackathonId, input.hackathonId),
          ),
        });

        if (judge) {
          await tx
            .update(judges)
            .set({
              name: input.name,
              email: input.email,
              phone: input.phone,
              company: input.company,
              title: input.title,
              specialty: input.specialty,
              linkedinUrl: input.linkedinUrl,
              githubUrl: input.githubUrl,
              previousExperience: input.previousExperience,
              dietaryRestrictions: input.dietaryRestrictions || [],
              shirtSize: input.shirtSize,
              whyJudge: input.whyJudge,
            })
            .where(eq(judges.id, judge.id));
        } else {
          const inserted = await tx
            .insert(judges)
            .values({
              userId: ctx.userId,
              hackathonId: input.hackathonId,
              name: input.name,
              email: input.email,
              phone: input.phone,
              company: input.company,
              title: input.title,
              specialty: input.specialty,
              linkedinUrl: input.linkedinUrl || null,
              githubUrl: input.githubUrl || null,
              previousExperience: input.previousExperience,
              dietaryRestrictions: input.dietaryRestrictions || [],
              shirtSize: input.shirtSize,
              whyJudge: input.whyJudge,
              isActive: false, // Must be approved by admin
            })
            .returning();
          judge = inserted[0];
        }

        // Create the hackathon assignment request
        if (!judge)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create judge profile",
          });

        const existingAssignment = await tx.query.judgeAssignments.findFirst({
          where: and(
            eq(judgeAssignments.judgeId, judge.id),
            eq(judgeAssignments.hackathonId, input.hackathonId),
          ),
        });

        if (existingAssignment) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You have already applied to judge this hackathon.",
          });
        }

        // Free text used to land straight in the routing column, so a judge who typed
        // "ai" instead of "AI" was classified sponsor/special and given an empty
        // pool — invisible to them and to the organiser.
        const track = await assertTrackExists(
          tx as unknown as DrizzleDB,
          input.hackathonId,
          input.preferredTrack,
        );

        await tx.insert(judgeAssignments).values({
          judgeId: judge.id,
          hackathonId: input.hackathonId,
          track,
          status: "pending",
        });

        return { success: true };
      });
    }),
});
