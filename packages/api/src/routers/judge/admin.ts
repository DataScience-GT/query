import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../../trpc";
import {
  judges,
  judgeAssignments,
  judgeVotes,
  hackathons,
  users,
} from "@query/db";
import { eq, and, sql } from "drizzle-orm";
import { isAdmin, isSuperAdmin } from "../../middleware/procedures";
import { CacheKeys, invalidatePortalContext } from "../../middleware/cache";
import { portalOrigin } from "../../services/judging/claims";
import type { DrizzleDB } from "@query/db";

// The organiser's side of the judge roster: who applied, who is approved, and
// adding or removing someone. Judging itself lives in routers/judging.
export const judgeAdminRouter = createTRPCRouter({
  // Judges, optionally scoped to one hackathon. A judges row belongs to exactly
  // one edition.
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

      // Same as approval: the role lookup and the sidebar both cache, so the
      // new judge would otherwise wait out a 5-minute TTL for the Judge tab.
      ctx.cache.deletePattern(`${CacheKeys.judge(user.id)}*`);
      invalidatePortalContext(user.id);

      // There was no application, so nothing else tells them they are a judge.
      // Its own copy rather than the approval's. Best-effort: a mail failure
      // must not undo a judge already in the database.
      if (user.email) {
        try {
          const hackathon = await (
            ctx.db as DrizzleDB
          ).query.hackathons.findFirst({
            where: eq(hackathons.id, input.hackathonId),
            columns: { name: true },
          });

          const { sendJudgeAddedEmail } = await import("@query/auth/email");
          await sendJudgeAddedEmail({
            email: user.email,
            hackathonName: hackathon?.name ?? "the hackathon",
            host: portalOrigin(),
          });
        } catch (error) {
          // Deliberate operational logging: the judge stands and this is the only
          // record that the notice did not go out.
          // oxlint-disable-next-line no-console
          console.error(
            `[Email Service] Judge added notice failed for user ${user.id}:`,
            error,
          );
        }
      }

      return result[0];
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

      // Keeps the application's own status column honest. judges.isActive is
      // what every judging gate reads; this column only mirrors it.
      await (ctx.db as DrizzleDB)
        .update(judgeAssignments)
        .set({ status: input.isActive ? "approved" : "pending" })
        .where(
          and(
            eq(judgeAssignments.judgeId, input.judgeId),
            eq(judgeAssignments.hackathonId, updated.hackathonId),
          ),
        );

      // judge.isJudge caches the role for 60s per user per hackathon; approval
      // has to take effect now, not a minute from now.
      ctx.cache.deletePattern(`${CacheKeys.judge(updated.userId)}*`);
      // The sidebar reads portal context, which lives 5 minutes — without this the
      // approved judge waits out that TTL before the Judge tab appears.
      invalidatePortalContext(updated.userId);

      // Tells the judge they were approved — the register success screen
      // promises this. Only on the transition. Best-effort: a mail failure must
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
            host: portalOrigin(),
          });
        } catch (error) {
          // Deliberate operational logging: the approval stands and this is the only
          // record that the notice did not go out.
          // oxlint-disable-next-line no-console
          console.error(
            `[Email Service] Judge approval notice failed for judge ${input.judgeId}:`,
            error,
          );
        }
      }

      return { success: true, isActive: input.isActive };
    }),

  remove: isSuperAdmin
    .input(z.object({ judgeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // judge_vote.judge_id cascades on delete, so removing a judge who scored
      // in a past edition would erase those scores.
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
});
