import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";

/**
 * Club meeting attendance metrics (/scan/club).
 *
 * A read for staff and read-only bug testers. Volunteers staff the scanner on
 * the same page but do not get the roster of everyone who ever attended.
 */

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockSelectRows = vi.fn(() => [] as unknown[]);

vi.mock("@query/db", () => {
  const selectChain = () => {
    const node: any = {
      from: () => node,
      innerJoin: () => node,
      leftJoin: () => node,
      where: () => node,
      groupBy: () => node,
      orderBy: () => node,
      then: (ok: any, err: any) =>
        Promise.resolve(mockSelectRows()).then(ok, err),
    };
    return node;
  };

  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: (...args: any[]) => mockFindMany(name, ...args),
  });

  return {
    db: {
      query: {
        admins: table("admins"),
        users: table("users"),
        members: table("members"),
        events: table("events"),
        eventCheckIns: table("eventCheckIns"),
      },
      select: selectChain,
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", name: "name", email: "email" },
    members: {
      id: "id",
      userId: "user_id",
      firstName: "first_name",
      lastName: "last_name",
      isActive: "is_active",
      membershipEndDate: "membership_end_date",
    },
    events: {
      id: "id",
      title: "title",
      location: "location",
      eventDate: "event_date",
      maxCheckIns: "max_check_ins",
      bootcampWeek: "bootcamp_week",
    },
    eventCheckIns: { id: "id", eventId: "event_id", userId: "user_id" },
    // Read at import time by the bootcamp router; unused here.
    bootcampWorkshops: {},
  };
});

import { db } from "@query/db";

const EVENT_A = "11111111-1111-4111-8111-111111111111";
const EVENT_B = "22222222-2222-4222-8222-222222222222";

const callerAs = (role: string | null) => {
  mockFindFirst.mockImplementation((table: string) =>
    table === "admins" && role
      ? { id: "ad_1", userId: "user_1", role, isActive: true, expiresAt: null }
      : undefined,
  );
  return appRouter.createCaller({
    db,
    session: { user: { id: "user_1" } },
    userId: "user_1",
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as never);
};

/** The three selects run in order: per event, per person, active members. */
const seed = () => {
  mockSelectRows
    .mockReturnValueOnce([
      {
        id: EVENT_B,
        title: "Kickoff",
        location: "Klaus 1443",
        eventDate: new Date("2026-09-10T22:00:00Z"),
        maxCheckIns: 40,
        bootcampWeek: null,
        checkIns: 3,
      },
      {
        id: EVENT_A,
        title: "Bootcamp week 1",
        location: null,
        eventDate: new Date("2026-09-03T22:00:00Z"),
        maxCheckIns: null,
        bootcampWeek: 1,
        checkIns: 1,
      },
    ])
    .mockReturnValueOnce([
      {
        userId: "u1",
        userName: "ada99",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        isMember: true,
        eventsAttended: 2,
        lastAttended: new Date("2026-09-10T22:00:00Z"),
      },
      {
        userId: "u2",
        userName: "Grace Hopper",
        email: "grace@example.com",
        firstName: null,
        lastName: null,
        isMember: false,
        eventsAttended: 1,
        lastAttended: new Date("2026-09-10T22:00:00Z"),
      },
      {
        userId: "u3",
        userName: null,
        email: "anon@example.com",
        firstName: null,
        lastName: null,
        isMember: false,
        eventsAttended: 1,
        lastAttended: new Date("2026-09-10T22:00:00Z"),
      },
    ])
    .mockReturnValueOnce([{ count: 4 }]);
};

describe("Club attendance metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockReset();
    mockFindMany.mockReset().mockReturnValue([]);
    mockSelectRows.mockReset().mockReturnValue([]);
    cache.clear();
  });

  it("gives an admin the summary, the events and the people", async () => {
    seed();
    const res = await callerAs("admin").events.attendanceMetrics({
      range: "all",
    });

    expect(res.from).toBeNull();
    expect(res.summary).toEqual({
      eventsHeld: 2,
      checkIns: 4,
      uniqueAttendees: 3,
      averagePerEvent: 2,
      activeMembers: 4,
      activeMembersAttended: 1,
    });
    expect(res.events.map((e) => e.id)).toEqual([EVENT_B, EVENT_A]);
    // Member name first, then the account name, then a placeholder.
    expect(res.people.map((p) => p.name)).toEqual([
      "Ada Lovelace",
      "Grace Hopper",
      "Unknown",
    ]);
    // Three aggregate queries, whatever the number of check-ins.
    expect(mockSelectRows).toHaveBeenCalledTimes(3);
  });

  it("defaults to this term and starts the range at the term's first day", async () => {
    const res = await callerAs("admin").events.attendanceMetrics({});
    expect(res.from).toBeInstanceOf(Date);
    expect(res.from!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(res.summary.eventsHeld).toBe(0);
    expect(res.summary.averagePerEvent).toBe(0);
  });

  it("refuses someone with no staff row", async () => {
    await expect(
      callerAs(null).events.attendanceMetrics({ range: "term" }),
    ).rejects.toThrow(/Admin access required/);
    expect(mockSelectRows).not.toHaveBeenCalled();
  });

  it("refuses a volunteer, who only staffs the scanner", async () => {
    await expect(
      callerAs("volunteer").events.attendanceMetrics({ range: "term" }),
    ).rejects.toThrow(/Admin access required/);
    expect(mockSelectRows).not.toHaveBeenCalled();
  });

  it("lets a read-only bug tester run it", async () => {
    seed();
    const res = await callerAs("bug_tester").events.attendanceMetrics({
      range: "90d",
    });
    expect(res.summary.checkIns).toBe(4);
  });

  it("rejects an unknown range", async () => {
    await expect(
      callerAs("admin").events.attendanceMetrics({ range: "forever" as never }),
    ).rejects.toThrow();
  });
});
