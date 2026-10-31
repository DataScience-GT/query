import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gt, ilike, inArray, isNull, sql } from "drizzle-orm";
import {
  judgingAppointments,
  judgingBuildings,
  judgingChallenges,
  judgingClaimLinks,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationResponses,
  judgingEvaluations,
  judgingRooms,
  judgingRubricItems,
  users,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { isAdmin, notHackathonBanned } from "../../middleware/procedures";
import { recordAdminAction } from "../../middleware/audit";
import { rateLimit } from "../../middleware/security";
import {
  emailConcurrency,
  forEachWithConcurrency,
} from "../../services/fanout";
import { assertHackathonExists } from "../../services/judging/config";
import type { JudgingDb } from "../../services/judging/config";
import { reconcileDueDrafts } from "../../services/judging/evaluation-store";
import {
  MAX_TEAM_SIZE,
  claimLinkPath,
  claimLinkUsable,
  claimPlace,
  decideClaim,
  decideInvite,
  heldPlace,
  isCheckedIn,
  issueClaimToken,
  loadRoster,
  lockJudgingConfig,
  lockPlaceForLink,
  markClaimsStarted,
  portalOrigin,
  readJudgingConfig,
  refuse,
  requireCheckedIn,
  rosterSize,
  sameEmail,
  teamSize,
} from "../../services/judging/claims";
import {
  buildItinerary,
  groupFeedback,
  visibleChallenges,
} from "../../services/judging/itinerary";
import type {
  Itinerary,
  VisibleChallenge,
} from "../../services/judging/itinerary";
import { holdsEveryRating } from "../../services/judging/scoring-sql";

const hackathonInput = z.object({
  hackathonId: z.string().uuid("Invalid hackathon ID"),
});

// 32 random bytes, base64url: 43 characters.
const tokenInput = z.string().trim().min(20).max(128);

/** One organiser click sends this many claim emails; the client pages on. */
const CLAIM_EMAIL_BATCH = 5;

const LINK_UNUSABLE =
  "This claim link has been used or has expired. Ask an organiser at the help desk for a new one.";

const LINKS_CLOSED =
  "The event has ended, so claim links no longer work. Move the event's end date first if judging is still running.";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

async function loadChallenges(db: JudgingDb, hackathonId: string) {
  return db
    .select({
      id: judgingChallenges.id,
      label: judgingChallenges.label,
      parentId: judgingChallenges.parentId,
      mode: judgingChallenges.mode,
      displayOrder: judgingChallenges.displayOrder,
    })
    .from(judgingChallenges)
    .where(eq(judgingChallenges.hackathonId, hackathonId));
}

async function liveEntry(db: JudgingDb, hackathonId: string, entryId: string) {
  const [entry] = await db
    .select({ id: judgingEntries.id, title: judgingEntries.title })
    .from(judgingEntries)
    .where(
      and(
        eq(judgingEntries.id, entryId),
        eq(judgingEntries.hackathonId, hackathonId),
        isNull(judgingEntries.deletedAt),
      ),
    )
    .limit(1);
  if (!entry) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That project is no longer in judging.",
    });
  }
  return entry;
}

