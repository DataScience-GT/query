import { afterEach, describe, expect, it } from "vitest";
import {
  activateRoomLink,
  asJudge,
  guestCookieOptions,
  readCookie,
  resolveDeskPrincipal,
  resolveMemberJudge,
} from "./principal";
import type { GuestJudge } from "./principal";
import type { JudgingDb } from "./config";
import type { DrizzleDB } from "@query/db";

// Stands in for the query-builder calls the principal makes. Every select and
// insert resolves to the next result in its queue.
function fakeDb(results: { select?: unknown[][]; insert?: unknown[][] }) {
  const calls = { select: 0, insert: 0 };
  const chain = (kind: keyof typeof calls) => {
    const next = () => {
      calls[kind] += 1;
      return Promise.resolve(results[kind]?.shift() ?? []);
    };
    const builder: Record<string, unknown> = {};
    for (const method of [
      "from",
      "where",
      "innerJoin",
      "leftJoin",
      "values",
      "onConflictDoNothing",
    ]) {
      builder[method] = () => builder;
    }
    builder.limit = next;
    builder.returning = next;
    return builder;
  };
  const db = {
    select: () => chain("select"),
    insert: () => chain("insert"),
  };
  return { db: db as unknown as JudgingDb, calls };
}

const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHER_HACK = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    expect(
      readCookie(
        "a=1; query_judging_guest=tok-en_1; b=2",
        "query_judging_guest",
      ),
    ).toBe("tok-en_1");
  });

  it("is null when absent, empty or malformed", () => {
    expect(readCookie(null, "x")).toBeNull();
    expect(readCookie("", "x")).toBeNull();
    expect(readCookie("y=1", "x")).toBeNull();
    expect(readCookie("x=", "x")).toBeNull();
    expect(readCookie("x=%E0%A4%A", "x")).toBeNull();
  });

  it("does not match a cookie whose name merely contains it", () => {
    expect(readCookie("prefix_x=1; x=2", "x")).toBe("2");
  });
});

describe("guestCookieOptions", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = original;
  });

  it("is an httpOnly, lax, site-wide, eight-hour cookie", () => {
    expect(guestCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 3600,
    });
  });

  it("is Secure in production only", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    expect(guestCookieOptions().secure).toBe(true);
    (process.env as Record<string, string | undefined>).NODE_ENV =
      "development";
    expect(guestCookieOptions().secure).toBe(false);
  });
});

describe("asJudge", () => {
  const guest: GuestJudge = {
    kind: "guest",
    hackathonId: HACK,
    sessionId: "s",
    linkId: "l",
    roomId: "r",
    roomChallengeId: "c",
    judgeId: null,
    displayName: null,
  };

  it("holds back a guest who has not given a name", () => {
    expect(asJudge(guest)).toBeNull();
  });

  it("lets a named guest and any member judge", () => {
    expect(
      asJudge({ ...guest, judgeId: "j", displayName: "Ada" }),
    ).toMatchObject({
      judgeId: "j",
    });
    expect(
      asJudge({
        kind: "member",
        hackathonId: HACK,
        userId: "u",
        judgeId: "j",
        displayName: "Ada",
      }),
    ).toMatchObject({ kind: "member" });
  });
});

