import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
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
import { isAdmin } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { CacheKeys, invalidatePortalContext } from "../../middleware/cache";
import type { DrizzleDB } from "@query/db";
import { shuffleArray, buildCoverageQueues } from "./helpers";

/** Rows per queue INSERT. Well under the ~16k that Postgres's 65535-parameter
 *  ceiling allows at 4 bound parameters per row. */
const QUEUE_INSERT_CHUNK = 5000;

/**
 * The projects one judge should see, in order — their whole queue.
 *
 * Shared by `initializeQueue` (an explicit per-judge rebuild) and `setActive`
 * (approval), so an approved judge cannot end up with a queue built by
 * different rules than the one the admin can rebuild by hand.
 *
 * Replaces whatever queue the judge had. Callers decide whether replacing is
 * safe — `setActive` only calls this when the queue is empty, because a judge
 * part-way through theirs must not be reshuffled mid-event.
 */
async function rebuildQueueForJudge(
  db: DrizzleDB,
  opts: {
    judgeId: string;
    hackathonId: string;
    shuffle?: boolean;
    /**
     * Leave completed slots in place and rebuild only the remainder. A
     * completed slot cannot be reconstructed — skipProject marks one done
     * without writing a vote — so deleting it sends the judge back to a table
     * they already dealt with.
     */
    keepCompleted?: boolean;
  },
) {
  await db
    .delete(judgeQueue)
    .where(
      and(
        eq(judgeQueue.judgeId, opts.judgeId),
        eq(judgeQueue.hackathonId, opts.hackathonId),
        opts.keepCompleted ? eq(judgeQueue.isCompleted, false) : undefined,
      ),
    );

  // Projects the judge has already dealt with must not come back in the new
  // queue, or they are asked to score the same table twice.
  const kept = opts.keepCompleted
    ? await db.query.judgeQueue.findMany({
        where: and(
          eq(judgeQueue.judgeId, opts.judgeId),
          eq(judgeQueue.hackathonId, opts.hackathonId),
        ),
        columns: { projectId: true, order: true },
      })
    : [];

  const keptProjectIds = new Set(kept.map((row) => row.projectId));
  const highestKeptOrder = kept.reduce(
    (max, row) => Math.max(max, row.order),
    0,
  );

  // The assignment's track is what narrows the pool; without one the judge
  // sees every project in the edition.
  const assignment = await db.query.judgeAssignments.findFirst({
    where: and(
      eq(judgeAssignments.judgeId, opts.judgeId),
      eq(judgeAssignments.hackathonId, opts.hackathonId),
    ),
  });

  const allProjects = await db.query.judgingProjects.findMany({
    // Withdrawn entries must not be queued to anyone.
    where: and(
      eq(judgingProjects.hackathonId, opts.hackathonId),
      isNull(judgingProjects.withdrawnAt),
    ),
    orderBy: [asc(judgingProjects.tableNumber)],
  });

  let projects = assignment?.track
    ? allProjects.filter((p) => {
        const inTracks = p.tracks?.includes(assignment.track!) ?? false;
        const inChallenges = p.challenges?.includes(assignment.track!) ?? false;
        const matchCreateX =
          assignment.track!.toLowerCase() === "createx" && !!p.isCreateX;
        return inTracks || inChallenges || matchCreateX;
      })
    : allProjects;

  projects = projects.filter((p) => !keptProjectIds.has(p.id));

  if (opts.shuffle) {
    projects = shuffleArray(projects);
  }

  if (projects.length > 0) {
    await db.insert(judgeQueue).values(
      projects.map((p, idx) => ({
        judgeId: opts.judgeId,
        hackathonId: opts.hackathonId,
        projectId: p.id,
        order: highestKeptOrder + idx + 1,
      })),
    );
  }

  return projects.length;
}

/**
 * The labels a judge's track may actually take, for one edition.
 *
 * Routing matches these strings exactly, so anything else silently classifies
 * the judge as sponsor/special and filters their pool to zero projects — they
 * open the portal to an empty queue with nothing on any screen explaining why.
 * "createX" is included because buildCoverageQueues routes it against the
 * project flag rather than the tracks array.
 */
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
  // the routing comparison is exact, so "ai" must become "AI" here or it
  // matches nothing later.
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

