import { z } from "zod";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { hackathonBans, hackathonParticipants, hackathons, users } from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter } from "../../trpc";
import { hackathonBanCacheKey, isAdmin } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { evictParticipantCaches } from "./admin/seats";
import {
  markDiscordRolesPending,
  syncDiscordRolesFor,
} from "../../services/discord";

const normalize = (email: string) => email.trim().toLowerCase();

/**
 * Hackathon bans. Staff can bar someone from taking part in hackathons
 * (registering, the interest list, teams, submitting, judging) without
 * touching their club membership. Enforcement is notHackathonBanned in
 * middleware/procedures.ts; this router only manages the list. Bug testers
 * can read it and nothing else, like every isAdmin mutation.
 */
export const hackathonBansRouter = createTRPCRouter({
  listBans: isAdmin.query(async ({ ctx }) => {
    const db = ctx.db as DrizzleDB;
    const bans = await db.query.hackathonBans.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Names for the people involved, in one read rather than one per row.
    const emails = bans.map((b) => b.email);
    const staffIds = bans
      .map((b) => b.bannedBy)
      .filter((id): id is string => !!id);
    const [accounts, staff] = await Promise.all([
      emails.length
        ? db.query.users.findMany({
            // Ban emails are lowercased; some older user rows are not.
            where: {
              RAW: (table, { sql }) => inArray(sql`lower(${table.email})`, emails),
            },
            columns: { email: true, name: true },
          })
        : [],
      staffIds.length
        ? db.query.users.findMany({
            where: { id: { in: staffIds } },
            columns: { id: true, name: true, email: true },
          })
        : [],
    ]);

    return bans.map((ban) => {
      const account = accounts.find((a) => normalize(a.email) === ban.email);
      const by = staff.find((s) => s.id === ban.bannedBy);
      return {
        id: ban.id,
        email: ban.email,
        name: account?.name ?? null,
        hasAccount: !!account,
        reason: ban.reason,
        bannedBy: by?.name ?? by?.email ?? null,
        createdAt: ban.createdAt,
      };
    });
  }),

  banFromHackathons: isAdmin
    .input(
      z.object({
        email: z.string().trim().email().max(320),
        reason: z.string().trim().min(3).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const email = normalize(input.email);

      // The ban and the rejection of existing applications are one write: a
      // banned person's pending or accepted row would otherwise still be
      // picked by acceptWave, mailed, or scanned in. The ban is by email and
      // covers every hackathon, so it rejects in every hackathon that is
      // still running; finished ones stay as the record of who took part.
      const { ban, rejectedUserIds } = await db.transaction(async (tx) => {
        // Re-banning updates the reason instead of failing on the unique email.
        const [ban] = await tx
          .insert(hackathonBans)
          .values({ email, reason: input.reason, bannedBy: ctx.userId })
          .onConflictDoUpdate({
            target: hackathonBans.email,
            set: { reason: input.reason, bannedBy: ctx.userId },
          })
          .returning();

        const rejected = await tx
          .update(hackathonParticipants)
          .set({ registrationStatus: "rejected", updatedAt: new Date() })
          .where(
            and(
              ne(hackathonParticipants.registrationStatus, "rejected"),
              inArray(
                hackathonParticipants.userId,
                tx
                  .select({ id: users.id })
                  .from(users)
                  .where(sql`lower(${users.email}) = ${email}`),
              ),
              inArray(
                hackathonParticipants.hackathonId,
                tx
                  .select({ id: hackathons.id })
                  .from(hackathons)
                  .where(notInArray(hackathons.status, ["completed", "cancelled"])),
              ),
            ),
          )
          .returning({
            userId: hackathonParticipants.userId,
            hackathonId: hackathonParticipants.hackathonId,
          });
        // Rejected, so a linked Discord account is owed a sync.
        await markDiscordRolesPending(
          tx as unknown as DrizzleDB,
          rejected.map((row) => row.userId),
        );

        return { ban, rejectedUserIds: rejected };
      });

      for (const row of rejectedUserIds) {
        evictParticipantCaches(ctx.cache, row.hackathonId, [row.userId]);
      }
      // Rejected, so any Discord roles they linked come back off.
      await syncDiscordRolesFor(
        db,
        rejectedUserIds.map((row) => row.userId),
      );

      ctx.cache.delete(hackathonBanCacheKey(email));

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.ban",
        resourceId: email,
        severity: "warn",
        metadata: { reason: input.reason },
      });

      return ban;
    }),

  liftHackathonBan: isAdmin
    .input(z.object({ email: z.string().trim().email().max(320) }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const email = normalize(input.email);

      const removed = await db
        .delete(hackathonBans)
        .where(eq(hackathonBans.email, email))
        .returning({ id: hackathonBans.id });

      ctx.cache.delete(hackathonBanCacheKey(email));

      if (removed.length) {
        await recordAdminAction(db, {
          userId: ctx.userId,
          action: "hackathon.unban",
          resourceId: email,
        });
      }

      return { lifted: removed.length > 0 };
    }),
});