describe("resolveMemberJudge", () => {
  it("is an approved judge with their existing desk row", async () => {
    const { db, calls } = fakeDb({
      select: [[{ name: "Ada" }], [{ id: "j1", displayName: "Ada" }]],
    });
    await expect(
      resolveMemberJudge(db, { userId: "u1", hackathonId: HACK }),
    ).resolves.toEqual({
      kind: "member",
      hackathonId: HACK,
      userId: "u1",
      judgeId: "j1",
      displayName: "Ada",
    });
    expect(calls.insert).toBe(0);
  });

  it("is null for someone who is neither a judge nor staff", async () => {
    const { db } = fakeDb({ select: [[], []] });
    await expect(
      resolveMemberJudge(db, { userId: "u1", hackathonId: HACK }),
    ).resolves.toBeNull();
  });

  it("is null for volunteers and lapsed staff", async () => {
    const volunteer = fakeDb({
      select: [[], [{ role: "volunteer", expiresAt: null }]],
    });
    await expect(
      resolveMemberJudge(volunteer.db, { userId: "u1", hackathonId: HACK }),
    ).resolves.toBeNull();

    const lapsed = fakeDb({
      select: [[], [{ role: "admin", expiresAt: new Date(Date.now() - 1000) }]],
    });
    await expect(
      resolveMemberJudge(lapsed.db, { userId: "u1", hackathonId: HACK }),
    ).resolves.toBeNull();
  });

  it("creates staff's desk row on first use, named from the session", async () => {
    const { db, calls } = fakeDb({
      select: [
        [],
        [{ role: "admin", expiresAt: null }],
        [],
        [
          {
            id: HACK,
            name: "Hacklytics",
            startDate: new Date(),
            endDate: new Date(),
          },
        ],
      ],
      insert: [[{ id: "j2", displayName: "Grace" }]],
    });
    await expect(
      resolveMemberJudge(db, {
        userId: "u2",
        hackathonId: HACK,
        userName: " Grace ",
      }),
    ).resolves.toMatchObject({ judgeId: "j2", displayName: "Grace" });
    expect(calls.insert).toBe(1);
  });

  it("refuses staff an edition that does not exist", async () => {
    const { db, calls } = fakeDb({
      select: [[], [{ role: "super_admin", expiresAt: null }], [], []],
    });
    await expect(
      resolveMemberJudge(db, { userId: "u2", hackathonId: HACK }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(calls.insert).toBe(0);
  });

  it("reads the row a parallel first request created", async () => {
    const { db } = fakeDb({
      select: [[{ name: "Ada" }], [], [{ id: "j3", displayName: "Ada" }]],
      insert: [[]],
    });
    await expect(
      resolveMemberJudge(db, { userId: "u1", hackathonId: HACK }),
    ).resolves.toMatchObject({ judgeId: "j3" });
  });
});

describe("resolveDeskPrincipal", () => {
  const session = {
    sessionId: "s1",
    hackathonId: HACK,
    linkId: "l1",
    roomId: "r1",
    roomChallengeId: "c1",
    judgeId: null,
    displayName: null,
  };

  it("is nobody without a judge account or a guest cookie", async () => {
    const { db, calls } = fakeDb({});
    await expect(
      resolveDeskPrincipal(db, { hackathonId: HACK, cookieHeader: "a=1" }),
    ).resolves.toBeNull();
    expect(calls.select).toBe(0);
  });

  it("is the guest the cookie belongs to", async () => {
    const { db } = fakeDb({ select: [[session]] });
    await expect(
      resolveDeskPrincipal(db, {
        hackathonId: HACK,
        cookieHeader: "query_judging_guest=abc",
      }),
    ).resolves.toEqual({ kind: "guest", ...session });
  });

  it("does not let a guest cookie into another edition", async () => {
    const { db } = fakeDb({ select: [[session]] });
    await expect(
      resolveDeskPrincipal(db, {
        hackathonId: OTHER_HACK,
        cookieHeader: "query_judging_guest=abc",
      }),
    ).resolves.toBeNull();
  });

  it("falls back to the guest cookie for a signed-in non-judge", async () => {
    const { db } = fakeDb({ select: [[], [], [session]] });
    await expect(
      resolveDeskPrincipal(db, {
        hackathonId: HACK,
        userId: "u9",
        cookieHeader: "query_judging_guest=abc",
      }),
    ).resolves.toMatchObject({ kind: "guest", sessionId: "s1" });
  });
});

describe("activateRoomLink", () => {
  const original = process.env.AUTH_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  });

  it("refuses a bad signature without touching the database", async () => {
    process.env.AUTH_SECRET = "test-secret";
    const { db, calls } = fakeDb({});
    await expect(
      activateRoomLink(db as unknown as DrizzleDB, {
        linkId: "3f1c2b8e-9d4a-4c1e-8f2a-5b6c7d8e9f01",
        sig: "forged",
      }),
    ).resolves.toEqual({ kind: "invalid" });
    expect(calls.select).toBe(0);
  });
});
