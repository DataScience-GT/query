import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import {
  hackathonParticipants,
  judgingClaimLinks,
  judgingConfigs,
  judgingEntries,
  judgingEntryMembers,
} from "@query/db";
import { isUniqueViolation } from "../../middleware/db-errors";
import { ensureJudgingConfig, lockInventory } from "./config";
import type { JudgingConfig, JudgingDb, JudgingTx } from "./config";

// Claiming ties a judged project's team list to portal accounts. A Devpost
// export names each teammate by the email they used on Devpost; a hacker whose
// portal address is the same claims their place in one click, and anyone else
// opens a one-time link an organiser emails to the Devpost address. Portal
// submissions arrive already linked. Whoever holds a place sees the project's
// rooms, times and feedback.

/** Judging seats at most four people on a team. */
export const MAX_TEAM_SIZE = 4;

/**
 * A team's size as judging counts it: the larger of what Devpost reported and
 * the rows on the roster, so neither a short export nor a pending invite lets a
 * fifth person through.
 */
export function teamSize(participantCount: number, rosterSize: number): number {
  return Math.max(participantCount, rosterSize);
}

export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** A fresh claim token: 32 random bytes, URL-safe. */
export function newClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Where a claim link lands, relative to the portal origin. */
export function claimLinkPath(hackathonId: string, token: string): string {
  return `/hackathons/${hackathonId}/claim?token=${encodeURIComponent(token)}`;
}

/** The public portal origin, for links that leave the site in an email. */
export function portalOrigin(): string {
  const origin =
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    "https://datasciencegt.org";
  return origin.replace(/\/+$/, "");
}

export type ClaimLinkState = {
  token: string | null;
  consumedAt: Date | null;
  expiresAt: Date;
};

/**
 * Whether a link still claims anything: it holds a token, nobody used it, and
 * the event has not ended. The event's end is checked as well as the stored
 * expiry because organisers can move the end date after links went out.
 */
export function claimLinkUsable(
  link: ClaimLinkState,
  eventEnd: Date,
  now: Date,
): boolean {
  return (
    !!link.token && !link.consumedAt && link.expiresAt > now && eventEnd > now
  );
}

type Refusal = {
  ok: false;
  code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "PRECONDITION_FAILED";
  message: string;
};

export type ClaimDecision = { ok: true; alreadyYours: boolean } | Refusal;

/**
 * Whether `callerId` may take a place on a team. `target` is null when the
 * place does not exist; `heldElsewhere` is the title of a live project the
 * caller already holds a place on, if any.
 */
export function decideClaim(
  target: {
    userId: string | null;
    entryDeleted: boolean;
    teamSize: number;
  } | null,
  callerId: string,
  heldElsewhere: string | null,
): ClaimDecision {
  if (!target || target.entryDeleted) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message:
        "That project is no longer in judging. Ask an organiser at the help desk.",
    };
  }
  // A second tap on the same button, or a link opened twice.
  if (target.userId === callerId) return { ok: true, alreadyYours: true };
  if (target.userId) {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        "Someone has already claimed this place. If that was not you, tell an organiser.",
    };
  }
  if (heldElsewhere) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `You already claimed ${heldElsewhere}. Each person is on one project per event; an organiser can move you.`,
    };
  }
  if (target.teamSize > MAX_TEAM_SIZE) {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message:
        "This team lists more than four people. An organiser has to fix the team list before anyone can claim it.",
    };
  }
  return { ok: true, alreadyYours: false };
}

// One answer for every way an address can fail, so the invite box cannot be
// used to find out who has an account, who checked in or who is on a team.
const INVITE_UNAVAILABLE =
  "That email cannot be added. Use the address your teammate signs in to the portal with, and check they have been checked in at the event.";

export type InviteDecision =
  | { action: "add" }
  /** Already on the team list and not yet claimed: send them the link again. */
  | { action: "resend" }
  | Refusal;

export function decideInvite(input: {
  teamSize: number;
  /**
   * The one account with that email, or null. `heldProject` is the live
   * project it holds a place on: "this" team, "other", or null for none.
   */
  invitee: { checkedIn: boolean; heldProject: "this" | "other" | null } | null;
  /** A place on this team listed under that email, or null. */
  listed: { claimed: boolean } | null;
}): InviteDecision {
  if (input.listed?.claimed || input.invitee?.heldProject === "this") {
    return {
      ok: false,
      code: "CONFLICT",
      message: "They are already on your team.",
    };
  }
  if (!input.invitee?.checkedIn || input.invitee.heldProject === "other") {
    return { ok: false, code: "BAD_REQUEST", message: INVITE_UNAVAILABLE };
  }
  if (input.listed) return { action: "resend" };
  if (input.teamSize >= MAX_TEAM_SIZE) {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        "Your team already has four people, counting anyone added who has not claimed yet.",
    };
  }
  return { action: "add" };
}

export function refuse(decision: Refusal): never {
  throw new TRPCError({ code: decision.code, message: decision.message });
}

