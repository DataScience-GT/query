import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import {
  initiativeApplications,
  initiatives,
  members,
  projectLeaders,
  users,
} from "@query/db";
import type { DrizzleDB, Initiative } from "@query/db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { isAdmin, isProjectLeader } from "../middleware/procedures";
import { clearProjectLeaderCaches } from "../middleware/cache";
import { resolveHackathonId } from "../services/portal-context";

const notFound = (message = "Initiative not found") =>
  new TRPCError({ code: "NOT_FOUND", message });

/** Postgres unique_violation. Drizzle wraps driver errors, so walk `.cause`. */
function isUniqueViolation(error: unknown) {
  for (let cursor: unknown = error, depth = 0; cursor && depth < 5; depth++) {
    if (typeof cursor !== "object") break;
    if ((cursor as { code?: string }).code === "23505") return true;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return false;
}

/** What `db.transaction(async (tx) => …)` hands its callback. */
type Tx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];
/** The helpers below only read, so either handle will do. */
type Reader = DrizzleDB | Tx;

const initiativeInput = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  commitment: z.string().trim().max(120).optional(),
  maxMembers: z.number().int().positive().max(500).nullable().optional(),
});

/**
 * Admins manage every initiative; a leader manages only their own. Callers
 * turn a false into NOT_FOUND rather than FORBIDDEN, so a leader who guesses
 * another leader's id does not learn from the error that it exists.
 */
function canManage(
  ctx: { userId: string; isPlatformAdmin: boolean },
  initiative: Initiative,
) {
  return ctx.isPlatformAdmin || initiative.leaderUserId === ctx.userId;
}

/** Applying is a member benefit, so it needs a membership that has not lapsed. */
async function requireActiveMember(
  db: Reader,
  userId: string,
  hackathonId: string,
) {
  const member = await db.query.members.findFirst({
    where: and(eq(members.userId, userId), eq(members.hackathonId, hackathonId)),
    columns: { isActive: true, membershipEndDate: true },
  });

  const active = !!(
    member?.isActive &&
    member.membershipEndDate &&
    member.membershipEndDate > new Date()
  );

  if (!active) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "An active membership is required to join an initiative.",
    });
  }
}

/** Exact because every writer locks the initiative row before counting. */
async function acceptedSeats(tx: Reader, initiativeId: string) {
  const [row] = await tx
    .select({ taken: count() })
    .from(initiativeApplications)
    .where(
      and(
        eq(initiativeApplications.initiativeId, initiativeId),
        eq(initiativeApplications.status, "accepted"),
      ),
    );
  return row?.taken ?? 0;
}

/** Serialises decisions on one initiative so a cap with one seat left holds. */
function lockInitiative(tx: Reader, id: string) {
  return tx
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(eq(initiatives.id, id))
    .for("update");
}

