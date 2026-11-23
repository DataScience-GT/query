import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";

/**
 * Bug testers get read-only access to staff queries (isAdmin / isScanner let
 * them through for queries). That must not hand them a credential: a room's QR
 * link, a hackathon event's check-in code, a club event's door QR.
 */

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const selectQueue: unknown[][] = [];

vi.mock("@query/db", () => {
  // select() takes its rows when it is called, so the eight parallel selects of
  // listRooms get them in the order they were written.
  const select = () => {
    const rows = selectQueue.shift() ?? [];
    const node: any = Promise.resolve(rows);
    for (const m of [
      "from",
      "where",
      "orderBy",
      "groupBy",
      "limit",
      "innerJoin",
      "leftJoin",
    ]) {
      node[m] = () => node;
    }
    return node;
  };

  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: (...args: any[]) => mockFindMany(name, ...args),
  });
  // Any table or column the routers touch resolves to a placeholder.
  const placeholder = new Proxy(
    {},
    { get: (_t, key) => (typeof key === "string" ? key : undefined) },
  );
  const db = {
    query: {
      admins: table("admins"),
      events: table("events"),
      hackathonEvents: table("hackathonEvents"),
    },
    select,
  };
  const names = new Set(["db"]);
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === "db") return db;
        if (key === "then" || typeof key !== "string") return undefined;
        return names.has(key) ? undefined : placeholder;
      },
      has: () => true,
    },
  );
});

import { db } from "@query/db";

const HACK = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";
const LINK = "44444444-4444-4444-8444-444444444444";

let nextUser = 0;
const callerAs = (role: string) => {
  // A fresh user per caller: the admin row is cached per user for a minute.
  const userId = `user_${++nextUser}`;
  mockFindFirst.mockImplementation((table: string) =>
    table === "admins"
      ? { id: "ad_1", userId, role, isActive: true, expiresAt: null }
      : table === "hackathonEvents"
        ? hackathonEvent
        : table === "events"
          ? clubEvent
          : undefined,
  );
  return appRouter.createCaller({
    db,
    session: { user: { id: userId } },
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: { url: "https://query.example/x", headers: { get: () => null } },
  } as never);
};

const hackathonEvent = {
  id: EVENT,
  hackathonId: HACK,
  name: "Fireside",
  location: null,
  startTime: new Date("2026-09-10T22:00:00Z"),
  endTime: new Date("2026-09-10T23:00:00Z"),
  points: 10,
  selfCheckIn: true,
  checkInCode: "SECRET-CODE",
};

const clubEvent = {
  id: EVENT,
  title: "Kickoff",
  qrCode: "door-qr-secret",
  eventDate: new Date("2026-09-10T22:00:00Z"),
  checkIns: [],
};

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret");
  mockFindFirst.mockReset();
  mockFindMany.mockReset();
  selectQueue.length = 0;
  cache.clear?.();
});

const seedRooms = () => {
  selectQueue.push(
    [], // buildings
    [
      {
        id: ROOM,
        name: "Table 1",
        kind: "table",
        buildingId: null,
        challengeId: null,
        displayOrder: 0,
        archivedAt: null,
      },
    ],
    [], // challenges
    [{ id: LINK, roomId: ROOM, createdAt: new Date("2026-09-10T20:00:00Z") }],
    [], // seated
    [], // guests
    [], // appointments
    [], // notices
  );
};

describe("bug testers do not obtain credentials from staff queries", () => {
  describe("judging.admin.listRooms", () => {
    it("gives an admin the room's QR link", async () => {
      seedRooms();
      const res = await callerAs("admin").judging.admin.listRooms({
        hackathonId: HACK,
      });
      expect(res.rooms[0]?.link?.id).toBe(LINK);
      expect(res.rooms[0]?.link?.url).toContain(LINK);
    });

    it("keeps the link's id and URL from a bug tester", async () => {
      seedRooms();
      const res = await callerAs("bug_tester").judging.admin.listRooms({
        hackathonId: HACK,
      });
      expect(res.rooms[0]?.link).toEqual({
        id: "",
        createdAt: expect.any(Date),
        url: "",
      });
      expect(JSON.stringify(res)).not.toContain(LINK);
    });
  });

  describe("hackathon.adminGetEvents", () => {
    it("includes the check-in code for an admin", async () => {
      mockFindMany.mockResolvedValue([hackathonEvent]);
      selectQueue.push([]);
      const res = await callerAs("admin").hackathon.adminGetEvents({
        hackathonId: HACK,
      });
      expect(res[0]?.checkInCode).toBe("SECRET-CODE");
    });

    it("omits the check-in code for a bug tester", async () => {
      mockFindMany.mockResolvedValue([hackathonEvent]);
      selectQueue.push([]);
      const res = await callerAs("bug_tester").hackathon.adminGetEvents({
        hackathonId: HACK,
      });
      expect(res[0]?.checkInCode).toBeNull();
      expect(JSON.stringify(res)).not.toContain("SECRET-CODE");
    });
  });

  describe("hackathon.getEventCheckInCode", () => {
    const input = { hackathonId: HACK, eventId: EVENT };

    it("shows the door screen's code to event staff", async () => {
      const res = await callerAs("volunteer").hackathon.getEventCheckInCode(input);
      expect(res.checkInCode).toBe("SECRET-CODE");
    });

    it("refuses a bug tester", async () => {
      await expect(
        callerAs("bug_tester").hackathon.getEventCheckInCode(input),
      ).rejects.toThrow(/Event staff access required/);
    });
  });

  describe("events.getById", () => {
    it("blanks the door QR for a bug tester only", async () => {
      const asAdmin = await callerAs("admin").events.getById({ id: EVENT });
      expect(asAdmin.qrCode).toBe("door-qr-secret");

      const asTester = await callerAs("bug_tester").events.getById({
        id: EVENT,
      });
      expect(asTester.qrCode).toBe("");
    });
  });

  describe("events.listAll", () => {
    it("blanks the door QR for a bug tester without poisoning the shared cache", async () => {
      mockFindMany.mockResolvedValue([clubEvent]);
      selectQueue.push([], [], []);

      const asTester = await callerAs("bug_tester").events.listAll();
      expect(asTester[0]?.qrCode).toBe("");

      const asAdmin = await callerAs("admin").events.listAll();
      expect(asAdmin[0]?.qrCode).toBe("door-qr-secret");
    });
  });
});
