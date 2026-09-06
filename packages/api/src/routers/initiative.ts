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
import { createTRPCRouter, protectedProcedure, uploadProcedure } from "../trpc";
import {
  isAdmin,
  isSuperAdmin,
  isProjectLeader,
} from "../middleware/procedures";
import { clearProjectLeaderCaches } from "../middleware/cache";

const notFound = (message = "Project not found") =>
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

// A team is the leader plus the people they accept, so the stored cap counts
// accepted members only and is one less than this. Applied when a leader
// names no cap; an explicit null still means uncapped.
const DEFAULT_TEAM_SIZE = 4;

// A resume is a PDF, small enough to sit in a row. `uploadProcedure` already
// caps the whole payload at 2 MB.
const resumeInput = z.object({
  fileName: z.string().trim().min(1).max(200),
  dataUrl: z
    .string()
    .regex(
      /^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/,
      "Your resume must be a PDF.",
    )
    .max(2 * 1024 * 1024),
});

/** The declared type is not the file's; check the signature before storing. */
function assertPdf(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const header = Buffer.from(base64.slice(0, 8), "base64").toString("latin1");
  if (!header.startsWith("%PDF-")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That file is not a PDF.",
    });
  }
  return dataUrl;
}

const initiativeInput = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  commitment: z.string().trim().max(120).optional(),
  maxMembers: z
    .number()
    .int()
    .positive()
    .max(500)
    .nullable()
    .optional()
    .default(DEFAULT_TEAM_SIZE - 1),
});

// Admins manage every initiative, a leader only their own. Callers turn false
// into NOT_FOUND rather than FORBIDDEN, so guessing another leader's id does
// not reveal that it exists.
function canManage(
  ctx: { userId: string; isPlatformAdmin: boolean },
  initiative: Initiative,
) {
  return ctx.isPlatformAdmin || initiative.leaderUserId === ctx.userId;
}