export async function isCheckedIn(
  db: JudgingDb,
  hackathonId: string,
  userId: string,
): Promise<boolean> {
  const [participant] = await db
    .select({ status: hackathonParticipants.registrationStatus })
    .from(hackathonParticipants)
    .where(
      and(
        eq(hackathonParticipants.hackathonId, hackathonId),
        eq(hackathonParticipants.userId, userId),
      ),
    )
    .limit(1);
  return participant?.status === "checked_in";
}

/** Judging is for hackers in the building, the same bar as submitting. */
export async function requireCheckedIn(
  db: JudgingDb,
  hackathonId: string,
  userId: string,
): Promise<void> {
  if (await isCheckedIn(db, hackathonId, userId)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "Check in at the event first. Find a volunteer and have your badge scanned, then come back to this page.",
  });
}

/**
 * Takes the edition's config row lock. Every claim and invite write takes it
 * first, so they run one at a time per edition and cannot interleave with an
 * organiser replacing the project list underneath them. The edition must
 * exist: call assertHackathonExists before this.
 */
export async function lockJudgingConfig(
  tx: JudgingTx,
  hackathonId: string,
): Promise<JudgingConfig> {
  await ensureJudgingConfig(tx, hackathonId);
  const [config] = await tx
    .select()
    .from(judgingConfigs)
    .where(eq(judgingConfigs.hackathonId, hackathonId))
    .for("update");
  return config!;
}

/** The config as it stands, without creating one: hacker reads never write. */
export async function readJudgingConfig(db: JudgingDb, hackathonId: string) {
  const [config] = await db
    .select({
      itineraryPublished: judgingConfigs.itineraryPublished,
      emergencyMode: judgingConfigs.emergencyMode,
      claimsStartedAt: judgingConfigs.claimsStartedAt,
    })
    .from(judgingConfigs)
    .where(eq(judgingConfigs.hackathonId, hackathonId))
    .limit(1);
  return (
    config ?? {
      itineraryPublished: false,
      emergencyMode: false,
      claimsStartedAt: null,
    }
  );
}

/**
 * The place a user holds in an edition, with its project. A project an
 * organiser pulled still holds the row (the unique index counts it), so the
 * caller decides what a pulled project means.
 */
export async function heldPlace(
  db: JudgingDb,
  hackathonId: string,
  userId: string,
) {
  const [held] = await db
    .select({
      memberId: judgingEntryMembers.id,
      entryId: judgingEntries.id,
      title: judgingEntries.title,
      participantCount: judgingEntries.participantCount,
      deletedAt: judgingEntries.deletedAt,
    })
    .from(judgingEntryMembers)
    .innerJoin(
      judgingEntries,
      eq(judgingEntries.id, judgingEntryMembers.entryId),
    )
    .where(
      and(
        eq(judgingEntryMembers.hackathonId, hackathonId),
        eq(judgingEntryMembers.userId, userId),
      ),
    )
    .limit(1);
  return held ?? null;
}

/**
 * A project's team list in display order. Carries emails: never send it to
 * hackers as is.
 */
export async function loadRoster(db: JudgingDb, entryId: string) {
  return db
    .select({
      id: judgingEntryMembers.id,
      name: judgingEntryMembers.name,
      email: judgingEntryMembers.email,
      userId: judgingEntryMembers.userId,
      invitedById: judgingEntryMembers.invitedById,
      displayOrder: judgingEntryMembers.displayOrder,
    })
    .from(judgingEntryMembers)
    .where(eq(judgingEntryMembers.entryId, entryId))
    .orderBy(
      asc(judgingEntryMembers.displayOrder),
      asc(judgingEntryMembers.createdAt),
    );
}

export async function rosterSize(db: JudgingDb, entryId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(judgingEntryMembers)
    .where(eq(judgingEntryMembers.entryId, entryId));
  return row?.n ?? 0;
}

/**
 * Gives `userId` the place `memberId` on its team, inside the caller's
 * transaction (which must already hold lockJudgingConfig). Consumes any live
 * claim link for the place, marks claims as started and locks the project
 * inventory: from here on a Devpost import may only add.
 */
