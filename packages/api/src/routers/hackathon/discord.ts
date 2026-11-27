// The Discord link as the signed-in person sees it: which roles they hold, the
// link status (with the lazily assigned flower) and unlink. Linking itself is
// the OAuth route in sites/mainweb.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
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
  unlinkDiscord,
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
      const userId = ctx.userId;
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

  // Takes the roles back, then clears what we stored: the person's link and,
  // for a hacker, the copy on their registration. The roles are cleared on
  // Discord first, with the token kept for it, so unlinking is not a way to
  // keep a role while linking another account. If Discord cannot be reached
  // the link stays and the person can try again.
  unlinkDiscord: protectedProcedure
    .input(z.object({ hackathonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await unlinkDiscord(
        ctx.db as DrizzleDB,
        ctx.userId,
        input.hackathonId,
      );
      if (result === "failed") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Discord did not answer, so your roles were not cleared. Try again in a moment.",
        });
      }
      return { ok: true };
    }),
});
