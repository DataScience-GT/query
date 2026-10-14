import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  newTableNumbers,
  nextTableNumber,
  portalOrigin,
  revokeRoomAccess,
  roomLinkUrl,
  slotTables,
  tableNumber,
} from "./rooms";
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

describe("table numbering", () => {
  const hall = [
    { name: "Table 1", archived: false },
    { name: "table  2", archived: false },
    { name: "Table 4", archived: false },
    { name: "Table 9", archived: true },
    { name: "Sponsor booth", archived: false },
  ];

  it("reads the number out of a table's name only", () => {
    expect(tableNumber("Table 12")).toBe(12);
    expect(tableNumber(" table 3 ")).toBe(3);
    expect(tableNumber("Table 3B")).toBeNull();
    expect(tableNumber("Room 210")).toBeNull();
    expect(tableNumber("Table 9999")).toBe(9999);
    expect(tableNumber("Table 20000")).toBeNull();
  });

  it("goes on from the highest number, archived tables included", () => {
    expect(nextTableNumber(hall)).toBe(10);
    expect(nextTableNumber([])).toBe(1);
    expect(newTableNumbers(hall, 3)).toEqual([10, 11, 12]);
  });

  it("skips numbers an active table has, without running past the range", () => {
    expect(newTableNumbers(hall, 5, 1)).toEqual([3, 5]);
    // An archived table's number is free again.
    expect(newTableNumbers(hall, 2, 9)).toEqual([9, 10]);
    expect(newTableNumbers(hall, 2, 1)).toEqual([]);
  });

  it("slots new tables in by number among the hall's tables", () => {
    const at = (id: string, number: number | null) => ({ id, number });
    const table = (id: string, number: number) => ({ id, number });
    const ids = (list: { id: string }[]) => list.map((station) => station.id);
    const order = [
      at("Room 210", null),
      at("Table 1", 1),
      at("Table 3", 3),
      // Another hall's table, or a room between the hall's tables.
      at("Table 4 elsewhere", null),
      at("Table 5", 5),
    ];

    expect(
      ids(slotTables(order, [table("Table 2", 2), table("Table 6", 6)])),
    ).toEqual([
      "Room 210",
      "Table 1",
      "Table 2",
      "Table 3",
      "Table 4 elsewhere",
      "Table 5",
      "Table 6",
    ]);
    // Below every table in the hall: ahead of the lowest.
    expect(
      ids(
        slotTables(
          [at("Room 210", null), at("Table 3", 3)],
          [table("Table 1", 1), table("Table 2", 2)],
        ),
      ),
    ).toEqual(["Room 210", "Table 1", "Table 2", "Table 3"]);
    // A hall with no tables yet: at the end.
    expect(
      ids(slotTables([at("Room 210", null)], [table("Table 1", 1)])),
    ).toEqual(["Room 210", "Table 1"]);
  });
});