/** Does this project fall inside a judge's track/challenge label? */
const projectMatchesTrack = (
  project: {
    tracks: string[] | null;
    challenges: string[] | null;
    isCreateX?: boolean | null;
  },
  track: string | null,
) => {
  if (!track) return true;
  const inTracks = project.tracks?.includes(track) ?? false;
  const inChallenges = project.challenges?.includes(track) ?? false;
  const matchCreateX =
    track.toLowerCase() === "createx" && !!project.isCreateX;
  return inTracks || inChallenges || matchCreateX;
};

/**
 * Adds late-promoted projects to the queues that already exist, without
 * touching a single row that is already there.
 *
 * The alternative — re-running `assignJudgesToProjects` — deletes and rebuilds
 * every queue in the event, which is unsafe once judging is live. Appending is
 * the only thing that is safe mid-event, so promotion does it itself: a project
 * promoted after assignment used to sit in nobody's queue, receive zero votes,
 * and then be dropped from the standings entirely by the zero-vote rule, with
 * only an amber banner to say so.
 *
 * Coverage matches what the existing queues already give a project, so late
 * entries are judged about as many times as everything else rather than once.
 */
async function appendProjectsToExistingQueues(
  db: DrizzleDB,
  hackathonId: string,
  freshProjects: {
    id: string;
    tracks: string[] | null;
    challenges: string[] | null;
    isCreateX: boolean | null;
    tableNumber: number;
  }[],
) {
  if (freshProjects.length === 0) return 0;

  const existingQueue = await db.query.judgeQueue.findMany({
    where: eq(judgeQueue.hackathonId, hackathonId),
    columns: { judgeId: true, projectId: true, order: true },
  });

  // Nothing has been assigned yet, so there is no queue to append to — the
  // organiser still has to run assignment once, and doing it here would build
  // queues out of an incomplete project list.
  if (existingQueue.length === 0) return 0;

  const nextOrder = new Map<string, number>();
  const queueLength = new Map<string, number>();
  const coverage = new Map<string, number>();

  for (const row of existingQueue) {
    nextOrder.set(row.judgeId, Math.max(nextOrder.get(row.judgeId) ?? 0, row.order));
    queueLength.set(row.judgeId, (queueLength.get(row.judgeId) ?? 0) + 1);
    coverage.set(row.projectId, (coverage.get(row.projectId) ?? 0) + 1);
  }

  // How many judges an already-queued project is seen by, on average. Rounded
  // down but never below 1: one judge is the difference between being ranked
  // and being invisible.
  const target = Math.max(
    1,
    Math.floor(
      [...coverage.values()].reduce((sum, n) => sum + n, 0) / coverage.size,
    ),
  );

  const hackathon = await db.query.hackathons.findFirst({
    where: eq(hackathons.id, hackathonId),
    columns: { tracks: true },
  });

  const assignments = await db.query.judgeAssignments.findMany({
    where: eq(judgeAssignments.hackathonId, hackathonId),
    with: { judge: { columns: { isActive: true } } },
  });

  // Only judges who already hold a queue: anyone else is either inactive or
  // was never part of the assignment, and a queue nobody opens is coverage the
  // event never receives.
  const eligible = assignments.filter(
    (a) => a.judge.isActive !== false && queueLength.has(a.judgeId),
  );

  if (eligible.length === 0) return 0;

  // Same fallback as assignJudgesToProjects: with no tracks configured on the
  // edition, every judge label would read as a sponsor one and get everything.
  const mainTracks = new Set(
    hackathon?.tracks?.length
      ? hackathon.tracks
      : eligible.map((a) => a.track).filter((t): t is string => !!t),
  );

  const rows: {
    judgeId: string;
    hackathonId: string;
    projectId: string;
    order: number;
  }[] = [];

  const ordered = [...freshProjects].sort(
    (a, b) => a.tableNumber - b.tableNumber,
  );

  for (const project of ordered) {
    const matching = eligible.filter((a) =>
      projectMatchesTrack(project, a.track ?? null),
    );

    // Sponsor/special judges take their whole pool, exactly as the bulk
    // assignment gives it to them.
    const special = matching.filter(
      (a) => a.track && !mainTracks.has(a.track),
    );
    const main = matching
      .filter((a) => !a.track || mainTracks.has(a.track))
      // Shortest queue first, so late projects land on the judges with the
      // most room rather than piling onto whoever comes first alphabetically.
      .sort(
        (a, b) =>
          (queueLength.get(a.judgeId) ?? 0) - (queueLength.get(b.judgeId) ?? 0),
      )
      .slice(0, target);

    for (const a of [...special, ...main]) {
      const order = (nextOrder.get(a.judgeId) ?? 0) + 1;
      nextOrder.set(a.judgeId, order);
      queueLength.set(a.judgeId, (queueLength.get(a.judgeId) ?? 0) + 1);
      rows.push({
        judgeId: a.judgeId,
        hackathonId,
        projectId: project.id,
        order,
      });
    }
  }

  for (let i = 0; i < rows.length; i += QUEUE_INSERT_CHUNK) {
    await db.insert(judgeQueue).values(rows.slice(i, i + QUEUE_INSERT_CHUNK));
  }

  return rows.length;
}

