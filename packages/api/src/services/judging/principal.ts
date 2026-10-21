import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  admins,
  judges,
  judgingGuestSessions,
  judgingJudges,
  judgingPresence,
  judgingRoomLinks,
  judgingRooms,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import { isExpiredAdmin, isStaffRole } from "../../types/portal-context";
import { assertHackathonExists } from "./config";
import type { JudgingDb, JudgingTx } from "./config";
import {
  GUEST_SESSION_SECONDS,
  JUDGING_GUEST_COOKIE,
  hashGuestToken,
  newGuestToken,
  verifyRoomLink,
} from "./room-link";

// Who is sitting at the judge desk. Two kinds of judge:
//
//   member  a signed-in portal user with an approved judge row for the
//           edition, or any active staff admin. Their judging_judge row is
//           created the first time they reach the desk.
//   guest   someone who scanned a room's QR code without such an account.
//           The scan starts a guest session (cookie = raw token, database =
//           its sha256); typing a name creates their judging_judge row and
//           seats them in that room. A guest judges only the room's
//           challenge and what sits below it, and the session ends when the
//           link is revoked, the room archived, or eight hours pass. Scanning
//           another room's code from the same browser moves them to a new
//           session for the same judge row.

export { JUDGING_GUEST_COOKIE };

export const GUEST_SESSION_ENDED =
  "Your guest judging session has ended. Scan the QR code at your room or table again to keep judging.";

export type MemberJudge = {
  kind: "member";
  hackathonId: string;
  userId: string;
  judgeId: string;
  displayName: string;
};

export type GuestJudge = {
  kind: "guest";
  hackathonId: string;
  sessionId: string;
  linkId: string;
  roomId: string;
  /** The challenge the guest's room serves. */
  roomChallengeId: string;
  /** Null until the guest has given a name. */
  judgeId: string | null;
  displayName: string | null;
};

export type DeskPrincipal = MemberJudge | GuestJudge;

/** A principal who can judge: any member, or a guest who has given a name. */
export type Judge =
  MemberJudge | (GuestJudge & { judgeId: string; displayName: string });

export function asJudge(principal: DeskPrincipal): Judge | null {
  if (principal.kind === "member") return principal;
  if (!principal.judgeId || !principal.displayName) return null;
  return {
    ...principal,
    judgeId: principal.judgeId,
    displayName: principal.displayName,
  };
}

