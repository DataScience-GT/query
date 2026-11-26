import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";
import type * as Principal from "../services/judging/principal";
import type * as RoomLink from "../services/judging/room-link";

/**
 * Real-Postgres test for who a room's QR code lets in. The code is posted on
 * the door, so anyone can scan it: a guest session must not judge until an
 * organizer lets that guest in, and it must remember the account that scanned
 * it so the desk can tell the guest is on a project's team.
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it. It inserts its own rows under a random
 * suffix and removes them afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("guest judges and organizer admission, against a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const id = (name: string) => `adm-${suffix}-${name}`;
  const userIds = ["hacker", "outsider", "organizer", "tester"].map(id);

  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let principal: typeof Principal;
  let links: typeof RoomLink;
  let appRouter: any;
  let cache: any;
  let hackathonId: string;
  let challengeId: string;
  let roomA: string;
  let roomB: string;
  let linkA: string;
  let linkB: string;
  let ownEntry: string;
  let otherEntry: string;
  const previousSecret = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.AUTH_SECRET = "admission-test-secret";
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    principal = await import("../services/judging/principal");
    links = await import("../services/judging/room-link");
    ({ appRouter } = await import("../root"));
    ({ cache } = await import("../middleware/cache"));
    const db = S.db!;

    await db
      .insert(S.users)
      .values(userIds.map((userId) => ({ id: userId, email: `${userId}@example.test`, name: userId })));
    await db.insert(S.admins).values([
      { userId: id("organizer"), role: "admin" },
      { userId: id("tester"), role: "bug_tester" },
    ]);
    const [hackathon] = await db
      .insert(S.hackathons)
      .values({
        name: `admission ${suffix}`,
        startDate: new Date(Date.now() + 86_400_000),
        endDate: new Date(Date.now() + 2 * 86_400_000),
        status: "open" as const,
        maxParticipants: 10,
      })
      .returning({ id: S.hackathons.id });
    hackathonId = hackathon!.id;
    const [challenge] = await db
      .insert(S.judgingChallenges)
      .values({ hackathonId, label: "General", isGeneral: true, mode: "unscheduled" })
      .returning({ id: S.judgingChallenges.id });
    challengeId = challenge!.id;
    const rooms = await db
      .insert(S.judgingRooms)
      .values([
        { hackathonId, challengeId, name: "Room A" },
        { hackathonId, challengeId, name: "Room B" },
      ])
      .returning({ id: S.judgingRooms.id });
    [roomA, roomB] = rooms.map((room) => room.id) as [string, string];
    const door = await db
      .insert(S.judgingRoomLinks)
      .values([
        { hackathonId, roomId: roomA },
        { hackathonId, roomId: roomB },
      ])
      .returning({ id: S.judgingRoomLinks.id, roomId: S.judgingRoomLinks.roomId });
    linkA = door.find((link) => link.roomId === roomA)!.id;
    linkB = door.find((link) => link.roomId === roomB)!.id;

    // Judging is open, with the hacker's own project and another to judge.
    await db.insert(S.judgingConfigs).values({ hackathonId, state: "open" });
    const entries = await db
      .insert(S.judgingEntries)
      .values(
        ["Own project", "Other project"].map((title) => ({
          hackathonId,
          source: "devpost" as const,
          title,
          demoLinks: [],
          technologies: [],
          universities: [],
          prizeCategories: [],
        })),
      )
      .returning({ id: S.judgingEntries.id, title: S.judgingEntries.title });
    ownEntry = entries.find((e) => e.title === "Own project")!.id;
    otherEntry = entries.find((e) => e.title === "Other project")!.id;
    await db.insert(S.judgingEntryChallenges).values(
      entries.map((e) => ({ entryId: e.id, challengeId, hackathonId })),
    );
    await db.insert(S.judgingEntryMembers).values({
      entryId: ownEntry,
      hackathonId,
      name: "Hana",
      email: `${id("hacker")}@example.test`,
      userId: id("hacker"),
    });
  }, 60_000);

  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
    const db = S?.db;
    if (!db) return;
    if (hackathonId) {
      await db.delete(S.hackathons).where(ops.eq(S.hackathons.id, hackathonId));
    }
    await db.delete(S.admins).where(ops.inArray(S.admins.userId, userIds));
    await db.delete(S.users).where(ops.inArray(S.users.id, userIds));
  }, 60_000);

  const scan = (
    linkId: string,
    over: { userId?: string; guestToken?: string | null } = {},
  ) =>
    principal.activateRoomLink(S.db!, {
      linkId,
      sig: links.signRoomLink(linkId),
      userId: over.userId ?? null,
      guestToken: over.guestToken ?? null,
    });

  /**
   * A database whose next transaction starts after `before` has run, as if
   * another request had committed between this one's reads and its writes.
   */
  const interleaved = (before: () => Promise<void>) =>
    new Proxy(S.db!, {
      get(target, prop) {
        if (prop === "transaction") {
          return async (...args: unknown[]) => {
            await before();
            return Reflect.apply(target.transaction, target, args);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  const ctx = (opts: { userId?: string; token?: string | null } = {}) => ({
    db: S.db!,
    session: opts.userId ? { user: { id: opts.userId, name: opts.userId } } : null,
    userId: opts.userId,
    cache,
    clientIp: "127.0.0.1",
    req: {
      url: "http://localhost:3000/api/trpc",
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "cookie" && opts.token
            ? `${principal.JUDGING_GUEST_COOKIE}=${opts.token}`
            : null,
      },
    },
  });
  const desk = (opts: { userId?: string; token?: string | null } = {}) =>
    appRouter.createCaller(ctx(opts)).judging.desk;
  const admin = (userId: string) =>
    appRouter.createCaller(ctx({ userId })).judging.admin;

  /** Scans a code and gives the guest a name, as a person at the door would. */
  async function arrive(
    linkId: string,
    name: string,
    over: { userId?: string; guestToken?: string | null } = {},
  ) {
    const scanned = await scan(linkId, over);
    if (scanned.kind !== "guest" || !scanned.token) throw new Error("no session");
    await desk({ token: scanned.token, userId: over.userId }).setGuestName({
      hackathonId,
      displayName: name,
    });
    return scanned.token;
  }
  const sessionOf = async (token: string) => {
    const [row] = await S.db!
      .select()
      .from(S.judgingGuestSessions)
      .where(ops.eq(S.judgingGuestSessions.tokenHash, links.hashGuestToken(token)));
    return row!;
  };

  it("remembers the signed-in account that scanned the code", async () => {
    const token = await arrive(linkA, "Hana", { userId: id("hacker") });
    expect(await sessionOf(token)).toMatchObject({
      userId: id("hacker"),
      admittedAt: null,
    });
  });

  it("starts a signed-out guest with no account and no admission", async () => {
    const token = await arrive(linkA, "Sol");
    expect(await sessionOf(token)).toMatchObject({ userId: null, admittedAt: null });
  });

  it("tells the guest they are waiting, and gives them nothing to judge", async () => {
    const token = await arrive(linkA, "Wren");

    await expect(desk({ token }).context({ hackathonId })).resolves.toMatchObject({
      kind: "guest",
      needsName: false,
      admitted: false,
    });
    const waiting = {
      code: "FORBIDDEN",
      message: expect.stringMatching(/Waiting for an organizer to let you in/),
    };
    await expect(
      desk({ token }).projects({ hackathonId, inMyRoomOnly: false, hideJudged: false }),
    ).rejects.toMatchObject(waiting);
    await expect(desk({ token }).nextProject({ hackathonId })).rejects.toMatchObject(waiting);
    await expect(desk({ token }).heartbeat({ hackathonId })).rejects.toMatchObject(waiting);
  });

  const draftsOf = (entryId: string) =>
    S.db!
      .select({ id: S.judgingEvaluationDrafts.id })
      .from(S.judgingEvaluationDrafts)
      .where(ops.eq(S.judgingEvaluationDrafts.entryId, entryId));

  it("keeps an unadmitted guest from locking a project", async () => {
    const token = await arrive(linkA, "Quinn");

    await expect(
      desk({ token }).startGrading({ hackathonId, entryId: otherEntry, challengeId }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/Waiting for an organizer to let you in/),
    });
    await expect(
      desk({ token }).submit({
        hackathonId,
        entryId: otherEntry,
        challengeId,
        ratings: {},
        responses: {},
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await draftsOf(otherEntry)).toEqual([]);
  });

  it("lets an admitted guest open a project they are not on", async () => {
    const token = await arrive(linkA, "Rhea", { userId: id("outsider") });
    await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(token)).id });

    await expect(
      desk({ token, userId: id("outsider") }).startGrading({
        hackathonId,
        entryId: otherEntry,
        challengeId,
      }),
    ).resolves.toMatchObject({ held: true });
  });

  it("refuses an admitted guest their own team's project, as the account that scanned", async () => {
    const token = await arrive(linkA, "Hana", { userId: id("hacker") });
    await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(token)).id });

    // Signed out in this browser now; the session remembers who scanned.
    await expect(
      desk({ token }).startGrading({ hackathonId, entryId: ownEntry, challengeId }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/on this project's team/),
    });
    expect(await draftsOf(ownEntry)).toEqual([]);
  });

  it("refuses an admitted guest their own team's project, as the account signed in now", async () => {
    // Scanned signed out, so the session knows nobody, then signed in.
    const token = await arrive(linkA, "Hana B");
    await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(token)).id });

    await expect(
      desk({ token, userId: id("hacker") }).startGrading({
        hackathonId,
        entryId: ownEntry,
        challengeId,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/on this project's team/),
    });
    expect(await draftsOf(ownEntry)).toEqual([]);
  });

  it("lets an organizer admit them, and the guest sees it at once", async () => {
    const token = await arrive(linkA, "Remy");
    const session = await sessionOf(token);

    await admin(id("organizer")).admitGuest({ sessionId: session.id });

    expect(await sessionOf(token)).toMatchObject({ admittedById: id("organizer") });
    expect((await sessionOf(token)).admittedAt).toBeInstanceOf(Date);
    await expect(desk({ token }).context({ hackathonId })).resolves.toMatchObject({
      admitted: true,
    });
    await expect(
      desk({ token }).projects({ hackathonId, inMyRoomOnly: false, hideJudged: false }),
    ).resolves.toBeDefined();
  });

  it("lists who is waiting, by name and the account they scanned with", async () => {
    const token = await arrive(linkA, "Tamsin", { userId: id("hacker") });
    const session = await sessionOf(token);

    const { guestsWaiting } = await admin(id("organizer")).listRooms({ hackathonId });
    const waiting = guestsWaiting.find((g: any) => g.sessionId === session.id);
    expect(waiting).toMatchObject({
      name: "Tamsin",
      roomName: "Room A",
      account: expect.stringContaining(id("hacker")),
    });

    await admin(id("organizer")).admitGuest({ sessionId: session.id });
    const after = await admin(id("organizer")).listRooms({ hackathonId });
    expect(after.guestsWaiting.some((g: any) => g.sessionId === session.id)).toBe(false);
  });

  it("does not list a guest who has not given a name yet", async () => {
    const scanned = await scan(linkA);
    if (scanned.kind !== "guest" || !scanned.token) throw new Error("no session");
    const session = await sessionOf(scanned.token);

    const { guestsWaiting } = await admin(id("organizer")).listRooms({ hackathonId });
    expect(guestsWaiting.some((g: any) => g.sessionId === session.id)).toBe(false);
  });

  it("refuses admission to anyone who is not staff, and to a bug tester", async () => {
    const token = await arrive(linkA, "Ula");
    const session = await sessionOf(token);

    await expect(
      appRouter
        .createCaller(ctx({ userId: id("outsider") }))
        .judging.admin.admitGuest({ sessionId: session.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      admin(id("tester")).admitGuest({ sessionId: session.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await sessionOf(token)).admittedAt).toBeNull();
  });

  it("will not admit a session that was signed out", async () => {
    const token = await arrive(linkA, "Vale");
    const session = await sessionOf(token);
    await S.db!
      .update(S.judgingGuestSessions)
      .set({ revokedAt: new Date() })
      .where(ops.eq(S.judgingGuestSessions.id, session.id));

    await expect(
      admin(id("organizer")).admitGuest({ sessionId: session.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("carries admission and the scanning account to the next room's session", async () => {
    const first = await arrive(linkA, "Wilder", { userId: id("hacker") });
    await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(first)).id });

    // Same browser, another door, signed out this time.
    const next = await scan(linkB, { guestToken: first });
    if (next.kind !== "guest" || !next.token) throw new Error("no session");

    expect(await sessionOf(next.token)).toMatchObject({
      roomId: roomB,
      userId: id("hacker"),
    });
    expect((await sessionOf(next.token)).admittedAt).toBeInstanceOf(Date);
    await expect(desk({ token: next.token }).context({ hackathonId })).resolves.toMatchObject({
      admitted: true,
    });
  });

  it("asks for admission again when the browser signs in as someone else", async () => {
    const first = await arrive(linkA, "Wynn", { userId: id("hacker") });
    await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(first)).id });

    const next = await scan(linkB, { guestToken: first, userId: id("outsider") });
    if (next.kind !== "guest" || !next.token) throw new Error("no session");

    expect(await sessionOf(next.token)).toMatchObject({
      userId: id("outsider"),
      admittedAt: null,
    });
  });

  it("does not admit the next room's session when the first was never admitted", async () => {
    const first = await arrive(linkA, "Xan");
    const next = await scan(linkB, { guestToken: first });
    if (next.kind !== "guest" || !next.token) throw new Error("no session");

    expect((await sessionOf(next.token)).admittedAt).toBeNull();
  });

  describe("who counts as in a room", () => {
    /** Rooms the board would call staffed: a judge with an open seat in them. */
    const seatsOf = async (token: string) => {
      const session = await sessionOf(token);
      if (!session.judgeId) return [];
      return S.db!
        .select({ roomId: S.judgingPresence.roomId })
        .from(S.judgingPresence)
        .where(
          ops.and(
            ops.eq(S.judgingPresence.judgeId, session.judgeId),
            ops.isNull(S.judgingPresence.leftAt),
          ),
        );
    };
    const seatedIn = async (roomName: string) => {
      const { rooms } = await admin(id("organizer")).listRooms({ hackathonId });
      return rooms.find((room: any) => room.name === roomName).judgesSeated;
    };

    it("does not seat a guest who has a name but has not been let in", async () => {
      const before = await seatedIn("Room A");
      const token = await arrive(linkA, "Zed");

      expect(await seatsOf(token)).toEqual([]);
      expect(await seatedIn("Room A")).toBe(before);
    });

    it("seats them in their room when an organizer lets them in", async () => {
      const before = await seatedIn("Room A");
      const token = await arrive(linkA, "Zia");
      await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(token)).id });

      expect(await seatsOf(token)).toEqual([{ roomId: roomA }]);
      expect(await seatedIn("Room A")).toBe(before + 1);
    });

    it("seats a guest who was let in before they gave a name, once they do", async () => {
      const scanned = await scan(linkA);
      if (scanned.kind !== "guest" || !scanned.token) throw new Error("no session");
      await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(scanned.token)).id });
      expect(await seatsOf(scanned.token)).toEqual([]);

      await desk({ token: scanned.token }).setGuestName({ hackathonId, displayName: "Zoe" });

      expect(await seatsOf(scanned.token)).toEqual([{ roomId: roomA }]);
    });

    it("moves an admitted guest's seat to the next room they scan", async () => {
      const first = await arrive(linkA, "Zack");
      await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(first)).id });

      const next = await scan(linkB, { guestToken: first });
      if (next.kind !== "guest" || !next.token) throw new Error("no session");

      expect(await seatsOf(next.token)).toEqual([{ roomId: roomB }]);
    });

    it("leaves the old room and sits nowhere when they come back as someone else", async () => {
      const first = await arrive(linkA, "Zara", { userId: id("hacker") });
      await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(first)).id });
      expect(await seatsOf(first)).toEqual([{ roomId: roomA }]);

      // Signed in as someone else this time: an organizer has not seen them.
      const next = await scan(linkB, { guestToken: first, userId: id("outsider") });
      if (next.kind !== "guest" || !next.token) throw new Error("no session");

      expect(await seatsOf(next.token)).toEqual([]);
    });
  });

  describe("when an organizer revokes while a guest moves rooms", () => {
    const sessionsOn = async (linkId: string) =>
      S.db!
        .select({ id: S.judgingGuestSessions.id })
        .from(S.judgingGuestSessions)
        .where(ops.eq(S.judgingGuestSessions.linkId, linkId));

    it("starts no session in a room whose code was revoked after the scan was checked", async () => {
      const [room] = await S.db!
        .insert(S.judgingRooms)
        .values({ hackathonId, challengeId, name: `Revoked ${suffix}` })
        .returning({ id: S.judgingRooms.id });
      const [link] = await S.db!
        .insert(S.judgingRoomLinks)
        .values({ hackathonId, roomId: room!.id })
        .returning({ id: S.judgingRoomLinks.id });
      const first = await arrive(linkA, "Rio");
      await admin(id("organizer")).admitGuest({ sessionId: (await sessionOf(first)).id });

      const revokedFirst = interleaved(async () => {
        await S.db!
          .update(S.judgingRoomLinks)
          .set({ revokedAt: new Date() })
          .where(ops.eq(S.judgingRoomLinks.id, link!.id));
      });
      const result = await principal.activateRoomLink(revokedFirst, {
        linkId: link!.id,
        sig: links.signRoomLink(link!.id),
        guestToken: first,
      });

      expect(result).toEqual({ kind: "invalid" });
      expect(await sessionsOn(link!.id)).toEqual([]);
      const seats = await S.db!
        .select({ id: S.judgingPresence.id })
        .from(S.judgingPresence)
        .where(ops.eq(S.judgingPresence.roomId, room!.id));
      expect(seats).toEqual([]);
    });

    it("does not carry admission from a session that was revoked after it was read", async () => {
      const first = await arrive(linkA, "Rex");
      const firstSession = await sessionOf(first);
      await admin(id("organizer")).admitGuest({ sessionId: firstSession.id });

      const revokedFirst = interleaved(async () => {
        await S.db!
          .update(S.judgingGuestSessions)
          .set({ revokedAt: new Date() })
          .where(ops.eq(S.judgingGuestSessions.id, firstSession.id));
      });
      const next = await principal.activateRoomLink(revokedFirst, {
        linkId: linkB,
        sig: links.signRoomLink(linkB),
        guestToken: first,
      });
      if (next.kind !== "guest" || !next.token) throw new Error("no session");

      // A stranger to the organizers again: no judge, no admission, no seat.
      expect(await sessionOf(next.token)).toMatchObject({
        roomId: roomB,
        judgeId: null,
        admittedAt: null,
      });
      const seats = await S.db!
        .select({ id: S.judgingPresence.id })
        .from(S.judgingPresence)
        .where(
          ops.and(
            ops.eq(S.judgingPresence.judgeId, firstSession.judgeId!),
            ops.eq(S.judgingPresence.roomId, roomB),
          ),
        );
      expect(seats).toEqual([]);
    });
  });

  it("reports the accounts a guest has shown: the scanner's and the one signed in now", async () => {
    const token = await arrive(linkA, "Yael", { userId: id("hacker") });

    const guest = await principal.resolveDeskPrincipal(S.db!, {
      hackathonId,
      userId: id("outsider"),
      cookieHeader: `${principal.JUDGING_GUEST_COOKIE}=${token}`,
    });
    expect(guest).toMatchObject({ kind: "guest" });
    expect(guest && guest.kind === "guest" && [...guest.accountIds].sort()).toEqual(
      [id("hacker"), id("outsider")].sort(),
    );
  });
});