export async function claimPlace(
  tx: JudgingTx,
  input: { hackathonId: string; memberId: string; userId: string; now: Date },
): Promise<{ entryId: string; title: string }> {
  const { hackathonId, memberId, userId, now } = input;

  const [place] = await tx
    .select({
      id: judgingEntryMembers.id,
      userId: judgingEntryMembers.userId,
      entryId: judgingEntries.id,
      title: judgingEntries.title,
      participantCount: judgingEntries.participantCount,
      deletedAt: judgingEntries.deletedAt,
    })
    .from(judgingEntryMembers)
    .innerJoin(
      judgingEntries,
      eq(judgingEntries.id, judgingEntryMembers.entryId),
    )
    .where(
      and(
        eq(judgingEntryMembers.id, memberId),
        eq(judgingEntryMembers.hackathonId, hackathonId),
      ),
    )
    .for("update", { of: judgingEntryMembers });

  const held = await heldPlace(tx, hackathonId, userId);
  const heldOther = held && held.memberId !== memberId ? held : null;

  const decision = decideClaim(
    place
      ? {
          userId: place.userId,
          entryDeleted: !!place.deletedAt,
          teamSize: teamSize(
            place.participantCount,
            await rosterSize(tx, place.entryId),
          ),
        }
      : null,
    userId,
    heldOther && !heldOther.deletedAt ? heldOther.title : null,
  );
  if (!decision.ok) refuse(decision);
  const claimed = place!;
  if (decision.alreadyYours) {
    return { entryId: claimed.entryId, title: claimed.title };
  }

  // A place on a project an organiser pulled would otherwise pin the hacker
  // to it for the rest of the event: one place per person per edition.
  if (heldOther?.deletedAt) {
    await tx
      .update(judgingEntryMembers)
      .set({ userId: null, claimedAt: null })
      .where(eq(judgingEntryMembers.id, heldOther.memberId));
  }

  try {
    await tx
      .update(judgingEntryMembers)
      .set({ userId, claimedAt: now })
      .where(eq(judgingEntryMembers.id, claimed.id));
  } catch (error) {
    // Promoting portal submissions links users without taking the config
    // lock, so the unique index is the last word on one place per person.
    if (isUniqueViolation(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "You are already on a project for this event. Refresh the page to see it.",
      });
    }
    throw error;
  }

  // Claimed by email or by someone else's forwarded link, the place's own link
  // must stop working either way.
  await tx
    .update(judgingClaimLinks)
    .set({ token: null, consumedAt: now, consumedById: userId })
    .where(
      and(
        eq(judgingClaimLinks.memberId, claimed.id),
        isNull(judgingClaimLinks.consumedAt),
      ),
    );

  await markClaimsStarted(tx, hackathonId, now);
  await lockInventory(tx, hackathonId, userId);

  return { entryId: claimed.entryId, title: claimed.title };
}

/** First claim or first claim email, whichever comes first; later calls keep it. */
export async function markClaimsStarted(
  tx: JudgingTx,
  hackathonId: string,
  now: Date,
): Promise<void> {
  await tx
    .update(judgingConfigs)
    .set({ claimsStartedAt: now, updatedAt: now })
    .where(
      and(
        eq(judgingConfigs.hackathonId, hackathonId),
        isNull(judgingConfigs.claimsStartedAt),
      ),
    );
}

/**
 * Locks an unclaimed place for a claim link to be issued or sent. Refuses a
 * place that is taken, on a pulled project, or on a team too big to claim.
 */
export async function lockPlaceForLink(
  tx: JudgingTx,
  hackathonId: string,
  memberId: string,
) {
  const [place] = await tx
    .select({
      id: judgingEntryMembers.id,
      name: judgingEntryMembers.name,
      email: judgingEntryMembers.email,
      userId: judgingEntryMembers.userId,
      entryId: judgingEntries.id,
      title: judgingEntries.title,
      participantCount: judgingEntries.participantCount,
      deletedAt: judgingEntries.deletedAt,
    })
    .from(judgingEntryMembers)
    .innerJoin(
      judgingEntries,
      eq(judgingEntries.id, judgingEntryMembers.entryId),
    )
    .where(
      and(
        eq(judgingEntryMembers.id, memberId),
        eq(judgingEntryMembers.hackathonId, hackathonId),
      ),
    )
    .for("update", { of: judgingEntryMembers });

  if (!place || place.deletedAt) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That team member is not on a project in judging any more.",
    });
  }
  if (place.userId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `${place.name} has already claimed their place, so there is no link to send.`,
    });
  }
  const size = teamSize(
    place.participantCount,
    await rosterSize(tx, place.entryId),
  );
  if (size > MAX_TEAM_SIZE) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${place.title} lists ${size} people. Cut the team to four before sending claim links.`,
    });
  }
  return place;
}

/**
 * The place's live claim token, issued if it has none. A link that was used
 * while the place is still unclaimed (its claimer's account was deleted) is
 * replaced with a fresh token. The expiry follows the event's current end.
 * Call with the place locked (lockPlaceForLink).
 */
export async function issueClaimToken(
  tx: JudgingTx,
  input: { hackathonId: string; memberId: string; expiresAt: Date },
): Promise<string> {
  const { hackathonId, memberId, expiresAt } = input;

  await tx
    .insert(judgingClaimLinks)
    .values({ memberId, hackathonId, token: newClaimToken(), expiresAt })
    .onConflictDoNothing({ target: judgingClaimLinks.memberId });

  const [link] = await tx
    .select()
    .from(judgingClaimLinks)
    .where(eq(judgingClaimLinks.memberId, memberId))
    .for("update");

  if (link?.token && !link.consumedAt) {
    if (link.expiresAt.getTime() !== expiresAt.getTime()) {
      await tx
        .update(judgingClaimLinks)
        .set({ expiresAt })
        .where(eq(judgingClaimLinks.id, link.id));
    }
    return link.token;
  }

  const token = newClaimToken();
  await tx
    .update(judgingClaimLinks)
    .set({
      token,
      expiresAt,
      consumedAt: null,
      consumedById: null,
      sentAt: null,
    })
    .where(eq(judgingClaimLinks.memberId, memberId));
  return token;
}