// A hacker's side of judging: claims, itinerary, feedback.
export const judgingHackerRouter = createTRPCRouter({
  // Where the caller stands: checked in or not, the project they hold a place
  // on (with its team, unless organisers switched to emergency mode), and,
  // until they hold one, the places listed under their own email that they
  // can claim in one click.
  myClaim: protectedProcedure
    .input(hackathonInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;

      const [checkedIn, config] = await Promise.all([
        isCheckedIn(db, input.hackathonId, userId),
        readJudgingConfig(db, input.hackathonId),
      ]);
      const state = {
        checkedIn,
        published: config.itineraryPublished,
        emergency: config.emergencyMode,
        claimsStarted: !!config.claimsStartedAt,
      };
      if (!checkedIn) return { ...state, claim: null, offers: [] };

      const held = await heldPlace(db, input.hackathonId, userId);
      if (held && !held.deletedAt) {
        const roster = await loadRoster(db, held.entryId);
        return {
          ...state,
          claim: {
            entryId: held.entryId,
            title: held.title,
            memberId: held.memberId,
            // Emergency mode hides the team: the list may be what is broken.
            members: config.emergencyMode
              ? null
              : roster.map((member) => ({
                  id: member.id,
                  name: member.name,
                  claimed: !!member.userId,
                  isYou: member.userId === userId,
                  addedByTeammate: !!member.invitedById,
                })),
            canInvite:
              !config.emergencyMode &&
              teamSize(held.participantCount, roster.length) < MAX_TEAM_SIZE,
          },
          offers: [],
        };
      }

      const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) return { ...state, claim: null, offers: [] };

      // Every sign-in path verifies the address, so a match is proof enough.
      const listed = await db
        .select({
          memberId: judgingEntryMembers.id,
          name: judgingEntryMembers.name,
          entryId: judgingEntries.id,
          title: judgingEntries.title,
          participantCount: judgingEntries.participantCount,
        })
        .from(judgingEntryMembers)
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingEntryMembers.entryId),
        )
        .where(
          and(
            eq(judgingEntryMembers.hackathonId, input.hackathonId),
            isNull(judgingEntryMembers.userId),
            isNull(judgingEntries.deletedAt),
            sql`lower(${judgingEntryMembers.email}) = lower(${user.email})`,
          ),
        )
        .orderBy(asc(judgingEntries.title));

      const offers = await Promise.all(
        listed.map(async (place) => ({
          memberId: place.memberId,
          name: place.name,
          entryId: place.entryId,
          title: place.title,
          teamTooLarge:
            teamSize(
              place.participantCount,
              await rosterSize(db, place.entryId),
            ) > MAX_TEAM_SIZE,
        })),
      );

      return { ...state, claim: null, offers };
    }),

  // The one-click path: a place listed under the caller's own email.
  claimByEmail: notHackathonBanned
    .input(hackathonInput.extend({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;
      await assertHackathonExists(db, input.hackathonId);

      return db.transaction(async (tx) => {
        await lockJudgingConfig(tx, input.hackathonId);
        await requireCheckedIn(tx, input.hackathonId, userId);

        const [user] = await tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const [listed] = await tx
          .select({ email: judgingEntryMembers.email })
          .from(judgingEntryMembers)
          .where(
            and(
              eq(judgingEntryMembers.id, input.memberId),
              eq(judgingEntryMembers.hackathonId, input.hackathonId),
            ),
          )
          .limit(1);
        // A missing place falls through to claimPlace's "no longer in judging".
        if (listed && (!user || !sameEmail(listed.email, user.email))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "That place is listed under a different email. Open the claim link an organiser sent to that address instead.",
          });
        }

        return claimPlace(tx, {
          hackathonId: input.hackathonId,
          memberId: input.memberId,
          userId,
          now: new Date(),
        });
      });
    }),

  // What a claim link would claim, shown before the hacker confirms. Names
  // only: a forwarded link must not hand out the team's email addresses.
  // `refusal` is the sentence the confirm would fail with, if it would.
  previewClaim: protectedProcedure
    .input(hackathonInput.extend({ token: tokenInput }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;
      const now = new Date();
      const hackathon = await assertHackathonExists(db, input.hackathonId);
      await requireCheckedIn(db, input.hackathonId, userId);

      const [link] = await db
        .select({
          token: judgingClaimLinks.token,
          consumedAt: judgingClaimLinks.consumedAt,
          expiresAt: judgingClaimLinks.expiresAt,
          memberId: judgingEntryMembers.id,
          name: judgingEntryMembers.name,
          userId: judgingEntryMembers.userId,
          entryId: judgingEntries.id,
          title: judgingEntries.title,
          participantCount: judgingEntries.participantCount,
          deletedAt: judgingEntries.deletedAt,
        })
        .from(judgingClaimLinks)
        .innerJoin(
          judgingEntryMembers,
          eq(judgingEntryMembers.id, judgingClaimLinks.memberId),
        )
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingEntryMembers.entryId),
        )
        .where(
          and(
            eq(judgingClaimLinks.token, input.token),
            eq(judgingClaimLinks.hackathonId, input.hackathonId),
          ),
        )
        .limit(1);

      if (!link || !claimLinkUsable(link, hackathon.endDate, now)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: LINK_UNUSABLE });
      }

      const [roster, held] = await Promise.all([
        loadRoster(db, link.entryId),
        heldPlace(db, input.hackathonId, userId),
      ]);
      const decision = decideClaim(
        {
          userId: link.userId,
          entryDeleted: !!link.deletedAt,
          teamSize: teamSize(link.participantCount, roster.length),
        },
        userId,
        held && held.memberId !== link.memberId && !held.deletedAt
          ? held.title
          : null,
      );

      return {
        entryId: link.entryId,
        title: link.title,
        hackathonName: hackathon.name,
        place: { memberId: link.memberId, name: link.name },
        members: roster.map((member) => ({
          id: member.id,
          name: member.name,
          claimed: !!member.userId,
        })),
        refusal: decision.ok ? null : decision.message,
      };
    }),

  claimByToken: notHackathonBanned
    .input(hackathonInput.extend({ token: tokenInput }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;
      const now = new Date();
      const hackathon = await assertHackathonExists(db, input.hackathonId);

      return db.transaction(async (tx) => {
        await lockJudgingConfig(tx, input.hackathonId);
        await requireCheckedIn(tx, input.hackathonId, userId);

        const [link] = await tx
          .select()
          .from(judgingClaimLinks)
          .where(
            and(
              eq(judgingClaimLinks.token, input.token),
              eq(judgingClaimLinks.hackathonId, input.hackathonId),
            ),
          )
          .for("update");
        if (!link || !claimLinkUsable(link, hackathon.endDate, now)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: LINK_UNUSABLE });
        }

        return claimPlace(tx, {
          hackathonId: input.hackathonId,
          memberId: link.memberId,
          userId,
          now,
        });
      });
    }),

  // A claimed hacker adds a checked-in teammate by the email they sign in
  // with. The teammate gets a place on the team list and a claim link; the
  // place is theirs once they open it (or claim it from their Judging tab,
  // since the email matches).
  invite: notHackathonBanned
    .input(
      hackathonInput.extend({
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email("Enter a valid email.")
          .max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;

      // Per user: a campus shares one address, and the lookup below answers
      // "is this email a checked-in hacker" however carefully it is worded.
      const limit = rateLimit(`judging-invite:${userId}`, 10, 10 / 60);
      if (!limit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Too many invitations in a row. Wait a minute, then try again.",
        });
      }

      const hackathon = await assertHackathonExists(db, input.hackathonId);
      const now = new Date();
      if (hackathon.endDate <= now) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The event has ended, so teams can no longer change.",
        });
      }

      const reserved = await db.transaction(async (tx) => {
        const config = await lockJudgingConfig(tx, input.hackathonId);
        if (config.emergencyMode) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Team changes are paused while organisers run judging from the posted list. Ask at the help desk.",
          });
        }
        await requireCheckedIn(tx, input.hackathonId, userId);

        const held = await heldPlace(tx, input.hackathonId, userId);
        if (!held || held.deletedAt) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Claim your project before adding teammates.",
          });
        }

        const roster = await loadRoster(tx, held.entryId);
        const accounts = await tx
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(sql`lower(${users.email}) = ${input.email}`)
          .limit(2);
        // Two accounts on one address is ambiguous; neither gets the place.
        const account = accounts.length === 1 ? accounts[0]! : null;

        let invitee: Parameters<typeof decideInvite>[0]["invitee"] = null;
        if (account) {
          const checkedIn = await isCheckedIn(
            tx,
            input.hackathonId,
            account.id,
          );
          const theirs = await heldPlace(tx, input.hackathonId, account.id);
          invitee = {
            checkedIn,
            heldProject:
              !theirs || theirs.deletedAt
                ? null
                : theirs.entryId === held.entryId
                  ? "this"
                  : "other",
          };
        }

        const listed = roster.find((member) =>
          sameEmail(member.email, input.email),
        );
        const decision = decideInvite({
          teamSize: teamSize(held.participantCount, roster.length),
          invitee,
          listed: listed ? { claimed: !!listed.userId } : null,
        });
        if (!("action" in decision)) refuse(decision);

        let memberId: string;
        if (decision.action === "resend") {
          memberId = listed!.id;
        } else {
          const [added] = await tx
            .insert(judgingEntryMembers)
            .values({
              entryId: held.entryId,
              hackathonId: input.hackathonId,
              name: account!.name?.trim() || account!.email,
              email: account!.email,
              displayOrder:
                roster.reduce(
                  (top, member) => Math.max(top, member.displayOrder),
                  -1,
                ) + 1,
              invitedById: userId,
            })
            .returning({ id: judgingEntryMembers.id });
          memberId = added!.id;
          await tx
            .update(judgingEntries)
            .set({
              participantCount:
                teamSize(held.participantCount, roster.length) + 1,
              updatedAt: now,
            })
            .where(eq(judgingEntries.id, held.entryId));
        }

        await lockPlaceForLink(tx, input.hackathonId, memberId);
        const token = await issueClaimToken(tx, {
          hackathonId: input.hackathonId,
          memberId,
          expiresAt: hackathon.endDate,
        });
        return {
          memberId,
          token,
          email: account!.email,
          title: held.title,
          added: decision.action === "add",
        };
      });

      // Sent after the commit: the place is held whatever the mail server
      // does, and adding the same address again resends.
      try {
        const { sendJudgingClaimEmail } = await import("@query/auth/email");
        await sendJudgingClaimEmail({
          email: reserved.email,
          hackathonName: hackathon.name,
          projectTitle: reserved.title,
          claimUrl:
            portalOrigin() + claimLinkPath(input.hackathonId, reserved.token),
          invitedBy: ctx.session?.user?.name ?? "A teammate",
        });
        await db
          .update(judgingClaimLinks)
          .set({ sentAt: new Date() })
          .where(eq(judgingClaimLinks.memberId, reserved.memberId));
        return {
          added: reserved.added,
          emailed: true,
          message: reserved.added
            ? "Added. They have an email with a link to claim their place, or can claim it from their Judging tab."
            : "They were already on the team list. The claim email went out again.",
        };
      } catch (error) {
        // Deliberate server-side logging: the only record of the failed send.
        // oxlint-disable-next-line no-console
        console.error("[Judging] Teammate claim email failed:", error);
        return {
          added: reserved.added,
          emailed: false,
          message:
            "Their place is held, but the email did not send. They can claim it from their Judging tab, or add the same address again to resend.",
        };
      }
    }),

  // The project's challenges always; rooms, times and statuses once
  // organisers publish the itinerary. In emergency mode (with the itinerary
  // published) any checked-in hacker can look up any project, found through
  // searchProjects, because claims may be what broke.
  itinerary: protectedProcedure
    .input(hackathonInput.extend({ entryId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;
      const now = new Date();
      await requireCheckedIn(db, input.hackathonId, userId);

      const [config, held] = await Promise.all([
        readJudgingConfig(db, input.hackathonId),
        heldPlace(db, input.hackathonId, userId),
      ]);
      const ownEntryId = held && !held.deletedAt ? held.entryId : null;
      const lookupOpen = config.emergencyMode && config.itineraryPublished;
      if (input.entryId && input.entryId !== ownEntryId && !lookupOpen) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only see your own project's judging schedule.",
        });
      }

      const state = {
        published: config.itineraryPublished,
        emergency: config.emergencyMode,
        serverNow: now,
      };
      const empty: Itinerary & { challenges: VisibleChallenge[] } = {
        challenges: [],
        appointments: [],
        unscheduled: [],
        missed: false,
        nextEndsAt: null,
      };

      const entryId = input.entryId ?? ownEntryId;
      if (!entryId) return { ...state, entry: null, ...empty };

      const entry = await liveEntry(db, input.hackathonId, entryId);
      const [challenges, memberships] = await Promise.all([
        loadChallenges(db, input.hackathonId),
        db
          .select({ challengeId: judgingEntryChallenges.challengeId })
          .from(judgingEntryChallenges)
          .where(eq(judgingEntryChallenges.entryId, entry.id)),
      ]);
      const entryChallengeIds = memberships.map((row) => row.challengeId);
      const visible = visibleChallenges(challenges, entryChallengeIds);

      if (!config.itineraryPublished) {
        return { ...state, entry, ...empty, challenges: visible };
      }

      // Drafts past their deadline count as submitted; without this a slot a
      // judge timed out on would read as missed until some judge's desk loads.
      await reconcileDueDrafts(db, input.hackathonId, now);

      const [rooms, appointments, evaluations] = await Promise.all([
        db
          .select({
            id: judgingRooms.id,
            challengeId: judgingRooms.challengeId,
            name: judgingRooms.name,
            kind: judgingRooms.kind,
            building: judgingBuildings.name,
            displayOrder: judgingRooms.displayOrder,
            archivedAt: judgingRooms.archivedAt,
          })
          .from(judgingRooms)
          .leftJoin(
            judgingBuildings,
            eq(judgingBuildings.id, judgingRooms.buildingId),
          )
          .where(eq(judgingRooms.hackathonId, input.hackathonId)),
        db
          .select({
            id: judgingAppointments.id,
            challengeId: judgingAppointments.challengeId,
            roomId: judgingAppointments.roomId,
            startsAt: judgingAppointments.startsAt,
            deadlineAt: judgingAppointments.deadlineAt,
            endsAt: judgingAppointments.endsAt,
          })
          .from(judgingAppointments)
          .where(
            and(
              eq(judgingAppointments.hackathonId, input.hackathonId),
              eq(judgingAppointments.entryId, entry.id),
            ),
          ),
        db
          .select({
            judgeId: judgingEvaluations.judgeId,
            challengeId: judgingEvaluations.challengeId,
            appointmentId: judgingEvaluations.appointmentId,
            ratingsComplete: holdsEveryRating(input.hackathonId),
          })
          .from(judgingEvaluations)
          .where(
            and(
              eq(judgingEvaluations.hackathonId, input.hackathonId),
              eq(judgingEvaluations.entryId, entry.id),
            ),
          ),
      ]);

      const itinerary = buildItinerary({
        challenges,
        entryChallengeIds,
        rooms: rooms.map(({ archivedAt, ...room }) => ({
          ...room,
          archived: !!archivedAt,
        })),
        appointments,
        evaluations,
        now,
      });

      return { ...state, entry, challenges: visible, ...itinerary };
    }),

  // Written feedback on the caller's project: public responses that exist, from
  // evaluations that hold every rating (the ones placings count). A response
  // is public when its judge's kind and the item's guest visibility say so
  // (evaluation.ts responseVisibility), so a guest's shows only as the rubric
  // allows. No judge names and no scores. Hidden in emergency mode.
  feedback: protectedProcedure
    .input(hackathonInput)
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const userId = ctx.userId as string;
      await requireCheckedIn(db, input.hackathonId, userId);

      const config = await readJudgingConfig(db, input.hackathonId);
      if (config.emergencyMode) return { available: false, items: [] };

      const held = await heldPlace(db, input.hackathonId, userId);
      if (!held || held.deletedAt) return { available: true, items: [] };

      const evaluations = await db
        .select({
          id: judgingEvaluations.id,
          challengeId: judgingEvaluations.challengeId,
          submittedAt: judgingEvaluations.submittedAt,
        })
        .from(judgingEvaluations)
        .where(
          and(
            eq(judgingEvaluations.hackathonId, input.hackathonId),
            eq(judgingEvaluations.entryId, held.entryId),
            holdsEveryRating(input.hackathonId),
          ),
        );
      if (evaluations.length === 0) return { available: true, items: [] };

      const [responses, challenges] = await Promise.all([
        db
          .select({
            evaluationId: judgingEvaluationResponses.evaluationId,
            label: judgingRubricItems.label,
            displayOrder: judgingRubricItems.displayOrder,
            value: judgingEvaluationResponses.value,
          })
          .from(judgingEvaluationResponses)
          .innerJoin(
            judgingRubricItems,
            eq(judgingRubricItems.id, judgingEvaluationResponses.itemId),
          )
          .where(
            and(
              inArray(
                judgingEvaluationResponses.evaluationId,
                evaluations.map((evaluation) => evaluation.id),
              ),
              eq(judgingEvaluationResponses.isPublic, true),
            ),
          ),
        loadChallenges(db, input.hackathonId),
      ]);

      return {
        available: true,
        items: groupFeedback(evaluations, responses, challenges),
      };
    }),

  // Emergency-mode lookup by title, so a hacker whose claim is missing can
  // still find where their project presents.
  searchProjects: protectedProcedure
    .input(hackathonInput.extend({ query: z.string().trim().min(2).max(100) }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      await requireCheckedIn(db, input.hackathonId, ctx.userId as string);

      const config = await readJudgingConfig(db, input.hackathonId);
      if (!config.emergencyMode || !config.itineraryPublished) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Project search opens only if organisers switch judging to emergency mode.",
        });
      }

      return db
        .select({ id: judgingEntries.id, title: judgingEntries.title })
        .from(judgingEntries)
        .where(
          and(
            eq(judgingEntries.hackathonId, input.hackathonId),
            isNull(judgingEntries.deletedAt),
            ilike(judgingEntries.title, `%${escapeLike(input.query)}%`),
          ),
        )
        .orderBy(asc(judgingEntries.title))
        .limit(25);
    }),

  // Officer view of claims: every project's team list with who has claimed,
  // their Devpost email, and whether a claim email went out.
  claimOverview: isAdmin
    .input(
      hackathonInput.extend({ search: z.string().trim().max(200).optional() }),
    )
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const hackathon = await assertHackathonExists(db, input.hackathonId);
      const config = await readJudgingConfig(db, input.hackathonId);

      const rows = await db
        .select({
          memberId: judgingEntryMembers.id,
          name: judgingEntryMembers.name,
          email: judgingEntryMembers.email,
          userId: judgingEntryMembers.userId,
          claimedAt: judgingEntryMembers.claimedAt,
          invitedById: judgingEntryMembers.invitedById,
          entryId: judgingEntries.id,
          title: judgingEntries.title,
          source: judgingEntries.source,
          participantCount: judgingEntries.participantCount,
          linkSentAt: judgingClaimLinks.sentAt,
          linkUsedAt: judgingClaimLinks.consumedAt,
          claimedByName: users.name,
          claimedByEmail: users.email,
        })
        .from(judgingEntryMembers)
        .innerJoin(
          judgingEntries,
          eq(judgingEntries.id, judgingEntryMembers.entryId),
        )
        .leftJoin(
          judgingClaimLinks,
          eq(judgingClaimLinks.memberId, judgingEntryMembers.id),
        )
        .leftJoin(users, eq(users.id, judgingEntryMembers.userId))
        .where(
          and(
            eq(judgingEntryMembers.hackathonId, input.hackathonId),
            isNull(judgingEntries.deletedAt),
          ),
        )
        .orderBy(
          asc(judgingEntries.title),
          asc(judgingEntries.id),
          asc(judgingEntryMembers.displayOrder),
          asc(judgingEntryMembers.createdAt),
        );

      type Entry = {
        entryId: string;
        title: string;
        source: "devpost" | "portal";
        teamSize: number;
        teamTooLarge: boolean;
        members: {
          memberId: string;
          name: string;
          email: string;
          claimed: boolean;
          claimedAt: Date | null;
          claimedBy: { name: string | null; email: string } | null;
          addedByTeammate: boolean;
          emailedAt: Date | null;
          linkUsedAt: Date | null;
        }[];
      };
      const entries = new Map<string, Entry & { participantCount: number }>();
      for (const row of rows) {
        const entry = entries.get(row.entryId) ?? {
          entryId: row.entryId,
          title: row.title,
          source: row.source,
          participantCount: row.participantCount,
          teamSize: 0,
          teamTooLarge: false,
          members: [],
        };
        entry.members.push({
          memberId: row.memberId,
          name: row.name,
          email: row.email,
          claimed: !!row.userId,
          claimedAt: row.claimedAt,
          claimedBy:
            row.userId && row.claimedByEmail
              ? { name: row.claimedByName, email: row.claimedByEmail }
              : null,
          addedByTeammate: !!row.invitedById,
          emailedAt: row.linkSentAt,
          linkUsedAt: row.linkUsedAt,
        });
        entries.set(row.entryId, entry);
      }

      const all: Entry[] = [...entries.values()].map(
        ({ participantCount, ...entry }) => {
          const size = teamSize(participantCount, entry.members.length);
          return {
            ...entry,
            teamSize: size,
            teamTooLarge: size > MAX_TEAM_SIZE,
          };
        },
      );

      const members = all.flatMap((entry) => entry.members);
      const claimed = members.filter((member) => member.claimed).length;
      const needle = input.search?.toLowerCase();

      return {
        claimsStartedAt: config.claimsStartedAt,
        linksExpireAt: hackathon.endDate,
        summary: {
          projects: all.length,
          members: members.length,
          claimed,
          unclaimed: members.length - claimed,
          emailed: members.filter((member) => member.emailedAt).length,
          // What sendClaimEmails can still send; a team over four is skipped
          // until it is cut, and counted under teamsTooLarge instead.
          unsent: all
            .filter((entry) => !entry.teamTooLarge)
            .flatMap((entry) => entry.members)
            .filter((member) => !member.claimed && !member.emailedAt).length,
          teamsTooLarge: all.filter((entry) => entry.teamTooLarge).length,
        },
        entries: needle
          ? all.filter(
              (entry) =>
                entry.title.toLowerCase().includes(needle) ||
                entry.members.some(
                  (member) =>
                    member.name.toLowerCase().includes(needle) ||
                    member.email.toLowerCase().includes(needle),
                ),
            )
          : all,
      };
    }),

  // The member's claim link, issued if they have none, for an organiser to
  // copy into a message. Audited: it is a credential for someone's place.
  claimLink: isAdmin
    .input(hackathonInput.extend({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const hackathon = await assertHackathonExists(db, input.hackathonId);
      if (hackathon.endDate <= new Date()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: LINKS_CLOSED,
        });
      }

      const { token, entryId } = await db.transaction(async (tx) => {
        await lockJudgingConfig(tx, input.hackathonId);
        const place = await lockPlaceForLink(
          tx,
          input.hackathonId,
          input.memberId,
        );
        return {
          entryId: place.entryId,
          token: await issueClaimToken(tx, {
            hackathonId: input.hackathonId,
            memberId: place.id,
            expiresAt: hackathon.endDate,
          }),
        };
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.hacker.claimLink",
        resourceId: input.memberId,
        metadata: { hackathonId: input.hackathonId, entryId },
      });

      return {
        url: portalOrigin() + claimLinkPath(input.hackathonId, token),
        expiresAt: hackathon.endDate,
      };
    }),

  // Emails claim links to unclaimed team members who have not had one, five
  // per call; pass back `nextCursor` until it is null. With `memberId`, resends
  // to that one person. The first send marks claims as started, which stops a
  // Devpost import from replacing the projects those emails point at.
  sendClaimEmails: isAdmin
    .input(
      hackathonInput.extend({
        cursor: z.string().uuid().optional(),
        memberId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const hackathon = await assertHackathonExists(db, input.hackathonId);
      const now = new Date();
      if (hackathon.endDate <= now) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: LINKS_CLOSED,
        });
      }

      const candidates = input.memberId
        ? [{ id: input.memberId }]
        : await db
            .select({ id: judgingEntryMembers.id })
            .from(judgingEntryMembers)
            .innerJoin(
              judgingEntries,
              eq(judgingEntries.id, judgingEntryMembers.entryId),
            )
            .leftJoin(
              judgingClaimLinks,
              eq(judgingClaimLinks.memberId, judgingEntryMembers.id),
            )
            .where(
              and(
                eq(judgingEntryMembers.hackathonId, input.hackathonId),
                isNull(judgingEntries.deletedAt),
                isNull(judgingEntryMembers.userId),
                isNull(judgingClaimLinks.sentAt),
                input.cursor
                  ? gt(judgingEntryMembers.id, input.cursor)
                  : undefined,
              ),
            )
            .orderBy(asc(judgingEntryMembers.id))
            .limit(CLAIM_EMAIL_BATCH + 1);

      const batch = candidates.slice(0, CLAIM_EMAIL_BATCH);
      const hasMore = candidates.length > CLAIM_EMAIL_BATCH;

      const ready: {
        memberId: string;
        email: string;
        title: string;
        token: string;
      }[] = [];
      const skipped: { memberId: string; reason: string }[] = [];

      if (batch.length > 0) {
        await db.transaction(async (tx) => {
          await lockJudgingConfig(tx, input.hackathonId);
          for (const { id } of batch) {
            // A batch carries on past a team that is too big or a place
            // claimed since the list was read; a single resend says why.
            // These refusals are checks in code, so the transaction is intact.
            const place = await lockPlaceForLink(
              tx,
              input.hackathonId,
              id,
            ).catch((error: unknown) => {
              if (error instanceof TRPCError && !input.memberId) {
                skipped.push({ memberId: id, reason: error.message });
                return null;
              }
              throw error;
            });
            if (!place) continue;
            ready.push({
              memberId: place.id,
              email: place.email,
              title: place.title,
              token: await issueClaimToken(tx, {
                hackathonId: input.hackathonId,
                memberId: place.id,
                expiresAt: hackathon.endDate,
              }),
            });
          }
          if (ready.length > 0)
            await markClaimsStarted(tx, input.hackathonId, now);
        });
      }

      const { sendJudgingClaimEmail } = await import("@query/auth/email");
      let sent = 0;
      const failed: string[] = [];
      await forEachWithConcurrency(ready, emailConcurrency(), async (item) => {
        try {
          await sendJudgingClaimEmail({
            email: item.email,
            hackathonName: hackathon.name,
            projectTitle: item.title,
            claimUrl:
              portalOrigin() + claimLinkPath(input.hackathonId, item.token),
          });
          // Stamped per message, so a retry after a failure mails only the rest.
          await db
            .update(judgingClaimLinks)
            .set({ sentAt: new Date() })
            .where(eq(judgingClaimLinks.memberId, item.memberId));
          sent++;
        } catch (error) {
          failed.push(item.email);
          // Deliberate operational logging: the only record of which address
          // the provider rejected.
          // oxlint-disable-next-line no-console
          console.error(
            `[Judging] Claim email to ${item.email} failed:`,
            error,
          );
        }
      });

      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "judging.hacker.sendClaimEmails",
        resourceId: input.hackathonId,
        severity: "warn",
        metadata: {
          sent,
          failed: failed.length,
          skipped: skipped.length,
          memberId: input.memberId ?? null,
        },
      });

      return {
        sent,
        failed,
        skipped,
        nextCursor: hasMore ? batch[batch.length - 1]!.id : null,
      };
    }),
});