/** One cookie's value from a Cookie header, or null. */
export function readCookie(
  header: string | null | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const split = part.indexOf("=");
    if (split === -1 || part.slice(0, split).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(split + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * How long after a guest session ends a scan of another room's code still
 * recognises the judge who held it.
 */
export const GUEST_CARRY_OVER_SECONDS = 4 * 3600;

/**
 * Options for the guest session cookie, set by the room-link route handler.
 * Lax so the cookie rides along when the QR code opens the desk from a camera
 * app; httpOnly because the desk never reads it, only the API does. It
 * outlives the session by GUEST_CARRY_OVER_SECONDS: a lapsed session opens
 * nothing, but scanning a code again in that time keeps the same judge.
 */
export function guestCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: GUEST_SESSION_SECONDS + GUEST_CARRY_OVER_SECONDS,
  };
}

/**
 * The member judge `userId` is for this edition, or null when they are
 * neither an approved judge nor staff. Creates their judging_judge row on
 * first use.
 */
export async function resolveMemberJudge(
  db: JudgingDb,
  input: { userId: string; hackathonId: string; userName?: string | null },
): Promise<MemberJudge | null> {
  const [rostered] = await db
    .select({ name: judges.name })
    .from(judges)
    .where(
      and(
        eq(judges.userId, input.userId),
        eq(judges.hackathonId, input.hackathonId),
        eq(judges.isActive, true),
      ),
    )
    .limit(1);

  if (!rostered) {
    const [admin] = await db
      .select({ role: admins.role, expiresAt: admins.expiresAt })
      .from(admins)
      .where(and(eq(admins.userId, input.userId), eq(admins.isActive, true)))
      .limit(1);
    if (!admin || !isStaffRole(admin.role) || isExpiredAdmin(admin)) {
      return null;
    }
  }

  const memberRow = and(
    eq(judgingJudges.hackathonId, input.hackathonId),
    eq(judgingJudges.userId, input.userId),
    eq(judgingJudges.kind, "member"),
  );
  const [existing] = await db
    .select({ id: judgingJudges.id, displayName: judgingJudges.displayName })
    .from(judgingJudges)
    .where(memberRow)
    .limit(1);

  let judge = existing;
  if (!judge) {
    // Staff reach this with an edition id from the URL; a roster row already
    // proves the edition exists. A missing one would otherwise fail the
    // foreign key as a 500.
    if (!rostered) await assertHackathonExists(db, input.hackathonId);
    const displayName =
      rostered?.name?.trim() || input.userName?.trim() || "Judge";
    [judge] = await db
      .insert(judgingJudges)
      .values({
        hackathonId: input.hackathonId,
        kind: "member",
        userId: input.userId,
        displayName,
      })
      .onConflictDoNothing({
        target: [judgingJudges.hackathonId, judgingJudges.userId],
        where: sql`${judgingJudges.kind} = 'member'`,
      })
      .returning({
        id: judgingJudges.id,
        displayName: judgingJudges.displayName,
      });
    // A parallel first request created it between the read and the insert.
    if (!judge) {
      [judge] = await db
        .select({
          id: judgingJudges.id,
          displayName: judgingJudges.displayName,
        })
        .from(judgingJudges)
        .where(memberRow)
        .limit(1);
    }
  }
  if (!judge) {
    throw new Error("A member judge row was neither found nor created.");
  }

  return {
    kind: "member",
    hackathonId: input.hackathonId,
    userId: input.userId,
    judgeId: judge.id,
    displayName: judge.displayName,
  };
}

/** The live guest session a raw cookie token belongs to, or null. */
export async function resolveGuestSession(
  db: JudgingDb,
  token: string,
  now = new Date(),
): Promise<GuestJudge | null> {
  const [row] = await db
    .select({
      sessionId: judgingGuestSessions.id,
      hackathonId: judgingGuestSessions.hackathonId,
      linkId: judgingGuestSessions.linkId,
      roomId: judgingGuestSessions.roomId,
      roomChallengeId: judgingRooms.challengeId,
      judgeId: judgingJudges.id,
      displayName: judgingJudges.displayName,
    })
    .from(judgingGuestSessions)
    .innerJoin(
      judgingRoomLinks,
      eq(judgingRoomLinks.id, judgingGuestSessions.linkId),
    )
    .innerJoin(judgingRooms, eq(judgingRooms.id, judgingGuestSessions.roomId))
    .leftJoin(judgingJudges, eq(judgingJudges.id, judgingGuestSessions.judgeId))
    .where(
      and(
        eq(judgingGuestSessions.tokenHash, hashGuestToken(token)),
        isNull(judgingGuestSessions.revokedAt),
        gt(judgingGuestSessions.expiresAt, now),
        isNull(judgingRoomLinks.revokedAt),
        isNull(judgingRooms.archivedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  return { kind: "guest", ...row };
}

/**
 * The desk principal for a request: the signed-in member judge if there is
 * one, otherwise the guest the cookie belongs to, as long as the guest's room
 * is in this edition. Null when neither applies.
 */
export async function resolveDeskPrincipal(
  db: JudgingDb,
  input: {
    hackathonId: string;
    userId?: string | null;
    userName?: string | null;
    cookieHeader?: string | null;
  },
): Promise<DeskPrincipal | null> {
  if (input.userId) {
    const member = await resolveMemberJudge(db, {
      userId: input.userId,
      hackathonId: input.hackathonId,
      userName: input.userName,
    });
    if (member) return member;
  }

  const token = readCookie(input.cookieHeader, JUDGING_GUEST_COOKIE);
  if (!token) return null;
  const guest = await resolveGuestSession(db, token);
  return guest?.hackathonId === input.hackathonId ? guest : null;
}

/**
 * Seats a judge in a room: closes whatever room they were in and opens a
 * presence in this one. Sitting down where they already are only refreshes
 * the heartbeat. Run inside a transaction.
 */
export async function seatJudge(
  tx: JudgingTx,
  input: { judgeId: string; roomId: string; hackathonId: string },
  now = new Date(),
) {
  // One open presence per judge. Locking the judge row first makes two
  // seatings at once take turns instead of tripping the unique index.
  await tx
    .select({ id: judgingJudges.id })
    .from(judgingJudges)
    .where(eq(judgingJudges.id, input.judgeId))
    .for("update");

  const [open] = await tx
    .select({ id: judgingPresence.id, roomId: judgingPresence.roomId })
    .from(judgingPresence)
    .where(
      and(
        eq(judgingPresence.judgeId, input.judgeId),
        isNull(judgingPresence.leftAt),
      ),
    )
    .limit(1);

  if (open?.roomId === input.roomId) {
    await tx
      .update(judgingPresence)
      .set({ lastSeenAt: now })
      .where(eq(judgingPresence.id, open.id));
    return;
  }

  if (open) {
    await tx
      .update(judgingPresence)
      .set({ leftAt: now })
      .where(eq(judgingPresence.id, open.id));
  }

  await tx.insert(judgingPresence).values({
    judgeId: input.judgeId,
    roomId: input.roomId,
    hackathonId: input.hackathonId,
    joinedAt: now,
    lastSeenAt: now,
  });
}

/**
 * Gives a guest a name: creates their judge row and seats them in the room
 * their link opened. A second call (a double tap, two tabs) returns the judge
 * the first one created.
 */
export async function nameGuest(
  db: DrizzleDB,
  guest: GuestJudge,
  displayName: string,
): Promise<{ judgeId: string; displayName: string }> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [session] = await tx
      .select({
        judgeId: judgingGuestSessions.judgeId,
        roomId: judgingGuestSessions.roomId,
      })
      .from(judgingGuestSessions)
      .where(
        and(
          eq(judgingGuestSessions.id, guest.sessionId),
          isNull(judgingGuestSessions.revokedAt),
          gt(judgingGuestSessions.expiresAt, now),
        ),
      )
      .for("update")
      .limit(1);
    if (!session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: GUEST_SESSION_ENDED,
      });
    }

    if (session.judgeId) {
      const [named] = await tx
        .select({
          id: judgingJudges.id,
          displayName: judgingJudges.displayName,
        })
        .from(judgingJudges)
        .where(eq(judgingJudges.id, session.judgeId))
        .limit(1);
      if (named) return { judgeId: named.id, displayName: named.displayName };
    }

    const [judge] = await tx
      .insert(judgingJudges)
      .values({ hackathonId: guest.hackathonId, kind: "guest", displayName })
      .returning({
        id: judgingJudges.id,
        displayName: judgingJudges.displayName,
      });

    await tx
      .update(judgingGuestSessions)
      .set({ judgeId: judge.id, completedAt: now })
      .where(eq(judgingGuestSessions.id, guest.sessionId));

    await seatJudge(
      tx,
      {
        judgeId: judge.id,
        roomId: session.roomId,
        hackathonId: guest.hackathonId,
      },
      now,
    );

    return { judgeId: judge.id, displayName: judge.displayName };
  });
}

