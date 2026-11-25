// The hacker's side of the Discord link: status (with the lazily assigned food
// group) and unlink. Linking itself is the OAuth route in sites/mainweb.

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { hackathonParticipants } from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  discordConfig,
  ensureFoodGroup,
  foodGroupByKey,
  isDiscordEligible,
} from "../../services/discord";

export const hackathonDiscordRouter = createTRPCRouter({
  myDiscord: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const row = await db.query.hackathonParticipants.findFirst({
        where: { hackathonId: input.hackathonId, userId: ctx.userId as string },
        columns: {
          id: true,
          registrationStatus: true,
          ramadanFasting: true,
          ramadanRoleOptIn: true,
          discordUsername: true,
          discordLinkedAt: true,
          foodGroup: true,
        },
      });
      const eligible = !!row && isDiscordEligible(row.registrationStatus);
      if (!row || !eligible) {
        return { eligible: false as const };
      }
      // The group exists whether or not they ever link: it is their meal wave.
      const key =
        foodGroupByKey(row.foodGroup)?.key ??
        (await ensureFoodGroup(db, input.hackathonId, row.id));
      const config = discordConfig();
      return {
        eligible: true as const,
        enabled: !!config,
        inviteUrl: config?.inviteUrl ?? null,
        linked: !!row.discordLinkedAt,
        username: row.discordUsername,
        foodGroup: foodGroupByKey(key),
        fasting: row.ramadanFasting === "Yes",
        ramadanOptIn: row.ramadanRoleOptIn ?? false,
      };
    }),

  // Clears what we stored. The Discord connection itself lives in the user's
  // Discord settings; we hold no token and cannot remove it.
  unlinkDiscord: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await (ctx.db as DrizzleDB)
        .update(hackathonParticipants)
        .set({
          discordUserId: null,
          discordUsername: null,
          discordLinkedAt: null,
          ramadanRoleOptIn: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(hackathonParticipants.hackathonId, input.hackathonId),
            eq(hackathonParticipants.userId, ctx.userId as string),
          ),
        );
      return { ok: true };
    }),
});
