import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { portalOrigin, revokeRoomAccess, roomLinkUrl } from "./rooms";
import { verifyRoomLink } from "./room-link";
import type { JudgingDb } from "./config";

const saved = {
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  AUTH_URL: process.env.AUTH_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
};

beforeEach(() => {
  delete process.env.NEXTAUTH_URL;
  delete process.env.AUTH_URL;
  process.env.AUTH_SECRET = "test-secret-for-room-links";
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("portalOrigin", () => {
  it("prefers the configured site URL over the request", () => {
    process.env.NEXTAUTH_URL = "https://datasciencegt.org/some/path";
    expect(portalOrigin(new Request("https://preview.example.app/api/trpc"))).toBe(
      "https://datasciencegt.org",
    );
  });

  it("falls back to AUTH_URL, then the request, then the public site", () => {
    process.env.AUTH_URL = "http://localhost:3000";
    expect(portalOrigin()).toBe("http://localhost:3000");
    delete process.env.AUTH_URL;
    expect(portalOrigin(new Request("https://preview.example.app/x"))).toBe(
      "https://preview.example.app",
    );
    expect(portalOrigin()).toBe("https://datasciencegt.org");
  });
});

describe("roomLinkUrl", () => {
  it("is an absolute activation link whose signature verifies", () => {
    const linkId = "0b6f1c1e-7f44-4b0e-9d1a-2f3c4d5e6f70";
    const url = new URL(roomLinkUrl(linkId, "https://datasciencegt.org"));
    expect(url.origin).toBe("https://datasciencegt.org");
    expect(url.pathname).toBe(`/judge/activate/${linkId}`);
    expect(verifyRoomLink(linkId, url.searchParams.get("sig")!)).toBe(true);
  });
});

// Each awaited update resolves to the next queued result and records its
// `set` and `where` arguments.
function fakeTx(updates: unknown[][]) {
  const sets: unknown[] = [];
  const db = {
    update: () => {
      const builder = {
        set: (value: unknown) => {
          sets.push(value);
          return builder;
        },
        where: () => builder,
        returning: () => Promise.resolve(updates.shift() ?? []),
      };
      return builder;
    },
  };
  return { tx: db as unknown as JudgingDb, sets };
}

describe("revokeRoomAccess", () => {
  it("retires links, ends guest sessions and stands their judges up", async () => {
    const { tx, sets } = fakeTx([
      [{ id: "link-1" }],
      [{ judgeId: "judge-1" }, { judgeId: null }, { judgeId: "judge-1" }],
      [{ id: "presence-1" }],
    ]);
    await expect(
      revokeRoomAccess(tx, { hackathonId: "h1", roomId: "r1" }, "officer"),
    ).resolves.toEqual({ links: 1, sessions: 3, presence: 1 });
    expect(sets).toHaveLength(3);
    expect(sets[0]).toMatchObject({ revokedById: "officer" });
  });

  it("touches no seats when no guest had given a name", async () => {
    const { tx, sets } = fakeTx([[{ id: "link-1" }], [{ judgeId: null }]]);
    await expect(
      revokeRoomAccess(tx, { hackathonId: "h1" }, null),
    ).resolves.toEqual({ links: 1, sessions: 1, presence: 0 });
    expect(sets).toHaveLength(2);
  });
});
