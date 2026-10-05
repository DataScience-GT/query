import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import { subteamApplications, subteams, users } from "@query/db";
import type {
  DrizzleDB,
  SubteamAnswer,
  SubteamApplicationStatus,
  SubteamQuestion,
} from "@query/db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { isAdmin } from "../middleware/procedures";
import { isUniqueViolation, requireActiveMember } from "./initiative";

const notFound = (message = "Subteam not found") =>
  new TRPCError({ code: "NOT_FOUND", message });

// Enough for a real form, few enough that applying is not an essay contest.
const MAX_QUESTIONS = 10;
const MAX_ANSWER = 2000;

// Spelled out rather than imported: every router loads with the root, and a
// value read from "@query/db" at module scope breaks each test file that mocks
// the package without it. The Record below fails to compile if one is missed.
const STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "withdrawn",
  "removed",
] as const satisfies readonly SubteamApplicationStatus[];

/** The states that count as "has applied" — at most one per member per subteam. */
const ACTIVE_STATUSES = ["pending", "accepted"] as const;

const questionInput = z.object({
  // Absent on a question the admin just added; the server names it.
  id: z.string().trim().min(1).max(64).optional(),
  prompt: z.string().trim().min(1, "Every question needs a prompt.").max(300),
  required: z.boolean(),
});

const subteamInput = z.object({
  name: z.string().trim().min(1, "Give the subteam a name.").max(120),
  summary: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  isOpen: z.boolean().default(false),
  questions: z
    .array(questionInput)
    .max(MAX_QUESTIONS, `A subteam can ask at most ${MAX_QUESTIONS} questions.`)
    .default([]),
});

/**
 * Keeps an existing question's id so answers already given stay matched to
 * it, and names new ones. A repeated id is treated as new rather than letting
 * two prompts share one.
 */
function normaliseQuestions(
  questions: z.infer<typeof questionInput>[],
): SubteamQuestion[] {
  const seen = new Set<string>();
  return questions.map((question) => {
    const id =
      question.id && !seen.has(question.id) ? question.id : randomUUID();
    seen.add(id);
    return { id, prompt: question.prompt, required: question.required };
  });
}

/** `%` and `_` in a search box are text, not wildcards. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/** What `db.transaction(async (tx) => …)` hands its callback. */
type Tx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

/** Serialises applications to one subteam against an admin closing it. */
function lockSubteam(tx: Tx, id: string) {
  return tx
    .select({ id: subteams.id })
    .from(subteams)
    .where(eq(subteams.id, id))
    .for("update");
}

/**
 * Best-effort, after the write and never inside it: a mail provider timeout
 * must not roll back an application or a decision that has been made.
 */
async function notify(
  email: string | null | undefined,
  subteamName: string,
  outcome: "received" | "accepted" | "rejected",
  note?: string | null,
) {
  if (!email) return;
  try {
    const { sendSubteamApplicationEmail } = await import("@query/auth/email");
    await sendSubteamApplicationEmail({ email, subteamName, outcome, note });
  } catch (error) {
    // Deliberate operational logging: the write stands and this is the only
    // record that the notice did not go out.
    // eslint-disable-next-line no-console
    console.error(
      `[Email Service] Subteam ${outcome} notice failed for ${email}:`,
      error,
    );
  }
}