// Applying is a member benefit, so it needs an unlapsed membership. Keyed on
// the person alone: this used to resolve a "current edition" and check
// against it, so between hackathons it refused everybody — which is how the
// club half went dead outside event season.
async function requireActiveMember(db: Reader, userId: string) {
  const member = await db.query.members.findFirst({
    where: eq(members.userId, userId),
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
      message: "An active membership is required to join a project.",
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
        // The edit form prefills from this row and `update` writes an explicit null
        // for anything omitted, so a field missing here is one the first save clears.
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
          // Proposals and declines live in the member's own list and the admin review
          // queue; this screen is for initiatives that actually exist.
          inArray(initiatives.status, ["draft", "open", "closed"]),
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

    const byInitiative = new Map<
      string,
      { pending: number; accepted: number }
    >();
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
          resumeFileName: initiativeApplications.resumeFileName,
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
    /**
     * `leaderUserId` exists because an admin passes this gate without being a
     * leader themselves. Defaulting it to the caller stored the ADMIN as the
     * leader and showed their name to members, so staff creating an initiative
     * on somebody's behalf name that person explicitly.
     */
    .input(initiativeInput.extend({ leaderUserId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      let leaderUserId = ctx.userId;

      if (input.leaderUserId && input.leaderUserId !== ctx.userId) {
        if (!ctx.isPlatformAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only an admin can create a project for someone else.",
          });
        }

        const target = await db.query.projectLeaders.findFirst({
          where: and(
            eq(projectLeaders.userId, input.leaderUserId),
            eq(projectLeaders.isActive, true),
          ),
          columns: { id: true },
        });
        if (!target) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That person is not a project leader.",
          });
        }
        leaderUserId = input.leaderUserId;
      } else if (!ctx.projectLeader) {
        // An admin who named nobody would otherwise become the leader by default,
        // which is the bug this branch exists to stop.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You are not a project leader. Name the leader this project belongs to.",
        });
      }

      const [created] = await db
        .insert(initiatives)
        .values({
          leaderUserId,
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
          message: "Could not create that project.",
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
      // undefined from the update, so clearing a summary would report success and
      // change nothing.
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

  // Closing decides nothing — queued applications can still be accepted, which
  // is what a leader with enough applicants wants. Lowering the cap below the
  // accepted count is likewise left alone: nobody is thrown off by an edit.
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
          message: "Restore this project before changing its status.",
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
          // Archiving shuts the door too, so restoring later does not silently re-open
          // applications nobody decided to re-open.
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

  // Reversible both ways: a rejection can be taken back, an acceptance revoked
  // and the seat returned. The one refused transition is deciding on somebody
  // who withdrew.
  // Separate from getById so a queue of thirty applicants does not ship thirty
  // PDFs to render a list.
  applicantResume: isProjectLeader
    .input(
      z.object({
        initiativeId: z.string().uuid(),
        userId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const initiative = await db.query.initiatives.findFirst({
        where: eq(initiatives.id, input.initiativeId),
      });
      if (!initiative || !canManage(ctx, initiative)) throw notFound();

      const [row] = await db
        .select({
          fileName: initiativeApplications.resumeFileName,
          dataUrl: initiativeApplications.resumeData,
        })
        .from(initiativeApplications)
        .where(
          and(
            eq(initiativeApplications.initiativeId, input.initiativeId),
            eq(initiativeApplications.userId, input.userId),
          ),
        )
        .limit(1);

      if (!row?.dataUrl) throw notFound("No resume on this application.");

      return { fileName: row.fileName ?? "resume.pdf", dataUrl: row.dataUrl };
    }),

  decide: isProjectLeader
    .input(
      z.object({
        initiativeId: z.string().uuid(),
        userId: z.string(),
        decision: z.enum(["accepted", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const outcome = await (ctx.db as DrizzleDB).transaction(async (tx) => {
        // Lock BEFORE reading. Reading first leaves every check below on a pre-lock
        // snapshot, so a concurrent archive or lowered cap is invisible and the
        // accept goes through anyway. Locking a missing id matches no row.
        await lockInitiative(tx, input.initiativeId);

        const initiative = await tx.query.initiatives.findFirst({
          where: eq(initiatives.id, input.initiativeId),
        });
        if (!initiative || !canManage(ctx, initiative)) throw notFound();

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

        // Two leaders clicking the same button: the second is a no-op, so decidedAt
        // keeps pointing at the real decision and no second email goes out.
        if (application.status === input.decision) {
          return {
            status: application.status,
            applicantEmail: null,
            initiativeTitle: initiative.title,
          };
        }

        if (input.decision === "accepted" && initiative.maxMembers !== null) {
          const taken = await acceptedSeats(tx, initiative.id);
          if (taken >= initiative.maxMembers) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This project is full.",
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

        const applicant = await tx.query.users.findFirst({
          where: eq(users.id, input.userId),
          columns: { email: true },
        });

        return {
          status: input.decision,
          applicantEmail: applicant?.email ?? null,
          initiativeTitle: initiative.title,
        };
      });

      // After the transaction, never inside: a mail provider timeout must not roll
      // back a decision that has been made. Before this the decision was visible
      // only to whoever made it.
      if (outcome.applicantEmail) {
        try {
          const { sendInitiativeDecisionEmail } = await import(
            "@query/auth/email"
          );
          await sendInitiativeDecisionEmail({
            email: outcome.applicantEmail,
            initiativeTitle: outcome.initiativeTitle,
            accepted: input.decision === "accepted",
            kind: "application",
          });
        } catch (error) {
          // Deliberate operational logging: the decision stands and this is the only
          // record that the notice did not go out.
          // eslint-disable-next-line no-console
          console.error(
            `[Email Service] Initiative decision notice failed for ${outcome.applicantEmail}:`,
            error,
          );
        }
      }

      return { status: outcome.status };
    }),

  // ------------------------------------------------------------------ member

  // Visible to any signed-in user, not just paid members: somebody deciding
  // whether to join should see what they would get. Applying is where the
  // membership check bites.
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

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
        and(eq(initiatives.status, "open"), isNull(initiatives.archivedAt)),
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

  myApplications: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

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
          // A withdrawal is an exit, not a record to carry forever.
          ne(initiativeApplications.status, "withdrawn"),
        ),
      )
      .orderBy(desc(initiativeApplications.appliedAt))
      .limit(60);

    // The leader's address is contact detail for people on the initiative.
    // Stripped here, not in the component — what a component does not render
    // still rides along in the payload.
    return rows.map(({ leaderEmail, ...row }) => ({
      ...row,
      leaderEmail: row.myStatus === "accepted" ? leaderEmail : null,
    }));
  }),

  // Not `apply`: tRPC refuses a procedure named after anything on
  // Function.prototype and throws at router construction, taking the whole API
  // route down rather than just this procedure.
  requestToJoin: uploadProcedure
    .input(
      z.object({
        initiativeId: z.string().uuid(),
        pitch: z
          .string()
          .trim()
          .min(1, "Tell the leader why you want to join.")
          .max(1000),
        resume: resumeInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId;
      const pitch = input.pitch;
      // Absent means "leave whatever is on file", so re-applying does not wipe
      // a resume the applicant already sent.
      const resume = input.resume
        ? {
            resumeFileName: input.resume.fileName,
            resumeData: assertPdf(input.resume.dataUrl),
            resumeUploadedAt: new Date(),
          }
        : {};

      return db.transaction(async (tx) => {
        // Lock BEFORE reading, so every guard sees the row as it is now — otherwise a
        // leader closing, archiving or lowering the cap mid-flight is invisible and
        // the application lands anyway.
        await lockInitiative(tx, input.initiativeId);

        const initiative = await tx.query.initiatives.findFirst({
          where: eq(initiatives.id, input.initiativeId),
        });
        if (!initiative) throw notFound();

        // Anything not open is invisible to members, so it answers exactly as a
        // made-up id does — including `proposed` and `declined`, which would
        // otherwise leak that somebody pitched this idea.
        if (
          initiative.archivedAt !== null ||
          initiative.status === "draft" ||
          initiative.status === "proposed" ||
          initiative.status === "declined"
        ) {
          throw notFound();
        }

        await requireActiveMember(tx, userId);

        if (initiative.status !== "open") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This project is not taking applications.",
          });
        }

        if (initiative.leaderUserId === userId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already lead this project.",
          });
        }

        const existing = await tx.query.initiativeApplications.findFirst({
          where: and(
            eq(initiativeApplications.initiativeId, initiative.id),
            eq(initiativeApplications.userId, userId),
          ),
        });

        // Tested before capacity: somebody who already applied is a duplicate, not an
        // extra body, so they are told where they stand.
        if (existing && existing.status !== "withdrawn") {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              existing.status === "pending"
                ? "You have already applied to this project."
                : existing.status === "accepted"
                  ? "You are already on this project."
                  : "The leader has already decided on your application.",
          });
        }

        if (initiative.maxMembers !== null) {
          const taken = await acceptedSeats(tx, initiative.id);
          if (taken >= initiative.maxMembers) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This project is full.",
            });
          }
        }

        if (existing) {
          // Re-applying reuses the row the unique index already holds, and clears the
          // stale decision with it.
          await tx
            .update(initiativeApplications)
            .set({
              status: "pending",
              pitch,
              ...resume,
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
            ...resume,
            status: "pending",
          });
        } catch (error) {
          // The read above only rules out rows committed before this transaction began;
          // the unique index settles a true double submit.
          if (isUniqueViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "You have already applied to this project.",
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

  // --------------------------------------------------------------- proposals

  // A member asking to run something. Creates the initiative at `proposed` with
  // the proposer as leader — the row is the proposal, so approving is a status
  // change rather than a copy from a second table that could drift.
  propose: protectedProcedure
    .input(initiativeInput)
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      await requireActiveMember(db, ctx.userId);

      // A queue an admin has to read is a shared resource. Three open at once is
      // plenty for one person and stops a single member flooding it.
      const [waiting] = await db
        .select({ total: count() })
        .from(initiatives)
        .where(
          and(
            eq(initiatives.leaderUserId, ctx.userId),
            eq(initiatives.status, "proposed"),
          ),
        );

      if ((waiting?.total ?? 0) >= 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You already have three proposals waiting. Wait for one to be reviewed, or withdraw it.",
        });
      }

      const [created] = await db
        .insert(initiatives)
        .values({
          leaderUserId: ctx.userId,
          title: input.title,
          summary: input.summary ?? null,
          description: input.description ?? null,
          commitment: input.commitment ?? null,
          maxMembers: input.maxMembers ?? null,
          status: "proposed",
        })
        .returning();

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not submit that proposal.",
        });
      }
      return created;
    }),

  // Everything this member has proposed, in any state. Separate from `listMine`
  // because a member with a pending proposal is not a leader yet.
  myProposals: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    return db
      .select({
        id: initiatives.id,
        title: initiatives.title,
        summary: initiatives.summary,
        description: initiatives.description,
        commitment: initiatives.commitment,
        status: initiatives.status,
        maxMembers: initiatives.maxMembers,
        archivedAt: initiatives.archivedAt,
        reviewedAt: initiatives.reviewedAt,
        reviewNote: initiatives.reviewNote,
        createdAt: initiatives.createdAt,
      })
      .from(initiatives)
      .where(eq(initiatives.leaderUserId, ctx.userId))
      .orderBy(desc(initiatives.createdAt))
      .limit(40);
  }),

  /** Taking a proposal back before anyone has reviewed it. */
  withdrawProposal: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await (ctx.db as DrizzleDB)
        .delete(initiatives)
        .where(
          and(
            eq(initiatives.id, input.id),
            eq(initiatives.leaderUserId, ctx.userId),
            // Only while it is still untouched. Once approved it is a real initiative
            // with applicants, and archiving is the way out.
            eq(initiatives.status, "proposed"),
          ),
        )
        .returning({ id: initiatives.id });

      if (deleted.length === 0) {
        throw notFound("That proposal is no longer pending.");
      }
      return { withdrawn: true };
    }),

  // ------------------------------------------------------------------- admin

  /** The review queue. Oldest first — proposals are answered in order. */
  listProposals: isAdmin.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    return db
      .select({
        id: initiatives.id,
        title: initiatives.title,
        summary: initiatives.summary,
        description: initiatives.description,
        commitment: initiatives.commitment,
        maxMembers: initiatives.maxMembers,
        status: initiatives.status,
        createdAt: initiatives.createdAt,
        proposerId: initiatives.leaderUserId,
        proposerName: users.name,
        proposerEmail: users.email,
      })
      .from(initiatives)
      .innerJoin(users, eq(users.id, initiatives.leaderUserId))
      .where(eq(initiatives.status, "proposed"))
      .orderBy(asc(initiatives.createdAt))
      .limit(100);
  }),

  // Approving does two things at once, so they share a transaction: the
  // initiative becomes a draft and the proposer becomes a project leader. Doing
  // only the first leaves somebody owning an initiative they cannot reach.
  reviewProposal: isAdmin
    .input(
      z.object({
        id: z.string().uuid(),
        decision: z.enum(["approve", "decline"]),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const proposerId = await db.transaction(async (tx) => {
        const proposal = await tx.query.initiatives.findFirst({
          where: eq(initiatives.id, input.id),
        });
        if (!proposal) throw notFound("Proposal not found.");

        if (proposal.status !== "proposed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That proposal has already been reviewed.",
          });
        }

        await tx
          .update(initiatives)
          .set({
            status: input.decision === "approve" ? "draft" : "declined",
            reviewedAt: new Date(),
            reviewedById: ctx.userId,
            reviewNote: input.note ?? null,
            updatedAt: new Date(),
          })
          .where(eq(initiatives.id, proposal.id));

        if (input.decision === "approve") {
          const existing = await tx.query.projectLeaders.findFirst({
            where: eq(projectLeaders.userId, proposal.leaderUserId),
          });

          if (existing) {
            // Re-approving somebody whose role was revoked restores it rather than
            // colliding with the unique index.
            if (!existing.isActive) {
              await tx
                .update(projectLeaders)
                .set({ isActive: true, updatedAt: new Date() })
                .where(eq(projectLeaders.id, existing.id));
            }
          } else {
            await tx.insert(projectLeaders).values({
              userId: proposal.leaderUserId,
              isActive: true,
              appointedBy: ctx.userId,
            });
          }
        }

        const proposer = await tx.query.users.findFirst({
          where: eq(users.id, proposal.leaderUserId),
          columns: { email: true },
        });

        return {
          userId: proposal.leaderUserId,
          email: proposer?.email ?? null,
          title: proposal.title,
        };
      });

      // Outside the transaction: the role gate and the sidebar both cache, and
      // evicting before commit would let a concurrent read re-warm the old answer.
      if (input.decision === "approve")
        clearProjectLeaderCaches(proposerId.userId);

      // Also outside, and best-effort: the decision is made either way, and
      // proposing used to be a thing you did and then never heard about.
      if (proposerId.email) {
        try {
          const { sendInitiativeDecisionEmail } = await import(
            "@query/auth/email"
          );
          await sendInitiativeDecisionEmail({
            email: proposerId.email,
            initiativeTitle: proposerId.title,
            accepted: input.decision === "approve",
            kind: "proposal",
            note: input.note,
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(
            `[Email Service] Proposal decision notice failed for ${proposerId.email}:`,
            error,
          );
        }
      }

      return { id: input.id, decision: input.decision };
    }),

  listLeaders: isAdmin.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

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
      .orderBy(asc(users.email))
      .limit(200);
  }),

  // Grant or revoke, by user id. Upserted rather than deleted so an appointment
  // stays on the record after it is revoked.
  setLeader: isSuperAdmin
    .input(z.object({ userId: z.string(), isLeader: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const target = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: { id: true },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const existing = await db.query.projectLeaders.findFirst({
        where: eq(projectLeaders.userId, input.userId),
      });

      if (existing) {
        await db
          .update(projectLeaders)
          .set({ isActive: input.isLeader, updatedAt: new Date() })
          .where(eq(projectLeaders.id, existing.id));
      } else if (input.isLeader) {
        await db.insert(projectLeaders).values({
          userId: input.userId,
          isActive: true,
          appointedBy: ctx.userId,
        });
      }

      // The gate caches for 60s and the sidebar reads portal context; both have to
      // go or the change does not show up until they expire.
      clearProjectLeaderCaches(input.userId);

      return { userId: input.userId, isLeader: input.isLeader };
    }),
});