export const initiativeRouter = createTRPCRouter({
  // ------------------------------------------------------------------ leader

  listMine: isProjectLeader.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    const rows = await db
      .select({
        id: initiatives.id,
        title: initiatives.title,
        summary: initiatives.summary,
        // The edit form prefills from this row, and `update` writes an explicit
        // null for anything omitted — so a field missing here is a field the
        // first save silently clears.
        description: initiatives.description,
        commitment: initiatives.commitment,
        status: initiatives.status,
        maxMembers: initiatives.maxMembers,
        archivedAt: initiatives.archivedAt,
        leaderUserId: initiatives.leaderUserId,
        leaderName: users.name,
        createdAt: initiatives.createdAt,
      })
      .from(initiatives)
      .innerJoin(users, eq(users.id, initiatives.leaderUserId))
      .where(
        and(
          eq(initiatives.hackathonId, ctx.hackathonId),
          ctx.isPlatformAdmin
            ? undefined
            : eq(initiatives.leaderUserId, ctx.userId),
        ),
      )
      .orderBy(desc(initiatives.createdAt))
      .limit(200);

    if (rows.length === 0) return [];

    const tallies = await db
      .select({
        initiativeId: initiativeApplications.initiativeId,
        status: initiativeApplications.status,
        total: count(),
      })
      .from(initiativeApplications)
      .where(
        inArray(
          initiativeApplications.initiativeId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(
        initiativeApplications.initiativeId,
        initiativeApplications.status,
      );

    const byInitiative = new Map<string, { pending: number; accepted: number }>();
    for (const tally of tallies) {
      const entry = byInitiative.get(tally.initiativeId) ?? {
        pending: 0,
        accepted: 0,
      };
      if (tally.status === "pending") entry.pending = tally.total;
      if (tally.status === "accepted") entry.accepted = tally.total;
      byInitiative.set(tally.initiativeId, entry);
    }

    return rows.map((row) => ({
      ...row,
      pending: byInitiative.get(row.id)?.pending ?? 0,
      accepted: byInitiative.get(row.id)?.accepted ?? 0,
      isMine: row.leaderUserId === ctx.userId,
    }));
  }),

  getById: isProjectLeader
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const initiative = await db.query.initiatives.findFirst({
        where: eq(initiatives.id, input.id),
      });
      if (!initiative || !canManage(ctx, initiative)) throw notFound();

      const applicants = await db
        .select({
          userId: initiativeApplications.userId,
          name: users.name,
          email: users.email,
          image: users.image,
          status: initiativeApplications.status,
          pitch: initiativeApplications.pitch,
          appliedAt: initiativeApplications.appliedAt,
          decidedAt: initiativeApplications.decidedAt,
        })
        .from(initiativeApplications)
        .innerJoin(users, eq(users.id, initiativeApplications.userId))
        .where(eq(initiativeApplications.initiativeId, initiative.id))
        // Oldest first: a leader works the queue in the order hands went up.
        .orderBy(asc(initiativeApplications.appliedAt));

      return {
        initiative,
        applicants,
        accepted: applicants.filter((row) => row.status === "accepted").length,
      };
    }),

  create: isProjectLeader
    .input(initiativeInput)
    .mutation(async ({ ctx, input }) => {
      const [created] = await (ctx.db as DrizzleDB)
        .insert(initiatives)
        .values({
          hackathonId: ctx.hackathonId,
          leaderUserId: ctx.userId,
          title: input.title,
          summary: input.summary ?? null,
          description: input.description ?? null,
          commitment: input.commitment ?? null,
          maxMembers: input.maxMembers ?? null,
          // Nothing reaches members until the leader opens it.
          status: "draft",
        })
        .returning();

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create that initiative.",
        });
      }
      return created;
    }),

  update: isProjectLeader
    .input(initiativeInput.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const { id, ...fields } = input;

      const initiative = await db.query.initiatives.findFirst({
        where: eq(initiatives.id, id),
      });
      if (!initiative || !canManage(ctx, initiative)) throw notFound();

      // Every nullable column reaches .set() as an explicit null: drizzle drops
      // undefined from the update entirely, so clearing a summary would report
      // success and change nothing.
      const [updated] = await db
        .update(initiatives)
        .set({
          title: fields.title,
          summary: fields.summary ?? null,
          description: fields.description ?? null,
          commitment: fields.commitment ?? null,
          maxMembers: fields.maxMembers ?? null,
          updatedAt: new Date(),
        })
        .where(eq(initiatives.id, id))
        .returning();

      if (!updated) throw notFound();
      return updated;
    }),

  /**
   * Closing decides nothing — applications already queued can still be
   * accepted, which is what a leader with enough applicants wants. Lowering the
   * cap below the accepted count is likewise left alone: nobody is thrown off
   * by an edit to a number.
   */
  setStatus: isProjectLeader
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["draft", "open", "closed"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const initiative = await db.query.initiatives.findFirst({
        where: eq(initiatives.id, input.id),
      });
      if (!initiative || !canManage(ctx, initiative)) throw notFound();

      // An archived initiative is hidden from members whatever the status says.
      if (initiative.archivedAt !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Restore this initiative before changing its status.",
        });
      }

      const [updated] = await db
        .update(initiatives)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(initiatives.id, input.id))
        .returning({ id: initiatives.id, status: initiatives.status });

      if (!updated) throw notFound();
      return updated;
    }),

  setArchived: isProjectLeader
    .input(z.object({ id: z.string().uuid(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const initiative = await db.query.initiatives.findFirst({
        where: eq(initiatives.id, input.id),
      });
      if (!initiative || !canManage(ctx, initiative)) throw notFound();

      const [updated] = await db
        .update(initiatives)
        .set({
          archivedAt: input.archived ? new Date() : null,
          // Archiving shuts the door too, so restoring later does not silently
          // re-open applications nobody decided to re-open.
          status: input.archived ? "closed" : initiative.status,
          updatedAt: new Date(),
        })
        .where(eq(initiatives.id, input.id))
        .returning({
          id: initiatives.id,
          archivedAt: initiatives.archivedAt,
        });

      if (!updated) throw notFound();
      return updated;
    }),

  /**
   * Reversible both ways: a rejection can be taken back, an acceptance can be
   * revoked and the seat returns. The one refused transition is deciding on
   * somebody who withdrew.
   */
  decide: isProjectLeader
    .input(
      z.object({
        initiativeId: z.string().uuid(),
        userId: z.string(),
        decision: z.enum(["accepted", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return (ctx.db as DrizzleDB).transaction(async (tx) => {
        const initiative = await tx.query.initiatives.findFirst({
          where: eq(initiatives.id, input.initiativeId),
        });
        if (!initiative || !canManage(ctx, initiative)) throw notFound();

        await lockInitiative(tx, initiative.id);

        const application = await tx.query.initiativeApplications.findFirst({
          where: and(
            eq(initiativeApplications.initiativeId, initiative.id),
            eq(initiativeApplications.userId, input.userId),
          ),
        });
        if (!application) throw notFound("That member has not applied.");

        if (application.status === "withdrawn") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "They withdrew their application.",
          });
        }

        // Two leaders clicking the same button: the second is a no-op, so
        // decidedAt keeps pointing at the real decision.
        if (application.status === input.decision) {
          return { status: application.status };
        }

        if (input.decision === "accepted" && initiative.maxMembers !== null) {
          const taken = await acceptedSeats(tx, initiative.id);
          if (taken >= initiative.maxMembers) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This initiative is full.",
            });
          }
        }

        await tx
          .update(initiativeApplications)
          .set({
            status: input.decision,
            decidedAt: new Date(),
            decidedById: ctx.userId,
          })
          .where(eq(initiativeApplications.id, application.id));

        return { status: input.decision };
      });
    }),

  // ------------------------------------------------------------------ member

  /**
   * Visible to any signed-in user, not just paid members: somebody deciding
   * whether to join should be able to see what they would get. Applying is
   * where the membership check bites.
   */
  list: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const hackathonId = await resolveHackathonId(db, input?.hackathonId);
      if (!hackathonId) return [];

      const open = await db
        .select({
          id: initiatives.id,
          title: initiatives.title,
          summary: initiatives.summary,
          description: initiatives.description,
          commitment: initiatives.commitment,
          status: initiatives.status,
          maxMembers: initiatives.maxMembers,
          archivedAt: initiatives.archivedAt,
          leaderName: users.name,
          leaderImage: users.image,
        })
        .from(initiatives)
        .innerJoin(users, eq(users.id, initiatives.leaderUserId))
        .where(
          and(
            eq(initiatives.hackathonId, hackathonId),
            eq(initiatives.status, "open"),
            isNull(initiatives.archivedAt),
          ),
        )
        .orderBy(asc(initiatives.title))
        .limit(60);

      if (open.length === 0) return [];

      const ids = open.map((row) => row.id);

      const [seats, mine] = await Promise.all([
        db
          .select({
            initiativeId: initiativeApplications.initiativeId,
            taken: count(),
          })
          .from(initiativeApplications)
          .where(
            and(
              inArray(initiativeApplications.initiativeId, ids),
              eq(initiativeApplications.status, "accepted"),
            ),
          )
          .groupBy(initiativeApplications.initiativeId),
        db
          .select({
            initiativeId: initiativeApplications.initiativeId,
            status: initiativeApplications.status,
          })
          .from(initiativeApplications)
          .where(
            and(
              inArray(initiativeApplications.initiativeId, ids),
              eq(initiativeApplications.userId, ctx.userId),
            ),
          ),
      ]);

      const taken = new Map(seats.map((row) => [row.initiativeId, row.taken]));
      const status = new Map(mine.map((row) => [row.initiativeId, row.status]));

      return open.map((row) => {
        const accepted = taken.get(row.id) ?? 0;
        const myStatus = status.get(row.id) ?? null;
        return {
          ...row,
          accepted,
          // withdrawn reads as no application, because re-applying is allowed.
          myStatus: myStatus === "withdrawn" ? null : myStatus,
          isFull: row.maxMembers !== null && accepted >= row.maxMembers,
        };
      });
    }),

  myApplications: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const hackathonId = await resolveHackathonId(db, input?.hackathonId);
      if (!hackathonId) return [];

      const rows = await db
        .select({
          id: initiatives.id,
          title: initiatives.title,
          summary: initiatives.summary,
          status: initiatives.status,
          maxMembers: initiatives.maxMembers,
          archivedAt: initiatives.archivedAt,
          leaderName: users.name,
          leaderEmail: users.email,
          myStatus: initiativeApplications.status,
          appliedAt: initiativeApplications.appliedAt,
          decidedAt: initiativeApplications.decidedAt,
        })
        .from(initiativeApplications)
        .innerJoin(
          initiatives,
          eq(initiatives.id, initiativeApplications.initiativeId),
        )
        .innerJoin(users, eq(users.id, initiatives.leaderUserId))
        .where(
          and(
            eq(initiativeApplications.userId, ctx.userId),
            eq(initiatives.hackathonId, hackathonId),
            // A withdrawal is an exit, not a record to carry forever.
            ne(initiativeApplications.status, "withdrawn"),
          ),
        )
        .orderBy(desc(initiativeApplications.appliedAt))
        .limit(60);

      // The leader's address is contact detail for people actually on the
      // initiative. Stripped here, not in the component — what the component
      // does not render still rides along in the payload.
      return rows.map(({ leaderEmail, ...row }) => ({
        ...row,
        leaderEmail: row.myStatus === "accepted" ? leaderEmail : null,
      }));
    }),

  /**
   * Not `apply`: tRPC refuses a procedure named after anything on
   * Function.prototype and throws at router construction, taking the whole API
   * route down rather than just this procedure.
   */
  requestToJoin: protectedProcedure
    .input(
      z.object({
        initiativeId: z.string().uuid(),
        pitch: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId;
      const pitch = input.pitch?.length ? input.pitch : null;

      return db.transaction(async (tx) => {
        const initiative = await tx.query.initiatives.findFirst({
          where: eq(initiatives.id, input.initiativeId),
        });
        if (!initiative) throw notFound();

        // A draft or archived initiative is invisible to members, so it answers
        // exactly the way a made-up id does.
        if (initiative.archivedAt !== null || initiative.status === "draft") {
          throw notFound();
        }

        await requireActiveMember(tx, userId, initiative.hackathonId);

        if (initiative.status !== "open") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This initiative is not taking applications.",
          });
        }

        if (initiative.leaderUserId === userId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already lead this initiative.",
          });
        }

        await lockInitiative(tx, initiative.id);

        const existing = await tx.query.initiativeApplications.findFirst({
          where: and(
            eq(initiativeApplications.initiativeId, initiative.id),
            eq(initiativeApplications.userId, userId),
          ),
        });

        // Tested before capacity: somebody who already applied is a duplicate,
        // not an extra body, so they are told where they stand.
        if (existing && existing.status !== "withdrawn") {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              existing.status === "pending"
                ? "You have already applied to this initiative."
                : existing.status === "accepted"
                  ? "You are already on this initiative."
                  : "The leader has already decided on your application.",
          });
        }

        if (initiative.maxMembers !== null) {
          const taken = await acceptedSeats(tx, initiative.id);
          if (taken >= initiative.maxMembers) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This initiative is full.",
            });
          }
        }

        if (existing) {
          // Re-applying reuses the row the unique index already holds, and
          // clears the stale decision with it.
          await tx
            .update(initiativeApplications)
            .set({
              status: "pending",
              pitch,
              appliedAt: new Date(),
              decidedAt: null,
              decidedById: null,
            })
            .where(eq(initiativeApplications.id, existing.id));
          return { status: "pending" as const };
        }

        try {
          await tx.insert(initiativeApplications).values({
            initiativeId: initiative.id,
            userId,
            pitch,
            status: "pending",
          });
        } catch (error) {
          // The read above only rules out rows committed before this
          // transaction began; the unique index settles a true double submit.
          if (isUniqueViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "You have already applied to this initiative.",
            });
          }
          throw error;
        }

        return { status: "pending" as const };
      });
    }),

  withdraw: protectedProcedure
    .input(z.object({ initiativeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await (ctx.db as DrizzleDB)
        .update(initiativeApplications)
        .set({ status: "withdrawn", decidedAt: null, decidedById: null })
        .where(
          and(
            eq(initiativeApplications.initiativeId, input.initiativeId),
            eq(initiativeApplications.userId, ctx.userId),
            // Makes a repeat call a genuine no-op.
            ne(initiativeApplications.status, "withdrawn"),
          ),
        )
        .returning({ id: initiativeApplications.id });

      return { withdrawn: updated !== undefined };
    }),

  // ------------------------------------------------------------------- admin

  listLeaders: isAdmin.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;
    const hackathonId = await resolveHackathonId(db);
    if (!hackathonId) return [];

    return db
      .select({
        id: projectLeaders.id,
        userId: projectLeaders.userId,
        name: users.name,
        email: users.email,
        image: users.image,
        isActive: projectLeaders.isActive,
        createdAt: projectLeaders.createdAt,
      })
      .from(projectLeaders)
      .innerJoin(users, eq(users.id, projectLeaders.userId))
      .where(eq(projectLeaders.hackathonId, hackathonId))
      .orderBy(asc(users.email))
      .limit(200);
  }),

  /**
   * Grant or revoke, by user id, for the current edition. Upserted rather than
   * deleted so an appointment stays on the record after it is revoked.
   */
  setLeader: isAdmin
    .input(z.object({ userId: z.string(), isLeader: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const hackathonId = await resolveHackathonId(db);
      if (!hackathonId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No hackathon context found",
        });
      }

      const target = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: { id: true },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const existing = await db.query.projectLeaders.findFirst({
        where: and(
          eq(projectLeaders.userId, input.userId),
          eq(projectLeaders.hackathonId, hackathonId),
        ),
      });

      if (existing) {
        await db
          .update(projectLeaders)
          .set({ isActive: input.isLeader, updatedAt: new Date() })
          .where(eq(projectLeaders.id, existing.id));
      } else if (input.isLeader) {
        await db.insert(projectLeaders).values({
          userId: input.userId,
          hackathonId,
          isActive: true,
          appointedBy: ctx.userId,
        });
      }

      // The gate caches for 60s and the sidebar reads the portal context; both
      // have to go or the change does not show up until they expire.
      clearProjectLeaderCaches(input.userId);

      return { userId: input.userId, isLeader: input.isLeader };
    }),
});