export type RoomLinkActivation =
  /** Bad signature, revoked link or archived room. */
  | { kind: "invalid" }
  /** A member judge, now seated in the room. */
  | { kind: "member"; hackathonId: string; roomId: string }
  /**
   * A guest. `token` is the cookie to set, or null when the browser already
   * holds a live session for this link and keeps it.
   */
  | {
      kind: "guest";
      hackathonId: string;
      roomId: string;
      token: string | null;
      expiresAt: Date | null;
    };

/**
 * The judge a guest browser already is in this edition: the named session its
 * cookie holds, live or lapsed within GUEST_CARRY_OVER_SECONDS. Null for an
 * unnamed session, another edition's session, one an organiser revoked, or one
 * that lapsed longer ago.
 */
async function carriedGuest(
  db: JudgingDb,
  token: string,
  hackathonId: string,
  now: Date,
): Promise<{ sessionId: string; judgeId: string } | null> {
  const [row] = await db
    .select({
      sessionId: judgingGuestSessions.id,
      hackathonId: judgingGuestSessions.hackathonId,
      judgeId: judgingGuestSessions.judgeId,
      expiresAt: judgingGuestSessions.expiresAt,
      revokedAt: judgingGuestSessions.revokedAt,
    })
    .from(judgingGuestSessions)
    .where(eq(judgingGuestSessions.tokenHash, hashGuestToken(token)))
    .limit(1);
  if (!row?.judgeId || row.revokedAt || row.hackathonId !== hackathonId) {
    return null;
  }
  const lapsedMs = now.getTime() - row.expiresAt.getTime();
  return lapsedMs <= GUEST_CARRY_OVER_SECONDS * 1000
    ? { sessionId: row.sessionId, judgeId: row.judgeId }
    : null;
}

