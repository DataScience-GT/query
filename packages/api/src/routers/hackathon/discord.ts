// The Discord link as the signed-in person sees it: which roles they hold, the
// link status (with the lazily assigned flower) and unlink. Linking itself is
// the OAuth route in sites/mainweb.

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { discordLinks, hackathonParticipants } from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  discordConfig,
  discordContext,
  ensureFoodGroup,
  foodGroupByKey,
  hasDiscordRole,
  isAcceptedHacker,
  isConfirmedHacker,
  NO_ROLES,
  storedLink,
} from "../../services/discord";

export const hackathonDiscordRouter = createTRPCRouter({
  // With a hackathon id, that edition. Without one (the judge page and the
  // check-in desk have none), the newest live edition in which the person
  // holds a role. `eligible` means a role applies and they may link. A hacker
  // who is accepted but has not said "I'm coming" is not eligible yet:
  // `awaitingConfirmation` is what tells the portal to ask for it. Their
  // flower is shown either way, because it is also their meal wave.
  myDiscord: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;
      const context = await discordContext(
        db,
        userId,
        input.hackathonId ?? null,
      );
      const enabled = !!discordConfig();
      if (!context) {
        return {
          hackathon: null,
          enabled,
          eligible: false,
          roles: NO_ROLES,
          awaitingConfirmation: false,
          linked: false,
          username: null,
          foodGroup: null,
          fasting: false,
          ramadanOptIn: false,
        };
      }

      const { hackathon, participant, roles } = context;
      const accepted = !!participant && isAcceptedHacker(participant.registrationStatus);
      // The group exists whether or not they ever link: it is their meal wave.
      const foodGroup =
        accepted && participant
          ? (foodGroupByKey(participant.foodGroup) ??
            foodGroupByKey(await ensureFoodGroup(db, hackathon.id, participant.id)))
          : null;
      const link = await storedLink(db, userId, participant);
      return {
        hackathon,
        enabled,
        eligible: hasDiscordRole(roles),
        roles,
        awaitingConfirmation: !!participant && accepted && !isConfirmedHacker(participant),
        linked: !!link,
        username: link?.username ?? null,
        foodGroup,
        fasting: roles.hacker && participant?.ramadanFasting === "Yes",
        ramadanOptIn: (roles.hacker && participant?.ramadanRoleOptIn) || false,
      };
    }),

  // Clears what we stored: the person's link and, for a hacker, the copy on
  // their registration. The Discord connection itself lives in the user's
  // Discord settings; we hold no token and cannot remove it.
  unlinkDiscord: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;
      await db.transaction(async (tx) => {
        await tx
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
              eq(hackathonParticipants.userId, userId),
            ),
          );
        await tx.delete(discordLinks).where(eq(discordLinks.userId, userId));
      });
      return { ok: true };
    }),
});