export const subteamRouter = createTRPCRouter({
  // ------------------------------------------------------------------ member

  // Visible to any signed-in user, like club projects: somebody deciding
  // whether to join should see what they would get. Applying is where the
  // membership check bites.
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    const open = await db
      .select({
        id: subteams.id,
        name: subteams.name,
        summary: subteams.summary,
        description: subteams.description,
        questions: subteams.questions,
      })
      .from(subteams)
      .where(and(eq(subteams.isOpen, true), isNull(subteams.archivedAt)))
      .orderBy(asc(subteams.name))
      .limit(60);

    if (open.length === 0) return [];

    const mine = await db
      .select({
        subteamId: subteamApplications.subteamId,
        status: subteamApplications.status,
      })
      .from(subteamApplications)
      .where(
        and(
          inArray(
            subteamApplications.subteamId,
            open.map((row) => row.id),
          ),
          eq(subteamApplications.userId, ctx.userId),
          inArray(subteamApplications.status, [...ACTIVE_STATUSES]),
        ),
      );

    const status = new Map(mine.map((row) => [row.subteamId, row.status]));

    return open.map((row) => ({
      ...row,
      myStatus: status.get(row.id) ?? null,
    }));
  }),

  myApplications: protectedProcedure.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    return db
      .select({
        id: subteamApplications.id,
        subteamId: subteams.id,
        subteamName: subteams.name,
        subteamArchivedAt: subteams.archivedAt,
        status: subteamApplications.status,
        answers: subteamApplications.answers,
        note: subteamApplications.note,
        decisionNote: subteamApplications.decisionNote,
        appliedAt: subteamApplications.appliedAt,
        decidedAt: subteamApplications.decidedAt,
      })
      .from(subteamApplications)
      .innerJoin(subteams, eq(subteams.id, subteamApplications.subteamId))
      .where(
        and(
          eq(subteamApplications.userId, ctx.userId),
          // A withdrawal is an exit, not a record to carry on the member's page.
          // It stays in the admins' history.
          ne(subteamApplications.status, "withdrawn"),
        ),
      )
      .orderBy(desc(subteamApplications.appliedAt))
      .limit(60);
  }),

  // Not `apply`: tRPC refuses a procedure named after anything on
  // Function.prototype and throws at router construction.
  requestToJoin: protectedProcedure
    .input(
      z.object({
        subteamId: z.string().uuid(),
        answers: z
          .array(
            z.object({
              questionId: z.string().min(1).max(64),
              answer: z.string().trim().max(MAX_ANSWER),
            }),
          )
          .max(MAX_QUESTIONS)
          .default([]),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId;

      const outcome = await db.transaction(async (tx) => {
        // Lock BEFORE reading, so an admin closing or archiving mid-flight is
        // seen and the application does not land anyway.
        await lockSubteam(tx, input.subteamId);

        const subteam = await tx.query.subteams.findFirst({
          where: eq(subteams.id, input.subteamId),
        });
        // Archived is invisible to members, so it answers like a made-up id.
        if (!subteam || subteam.archivedAt !== null) throw notFound();

        await requireActiveMember(
          tx,
          userId,
          "An active membership is required to apply to a subteam.",
        );

        if (!subteam.isOpen) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This subteam is not taking applications.",
          });
        }

        // Answers are matched to the questions as they are now; anything for a
        // question that no longer exists is dropped rather than stored loose.
        const given = new Map(
          input.answers.map((row) => [row.questionId, row.answer]),
        );
        const answers: SubteamAnswer[] = [];
        for (const question of subteam.questions) {
          const answer = given.get(question.id) ?? "";
          if (question.required && !answer) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `"${question.prompt}" needs an answer.`,
            });
          }
          if (answer) {
            answers.push({
              questionId: question.id,
              prompt: question.prompt,
              answer,
            });
          }
        }

        const existing = await tx.query.subteamApplications.findFirst({
          where: and(
            eq(subteamApplications.subteamId, subteam.id),
            eq(subteamApplications.userId, userId),
            inArray(subteamApplications.status, [...ACTIVE_STATUSES]),
          ),
        });

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              existing.status === "accepted"
                ? "You are already on this subteam."
                : "You have already applied to this subteam.",
          });
        }

        try {
          await tx.insert(subteamApplications).values({
            subteamId: subteam.id,
            userId,
            answers,
            note: input.note || null,
            status: "pending",
          });
        } catch (error) {
          // The read above only rules out rows committed before this
          // transaction began; the partial unique index settles a double submit.
          if (isUniqueViolation(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "You have already applied to this subteam.",
            });
          }
          throw error;
        }

        const applicant = await tx.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { email: true },
        });

        return { email: applicant?.email ?? null, subteamName: subteam.name };
      });

      await notify(outcome.email, outcome.subteamName, "received");

      return { status: "pending" as const };
    }),

  // Only the caller's own, and only while nobody has decided on it. Status in
  // the WHERE, so a withdrawal racing an accept cannot undo the decision.
  withdraw: protectedProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await (ctx.db as DrizzleDB)
        .update(subteamApplications)
        .set({ status: "withdrawn" })
        .where(
          and(
            eq(subteamApplications.id, input.applicationId),
            eq(subteamApplications.userId, ctx.userId),
            eq(subteamApplications.status, "pending"),
          ),
        )
        .returning({ id: subteamApplications.id });

      if (!updated) throw notFound("That application is no longer pending.");
      return { withdrawn: true };
    }),

  // ------------------------------------------------------------------- admin

  adminList: isAdmin.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;

    const rows = await db
      .select()
      .from(subteams)
      .orderBy(asc(subteams.name))
      .limit(200);

    if (rows.length === 0) return [];

    const tallies = await db
      .select({
        subteamId: subteamApplications.subteamId,
        status: subteamApplications.status,
        total: count(),
      })
      .from(subteamApplications)
      .where(
        inArray(
          subteamApplications.subteamId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(subteamApplications.subteamId, subteamApplications.status);

    const pending = new Map<string, number>();
    const accepted = new Map<string, number>();
    for (const tally of tallies) {
      if (tally.status === "pending") pending.set(tally.subteamId, tally.total);
      if (tally.status === "accepted")
        accepted.set(tally.subteamId, tally.total);
    }

    return rows.map((row) => ({
      ...row,
      pending: pending.get(row.id) ?? 0,
      accepted: accepted.get(row.id) ?? 0,
    }));
  }),

  create: isAdmin.input(subteamInput).mutation(async ({ ctx, input }) => {
    const [created] = await (ctx.db as DrizzleDB)
      .insert(subteams)
      .values({
        name: input.name,
        summary: input.summary || null,
        description: input.description || null,
        isOpen: input.isOpen,
        questions: normaliseQuestions(input.questions),
        createdById: ctx.userId,
      })
      .returning();

    if (!created) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not create that subteam.",
      });
    }
    return created;
  }),

  update: isAdmin
    .input(subteamInput.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const subteam = await db.query.subteams.findFirst({
        where: eq(subteams.id, input.id),
      });
      if (!subteam) throw notFound();

      if (subteam.archivedAt !== null && input.isOpen) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Restore this subteam before opening it.",
        });
      }

      // Nullable columns go in as explicit nulls: drizzle drops undefined from
      // .set(), so clearing a summary would report success and change nothing.
      const [updated] = await db
        .update(subteams)
        .set({
          name: input.name,
          summary: input.summary || null,
          description: input.description || null,
          isOpen: input.isOpen,
          questions: normaliseQuestions(input.questions),
          updatedAt: new Date(),
        })
        .where(eq(subteams.id, input.id))
        .returning();

      if (!updated) throw notFound();
      return updated;
    }),

  // Soft: the row and every application to it stay, so the history of who was
  // on a subteam outlives the subteam.
  setArchived: isAdmin
    .input(z.object({ id: z.string().uuid(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await (ctx.db as DrizzleDB)
        .update(subteams)
        .set({
          archivedAt: input.archived ? new Date() : null,
          // Archiving shuts the door, so restoring later does not silently
          // re-open applications nobody decided to re-open.
          ...(input.archived ? { isOpen: false } : {}),
          updatedAt: new Date(),
        })
        .where(eq(subteams.id, input.id))
        .returning({ id: subteams.id, archivedAt: subteams.archivedAt });

      if (!updated) throw notFound();
      return updated;
    }),

  /** One subteam's applications, filtered by state and by name or email. */
  applicants: isAdmin
    .input(
      z.object({
        subteamId: z.string().uuid(),
        status: z.enum(STATUSES).optional(),
        search: z.string().trim().max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const pattern = input.search ? `%${escapeLike(input.search)}%` : null;

      const [rows, tallies] = await Promise.all([
        db
          .select({
            id: subteamApplications.id,
            userId: subteamApplications.userId,
            name: users.name,
            email: users.email,
            status: subteamApplications.status,
            answers: subteamApplications.answers,
            note: subteamApplications.note,
            decisionNote: subteamApplications.decisionNote,
            appliedAt: subteamApplications.appliedAt,
            decidedAt: subteamApplications.decidedAt,
          })
          .from(subteamApplications)
          .innerJoin(users, eq(users.id, subteamApplications.userId))
          .where(
            and(
              eq(subteamApplications.subteamId, input.subteamId),
              input.status
                ? eq(subteamApplications.status, input.status)
                : undefined,
              pattern
                ? or(ilike(users.name, pattern), ilike(users.email, pattern))
                : undefined,
            ),
          )
          // Oldest first: the queue is worked in the order hands went up.
          .orderBy(asc(subteamApplications.appliedAt))
          .limit(500),
        // Unfiltered, so the filter chips can say how many each one holds.
        db
          .select({ status: subteamApplications.status, total: count() })
          .from(subteamApplications)
          .where(eq(subteamApplications.subteamId, input.subteamId))
          .groupBy(subteamApplications.status),
      ]);

      const tally = (status: SubteamApplicationStatus) =>
        tallies.find((row) => row.status === status)?.total ?? 0;
      const counts: Record<SubteamApplicationStatus, number> = {
        pending: tally("pending"),
        accepted: tally("accepted"),
        rejected: tally("rejected"),
        withdrawn: tally("withdrawn"),
        removed: tally("removed"),
      };

      return { applicants: rows, counts };
    }),

  /** Who is on the subteam now. */
  roster: isAdmin
    .input(z.object({ subteamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return (ctx.db as DrizzleDB)
        .select({
          id: subteamApplications.id,
          userId: subteamApplications.userId,
          name: users.name,
          email: users.email,
          decidedAt: subteamApplications.decidedAt,
        })
        .from(subteamApplications)
        .innerJoin(users, eq(users.id, subteamApplications.userId))
        .where(
          and(
            eq(subteamApplications.subteamId, input.subteamId),
            eq(subteamApplications.status, "accepted"),
          ),
        )
        .orderBy(asc(users.name))
        .limit(500);
    }),

  decide: isAdmin
    .input(
      z.object({
        applicationId: z.string().uuid(),
        decision: z.enum(["accepted", "rejected"]),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;

      const application = await db.query.subteamApplications.findFirst({
        where: eq(subteamApplications.id, input.applicationId),
      });
      if (!application) throw notFound("Application not found.");

      const subteam = await db.query.subteams.findFirst({
        where: eq(subteams.id, application.subteamId),
      });
      if (!subteam) throw notFound();
      if (subteam.archivedAt !== null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Restore this subteam before deciding on applications.",
        });
      }

      if (application.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            application.status === "withdrawn"
              ? "They withdrew their application."
              : "That application has already been decided.",
        });
      }

      // Status in the WHERE too: two admins deciding at once both pass the
      // read above, and only one of them may apply — and send one email.
      const [decided] = await db
        .update(subteamApplications)
        .set({
          status: input.decision,
          decidedAt: new Date(),
          decidedById: ctx.userId,
          decisionNote: input.note || null,
        })
        .where(
          and(
            eq(subteamApplications.id, application.id),
            eq(subteamApplications.status, "pending"),
          ),
        )
        .returning({ id: subteamApplications.id });

      if (!decided) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That application has already been decided.",
        });
      }

      const applicant = await db.query.users.findFirst({
        where: eq(users.id, application.userId),
        columns: { email: true },
      });

      await notify(applicant?.email, subteam.name, input.decision, input.note);

      return { status: input.decision };
    }),

  // Taking somebody off the roster. A status, not a delete, so the record of
  // having been on the subteam stays.
  removeMember: isAdmin
    .input(
      z.object({
        applicationId: z.string().uuid(),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [removed] = await (ctx.db as DrizzleDB)
        .update(subteamApplications)
        .set({
          status: "removed",
          decidedAt: new Date(),
          decidedById: ctx.userId,
          decisionNote: input.note || null,
        })
        .where(
          and(
            eq(subteamApplications.id, input.applicationId),
            eq(subteamApplications.status, "accepted"),
          ),
        )
        .returning({ id: subteamApplications.id });

      if (!removed) throw notFound("They are not on this subteam.");
      return { removed: true };
    }),
});