/**
 * What scanning a room's QR code does, for the /judge/activate route
 * handler. A signed-in member judge is seated in the room. Anyone else gets a
 * guest session, unless their browser already has a live one from this same
 * link: scanning twice must not turn a named guest into a new, nameless one.
 * A named guest scanning a different room's code keeps their judge row.
 */
export async function activateRoomLink(
  db: DrizzleDB,
  input: {
    linkId: string;
    sig: string;
    userId?: string | null;
    userName?: string | null;
    /** The guest cookie the browser sent, if any. */
    guestToken?: string | null;
  },
): Promise<RoomLinkActivation> {
  if (!verifyRoomLink(input.linkId, input.sig)) return { kind: "invalid" };

  const now = new Date();
  const [link] = await db
    .select({
      hackathonId: judgingRoomLinks.hackathonId,
      roomId: judgingRoomLinks.roomId,
    })
    .from(judgingRoomLinks)
    .innerJoin(judgingRooms, eq(judgingRooms.id, judgingRoomLinks.roomId))
    .where(
      and(
        eq(judgingRoomLinks.id, input.linkId),
        isNull(judgingRoomLinks.revokedAt),
        isNull(judgingRooms.archivedAt),
      ),
    )
    .limit(1);
  if (!link) return { kind: "invalid" };

  if (input.userId) {
    const member = await resolveMemberJudge(db, {
      userId: input.userId,
      hackathonId: link.hackathonId,
      userName: input.userName,
    });
    if (member) {
      await db.transaction((tx) =>
        seatJudge(
          tx,
          {
            judgeId: member.judgeId,
            roomId: link.roomId,
            hackathonId: link.hackathonId,
          },
          now,
        ),
      );
      return {
        kind: "member",
        hackathonId: link.hackathonId,
        roomId: link.roomId,
      };
    }
  }

  if (input.guestToken) {
    const current = await resolveGuestSession(db, input.guestToken, now);
    if (current?.linkId === input.linkId) {
      return {
        kind: "guest",
        hackathonId: link.hackathonId,
        roomId: link.roomId,
        token: null,
        expiresAt: null,
      };
    }
  }

  // A named guest scanning another room's code is the same judge: the new
  // session keeps their judge row, so they skip the name gate and their scores
  // stay under one name.
  const carried = input.guestToken
    ? await carriedGuest(db, input.guestToken, link.hackathonId, now)
    : null;

  const token = newGuestToken();
  const expiresAt = new Date(now.getTime() + GUEST_SESSION_SECONDS * 1000);
  await db.transaction(async (tx) => {
    await tx.insert(judgingGuestSessions).values({
      tokenHash: hashGuestToken(token),
      linkId: input.linkId,
      roomId: link.roomId,
      hackathonId: link.hackathonId,
      judgeId: carried?.judgeId ?? null,
      completedAt: carried ? now : null,
      expiresAt,
    });
    if (carried) {
      // The browser moves to the new session. The old one ends now rather
      // than counting as a guest in the room they left until it lapses.
      await tx
        .update(judgingGuestSessions)
        .set({ expiresAt: now })
        .where(
          and(
            eq(judgingGuestSessions.id, carried.sessionId),
            gt(judgingGuestSessions.expiresAt, now),
          ),
        );
      await seatJudge(
        tx,
        {
          judgeId: carried.judgeId,
          roomId: link.roomId,
          hackathonId: link.hackathonId,
        },
        now,
      );
    }
  });

  return {
    kind: "guest",
    hackathonId: link.hackathonId,
    roomId: link.roomId,
    token,
    expiresAt,
  };
}