export const judgeAdminRouter = createTRPCRouter({
  /**
   * Judges, optionally scoped to one hackathon.
   *
   * The scope matters: a judges row belongs to exactly one edition, and
   * assignToHackathon refuses any judge from another. Listing every judge in
   * the database meant the admin picker offered only the ones the server was
   * guaranteed to reject.
   */
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

  create: isAdmin
    .input(
      z.object({
        userId: z.string().min(1).max(255),
        hackathonId: z.string().uuid(),
        name: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await (ctx.db as DrizzleDB).query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const existing = await (ctx.db as DrizzleDB).query.judges.findFirst({
        where: and(
          eq(judges.userId, input.userId),
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
          userId: input.userId,
          hackathonId: input.hackathonId,
          name: input.name || user.name,
          isActive: true, // Manually created judges are active by default
        })
        .returning();

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
      // A judges row belongs to one hackathon, and isJudge authorizes against
      // that. Assigning across editions builds a queue nobody can ever open.
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

      const hackathon = await (ctx.db as DrizzleDB).query.hackathons.findFirst({
        where: eq(hackathons.id, input.hackathonId),
        columns: { tracks: true },
      });
      const mainTracks = new Set(hackathon?.tracks ?? []);

      const allProjects = await (
        ctx.db as DrizzleDB
      ).query.judgingProjects.findMany({
        // Withdrawn entries must not be queued to anyone.
        where: and(
          eq(judgingProjects.hackathonId, input.hackathonId),
          isNull(judgingProjects.withdrawnAt),
        ),
        orderBy: [asc(judgingProjects.tableNumber)],
      });

      // Filter by track if assigned (fixes bug: previously assigned ALL projects regardless of track)
      const isSpecial = track ? !mainTracks.has(track) : false;
      const eligibleProjects = allProjects.filter((p) =>
        projectMatchesTrack(p, track),
      );

      // Special judges always get their full pool; main track judges get a shuffled subset
      const assignedProjects = isSpecial
        ? eligibleProjects
        : shuffleArray(eligibleProjects);

      if (assignedProjects.length > 0) {
        await (ctx.db as DrizzleDB).insert(judgeQueue).values(
          assignedProjects.map((p, idx) => ({
            judgeId: input.judgeId,
            hackathonId: input.hackathonId,
            projectId: p.id,
            order: idx + 1,
          })),
        );
      }

      return result[0];
    }),

  /**
   * Turns submitted projects into judgeable ones.
   *
   * This is the only way a judging entry comes into existence. Teams submit
   * through the portal, an organiser presses one button, and every submission
   * gets a table number. Idempotent by design — run it again as late
   * submissions land and only the new ones are added, because
   * judging_project_source_unique pins one judgeable row per submission.
   */
  promoteSubmissions: isAdmin
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // Serializes concurrent promotions for this event, so two organisers
        // pressing the button together cannot both read the same max table
        // number and hand out duplicates.
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
            queueRowsAdded: 0,
            queuesNeedRebuild: false,
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

        let promotedRows: {
          id: string;
          tracks: string[] | null;
          challenges: string[] | null;
          isCreateX: boolean | null;
          tableNumber: number;
        }[] = [];

        if (fresh.length > 0) {
          promotedRows = (await tx.insert(judgingProjects).values(
            fresh.map((submission) => ({
              hackathonId: input.hackathonId,
              sourceProjectId: submission.id,
              name: submission.name,
              description: submission.description,
              tableNumber: ++nextTable,
              // hackathon_project.teamMembers is text[]; this column is a
              // single text field. Joined, not assigned — handing an array
              // straight over is a type error at best and "[object Object]"
              // on a judge's screen at worst.
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
          )
            .returning({
              id: judgingProjects.id,
              tracks: judgingProjects.tracks,
              challenges: judgingProjects.challenges,
              isCreateX: judgingProjects.isCreateX,
              tableNumber: judgingProjects.tableNumber,
            })) ?? [];

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

        // Queues are built from a snapshot of the project list, so anything
        // promoted after assignment has to be added to them here. Appending is
        // the only safe move mid-judging — a rebuild reorders every queue that
        // is already in progress.
        const queueRowsAdded = await appendProjectsToExistingQueues(
          tx as unknown as DrizzleDB,
          input.hackathonId,
          promotedRows,
        );

        const [queued] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(judgeQueue)
          .where(eq(judgeQueue.hackathonId, input.hackathonId));

        return {
          created: fresh.length,
          alreadyPresent: submissions.length - fresh.length,
          total: submissions.length,
          queueRowsAdded,
          // Only still true if queues exist, something was promoted, and the
          // append reached nobody — a track label on the new projects that no
          // active judge covers. That one an organiser does have to resolve.
          queuesNeedRebuild:
            fresh.length > 0 && (queued?.count ?? 0) > 0 && queueRowsAdded === 0,
        };
      });
    }),

  initializeQueue: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        hackathonId: z.string().uuid(),
        shuffle: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // A judges row belongs to one hackathon and isJudge authorizes against
      // that, so a queue built for a judge from another edition can never be
      // opened — the projects sit in it and are silently never scored.
      // assignToHackathon makes exactly this check; this path did not.
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

      const projectCount = await rebuildQueueForJudge(ctx.db as DrizzleDB, {
        judgeId: input.judgeId,
        hackathonId: input.hackathonId,
        shuffle: input.shuffle,
      });

      return { success: true, projectCount };
    }),

  /**
   * Approve (or suspend) a judge. judge.register creates the row inactive and
   * judge.create refuses once it exists, so without this a self-registered
   * judge can never be activated by any route.
   */
  setActive: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Read first, because `.returning()` hands back the row as it now is —
      // the approval email has to know whether this click was the transition or
      // a second press on an already-approved judge.
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

      /**
       * Keep the assignment's own status column honest.
       *
       * `judges.isActive` is what every judging gate actually reads; this column
       * was written once as "pending" at registration and never touched again,
       * so anybody reading the table directly saw every approved judge as still
       * pending. It is a mirror, not a second source of truth.
       */
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
      // The sidebar reads the portal context, which lives for 5 minutes — so
      // without this the approved judge waited out that TTL before the Judge
      // tab appeared at all.
      invalidatePortalContext(updated.userId);

      /**
       * Approval builds the queue, because nothing else will.
       *
       * `judge.register` always writes an assignment row, and
       * `assignToHackathon` refuses anyone who already has one — so the
       * documented recruitment path produced an active judge whose portal said
       * "All Done" having judged nothing. The only remedy was
       * `assignJudgesToProjects`, which deletes and rebuilds *every* queue in
       * the event and is unsafe once judging is live.
       *
       * Only when the queue is empty: a judge suspended mid-event and
       * reinstated must come back to the queue they were part-way through, not
       * a fresh one that forgets what they already scored.
       */
      let queuedProjects: number | null = null;

      if (input.isActive) {
        /**
         * Check and build inside one transaction, behind a lock on the judge
         * row.
         *
         * "Is the queue empty? then build it" is a read followed by a write,
         * and judge_queue has no unique on (judge, project) to fall back on —
         * so two approvals arriving together (a double-click, or two organisers
         * working the same list) both saw an empty queue and both built one,
         * giving the judge every project twice. The lock serialises them: the
         * second sees the queue the first wrote and does nothing.
         */
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

          const [existingQueue] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(judgeQueue)
            .where(
              and(
                eq(judgeQueue.judgeId, input.judgeId),
                eq(judgeQueue.hackathonId, updated.hackathonId),
              ),
            );

          if ((existingQueue?.count ?? 0) > 0) return null;

          return await rebuildQueueForJudge(tx as unknown as DrizzleDB, {
            judgeId: input.judgeId,
            hackathonId: updated.hackathonId,
          });
        });
      }

      /**
       * The judge is told they were approved — the /judge/register success
       * screen promises exactly this, and nothing sent it.
       *
       * Only on the transition, so re-pressing Approve does not mail them
       * again, and after the queue exists so the email's "your queue is ready"
       * is true. Best-effort: a mail provider failure must not undo an approval
       * that already happened in the database.
       */
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
          // Deliberate server-side operational logging: the approval stands and
          // this is the only record that the notice did not go out.
          // eslint-disable-next-line no-console
          console.error(
            `[Email Service] Judge approval notice failed for judge ${input.judgeId}:`,
            error,
          );
        }
      }

      return { success: true, isActive: input.isActive, queuedProjects };
    }),

  /**
   * Corrects a judge's track after the fact.
   *
   * Without this, a wrong track was permanent: the value routes their whole
   * pool, `assignToHackathon` refuses anyone who already has an assignment row,
   * and no screen could edit it — the only remedy was SQL or removing a judge
   * who may already have scored.
   */
  updateAssignmentTrack: isAdmin
    .input(
      z.object({
        judgeId: z.string().uuid(),
        hackathonId: z.string().uuid(),
        /** Null clears the track, giving the judge the whole project pool. */
        track: z.string().max(200).nullable(),
        /**
         * Change the track even though this judge has already scored. Their
         * completed slots are kept; only the unjudged remainder is rebuilt.
         */
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

      // Counted before anything is written, so the refusal below is decided on
      // the state the organiser is actually looking at.
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

      /**
       * Refuse first, then offer the override — P3, and for a real reason.
       *
       * Writing the new track while leaving the old queue in place makes the
       * assignment and the queue disagree: the judge carries on scoring the
       * pool they were routed to before, and nothing on any screen says so.
       * The organiser has to see the cost first.
       */
      if ((completed?.count ?? 0) > 0 && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `This judge has already scored ${completed?.count} project(s). Changing their track keeps those scores but rebuilds the rest of their queue — confirm to continue.`,
        });
      }

      await (ctx.db as DrizzleDB)
        .update(judgeAssignments)
        .set({ track })
        .where(eq(judgeAssignments.id, assignment.id));

      /**
       * Completed slots survive; everything unjudged is rebuilt against the new
       * track. skipProject marks a slot complete without writing a vote, so
       * those cannot be reconstructed from the votes table — deleting them
       * would send the judge back to tables they already dealt with.
       */
      const projectCount = await rebuildQueueForJudge(ctx.db as DrizzleDB, {
        judgeId: input.judgeId,
        hackathonId: input.hackathonId,
        keepCompleted: true,
      });

      return {
        success: true,
        track,
        queueRebuilt: true,
        projectCount,
        keptCompleted: completed?.count ?? 0,
        message:
          (completed?.count ?? 0) > 0
            ? `Track updated. ${completed?.count} completed slot(s) kept; the rest of the queue was rebuilt.`
            : null,
      };
    }),

  remove: isAdmin
    .input(z.object({ judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // judgeVotes.judgeId cascades on delete, so removing a judge who has
      // already scored would erase those scores and shift the normalization
      // behind every ranking.
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

      await (ctx.db as DrizzleDB)
        .delete(judges)
        .where(eq(judges.id, input.judgeId));
      return { success: true };
    }),

  /** Bulk-assign projects to all judges for a hackathon.
   *  Main-track judges (Sports, Entertainment, Finance, Healthcare) get 3–9 randomly-selected projects.
   *  Special-label judges (createX, sponsor challenges, etc.) get ALL matching projects.
   */
  assignJudgesToProjects: isAdmin
    .input(
      z.object({
        hackathonId: z.string().uuid(),
        minProjects: z.number().min(1).default(3),
        maxProjects: z.number().min(1).default(9),
        shuffle: z.boolean().default(true),
        /** When false (default), special-label/sponsor judge projects are randomized.
         *  When true, they stay grouped in table order. */
        groupSpecial: z.boolean().default(false),
        autoCalculate: z.boolean().default(true),
        /** Rebuild even though judging is live or work has been completed.
         *  Completed slots are still carried over; this only waives the
         *  refusal, so the admin has to have seen the count first. */
        force: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const outcome = await (ctx.db as DrizzleDB).transaction(async (tx) => {
        const hackathon = await tx.query.hackathons.findFirst({
          where: eq(hackathons.id, input.hackathonId),
        });
        if (!hackathon)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Hackathon not found",
          });

        // This procedure deletes and rebuilds every queue in the hackathon. Run
        // a second time by accident — and the wizard drops you straight onto
        // its button after a project import — it would restart judging for
        // everyone at once, mid-event.
        if (hackathon.judgingActive && !input.force) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Judging is live. Re-running assignment rebuilds every judge's queue. Stop judging first, or confirm to rebuild anyway.",
          });
        }

        // Completed slots are not reconstructible from votes: skipProject marks
        // a slot complete without writing one, so a wipe sends judges back to
        // tables they already dealt with. judgingActive defaults false and
        // organisers switch it off when judging closes, so the flag above
        // cannot be the only guard.
        const completed = await tx.query.judgeQueue.findMany({
          where: and(
            eq(judgeQueue.hackathonId, input.hackathonId),
            eq(judgeQueue.isCompleted, true),
          ),
        });

        if (completed.length > 0 && !input.force) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `${completed.length} judging slot(s) are already complete. Rebuilding preserves them but reorders everything else — confirm to continue.`,
          });
        }

        const allAssignments = await tx.query.judgeAssignments.findMany({
          where: eq(judgeAssignments.hackathonId, input.hackathonId),
          with: { judge: true },
        });

        // An applicant who has not been activated can never open the portal
        // (isJudge requires judges.isActive), so a queue handed to them is
        // coverage the event will never actually receive.
        const activeAssignments = allAssignments.filter(
          (a) => a.judge.isActive !== false,
        );

        // With no tracks column configured every judge label would read as a
        // sponsor/special one and bypass the per-judge caps, so fall back to
        // the tracks the judges themselves carry.
        const MAIN_TRACKS = new Set(
          hackathon.tracks?.length
            ? hackathon.tracks
            : activeAssignments
                .map((a) => a.track)
                .filter((t): t is string => !!t),
        );

        const allProjects = await tx.query.judgingProjects.findMany({
          where: and(
            eq(judgingProjects.hackathonId, input.hackathonId),
            isNull(judgingProjects.withdrawnAt),
          ),
          orderBy: [asc(judgingProjects.tableNumber)],
        });

        if (allProjects.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No projects found for this hackathon",
          });
        }

        if (activeAssignments.length === 0) {
          // An empty roster and a roster still awaiting approval need different
          // remedies from the organizer, so the message has to say which it is.
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              allAssignments.length === 0
                ? "No judges have been added to this hackathon yet"
                : "No active judges found for this hackathon - every judge is still pending approval",
          });
        }

        let minProjects = input.minProjects;
        let maxProjects = input.maxProjects;

        if (input.autoCalculate) {
          // Count active registered participants
          const participantCountResult = await tx
            .select({ count: sql<number>`count(*)` })
            .from(hackathonParticipants)
            .where(
              and(
                eq(hackathonParticipants.hackathonId, input.hackathonId),
                sql`${hackathonParticipants.registrationStatus} != 'rejected'`,
              ),
            );
          const activeRegistrations = Number(
            participantCountResult[0]?.count || 0,
          );

          const P =
            allProjects.length || Math.ceil(activeRegistrations / 4) || 1;
          const mainJudgesCount =
            activeAssignments.filter(
              (a) => !a.track || MAIN_TRACKS.has(a.track),
            ).length || 40; // Default to 40 judges as requested

          // Formula: Required Grades = Max(3, Floor((Total Judges * Judging Window Hours) / (Total Projects * Avg Time Per Project)))
          // Judging Window: 3 hours. Avg Time Per Project: 12 minutes (0.2 hours).
          const judgingWindowHours = 3;
          const avgTimePerProjectHours = 0.2;
          const calculatedQuota = Math.floor(
            (mainJudgesCount * judgingWindowHours) /
              (P * avgTimePerProjectHours),
          );

          const targetCoverage = Math.max(3, calculatedQuota);
          const avgRequired = Math.ceil((P * targetCoverage) / mainJudgesCount);

          // Reduce cap: Judges should not have 20 projects. Setting a more reasonable cap of 12.
          minProjects = Math.max(3, Math.min(avgRequired, 12));
          maxProjects = Math.max(
            minProjects + 1,
            Math.min(avgRequired + 1, 14),
          );
        }

        // Clear existing queues
        await tx
          .delete(judgeQueue)
          .where(eq(judgeQueue.hackathonId, input.hackathonId));

        // ── Coverage-maximizing assignment ──────────────────────────────────
        // Uses buildCoverageQueues to guarantee every project is seen by at
        // least one judge before any project gets an extra judge. This replaces
        // the old random-slice approach which could leave some projects unseen.
        const judgeList = activeAssignments.map((a) => ({
          judgeId: a.judgeId,
          track: a.track ?? null,
        }));
        const projectList = allProjects.map((p) => ({
          id: p.id,
          tracks: p.tracks ?? null,
          challenges: p.challenges ?? null,
          tableNumber: p.tableNumber,
          isCreateX: p.isCreateX,
        }));

        const queues = buildCoverageQueues(
          judgeList,
          projectList,
          MAIN_TRACKS,
          {
            minProjects,
            maxProjects,
            shuffle: input.shuffle,
            groupSpecial: input.groupSpecial,
          },
        );

        // Build all insert rows in one pass, skipping pairs a judge has already
        // finished. judge_queue has no unique on (judgeId, projectId), so
        // without this filter the rebuild happily re-issues a completed pair as
        // a fresh uncompleted row and getNextTable sends the judge back.
        const completedKeys = new Set(
          completed.map((row) => `${row.judgeId}:${row.projectId}`),
        );

        const insertRows: {
          judgeId: string;
          hackathonId: string;
          projectId: string;
          order: number;
          isCompleted?: boolean;
          startedAt?: Date | null;
          completedAt?: Date | null;
        }[] = [];
        for (const [judgeId, projectIds] of queues.entries()) {
          let order = 0;
          for (const projectId of projectIds) {
            if (completedKeys.has(`${judgeId}:${projectId}`)) continue;
            insertRows.push({
              judgeId,
              hackathonId: input.hackathonId,
              projectId,
              order: ++order,
            });
          }
        }

        // Re-append the finished work past the tail of each judge's new queue,
        // so their history survives and nothing re-serves it.
        const tailByJudge = new Map<string, number>();
        for (const row of insertRows) {
          tailByJudge.set(
            row.judgeId,
            Math.max(tailByJudge.get(row.judgeId) ?? 0, row.order),
          );
        }
        for (const row of completed) {
          const next = (tailByJudge.get(row.judgeId) ?? 0) + 1;
          tailByJudge.set(row.judgeId, next);
          insertRows.push({
            judgeId: row.judgeId,
            hackathonId: input.hackathonId,
            projectId: row.projectId,
            order: next,
            isCompleted: true,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
          });
        }

        // Chunked because a single INSERT carries 4 bound parameters per row
        // against Postgres's 65535 limit — about 16k rows. A sponsor-track
        // judge's pool is uncapped, so a few of them over a large project list
        // crosses it and aborts the whole assignment with an opaque driver
        // error at the worst possible moment.
        for (let i = 0; i < insertRows.length; i += QUEUE_INSERT_CHUNK) {
          await tx
            .insert(judgeQueue)
            .values(insertRows.slice(i, i + QUEUE_INSERT_CHUNK));
        }

        // Compute coverage stats for admin feedback. Counted over the merged
        // set — over the generated rows alone, a fully-judged project reads as
        // uncovered and the admin re-runs assignment chasing it.
        const projectCoverage = new Map<string, number>();
        for (const row of insertRows) {
          projectCoverage.set(
            row.projectId,
            (projectCoverage.get(row.projectId) ?? 0) + 1,
          );
        }
        const coverageValues = [...projectCoverage.values()];
        const uncoveredCount = allProjects.length - projectCoverage.size;
        const avgCoverage =
          coverageValues.length > 0
            ? Math.round(
                (coverageValues.reduce((a, b) => a + b, 0) /
                  coverageValues.length) *
                  10,
              ) / 10
            : 0;
        const minCoverage =
          coverageValues.length > 0 ? Math.min(...coverageValues) : 0;
        const maxCoverage =
          coverageValues.length > 0 ? Math.max(...coverageValues) : 0;

        // Counted from the rows actually written, not from `queues` — those
        // still hold the completed pairs that were filtered out above.
        const countByJudge = new Map<string, number>();
        for (const row of insertRows) {
          countByJudge.set(row.judgeId, (countByJudge.get(row.judgeId) ?? 0) + 1);
        }

        const results = allAssignments.map((a) => ({
          judgeId: a.judgeId,
          judgeName: a.judge.name,
          track: a.track ?? null,
          assignedCount: countByJudge.get(a.judgeId) ?? 0,
        }));

        return {
          success: true,
          totalJudges: results.length,
          totalInsertedRows: insertRows.length,
          judgingWasActive: hackathon.judgingActive,
          preservedCompleted: completed.length,
          coverage: {
            avg: avgCoverage,
            min: minCoverage,
            max: maxCoverage,
            uncovered: uncoveredCount,
          },
          assignments: results,
        };
      });

      // Deliberately AFTER the transaction commits, on ctx.db.
      //
      // recordAdminAction swallows its errors, which is right outside a
      // transaction and dangerous inside one: any failed statement aborts the
      // Postgres session, so the following COMMIT silently becomes a ROLLBACK.
      // Called as the last statement in the tx, a failed audit insert would
      // return success and a coverage report while every judge queue in the
      // event quietly reverted.
      await recordAdminAction(ctx.db as DrizzleDB, {
        userId: ctx.userId,
        action: "judge.assignJudgesToProjects",
        resourceId: input.hackathonId,
        severity: input.force ? "critical" : "info",
        metadata: {
          forced: input.force,
          judgingWasActive: outcome.judgingWasActive,
          preservedCompleted: outcome.preservedCompleted,
          totalRows: outcome.totalInsertedRows,
        },
      });

      return outcome;
    }),

  /**
   * The table cards to print, one per judgeable project.
   *
   * Each carries the code a judge scans on arrival. Without a way to get these
   * out of the database and onto a desk, the scan-to-start flow has no
   * physical half.
   */
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

      // A judge who has a queue but has not scored anything yet is exactly the
      // one an organizer needs to find mid-event, so drive the list from the
      // queues as well as the votes.
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

  register: protectedProcedure
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

        // Free text used to land straight in the routing column, so a judge who
        // typed "ai" instead of "AI" was classified sponsor/special and given
        // an empty pool — invisible to them and to the organiser.
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
