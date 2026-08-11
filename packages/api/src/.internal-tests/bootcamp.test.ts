import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { currentTerm } from "@query/db/services/membership";

/**
 * The bootcamp: one member's weeks, and the admin grid of everybody's. What
 * matters here is that enrolment is a term, not a flag — the regression to
 * catch is last semester's intake keeping access to this semester.
 */

const mockFindFirst = vi.fn();

/**
 * Rows a `.select()` chain resolves to, keyed by `.from()` table plus whether
 * it was DISTINCT — sessions and terms both read `event`. Where-clauses are
 * not compiled, so fixtures return what the real query would have.
 */
let onSelect: (table: unknown, distinct: boolean) => unknown[] = () => [];

vi.mock("@query/db", async () => {
  const { createTransactionMock } = await import("./_db-tx-mock");

  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: async () => [],
  });

  // Mirrors drizzle's builder for the chains this router uses:
  // .from().where().orderBy(), and .from().innerJoin().where().orderBy().
  const selectChain = (distinct: boolean) => {
    let from: unknown;
    const rows = () => Promise.resolve(onSelectRef.current(from, distinct));
    const node: any = {
      from: (t: unknown) => ((from = t), node),
      innerJoin: () => node,
      where: () => node,
      orderBy: () => node,
      limit: () => rows(),
      then: (ok: any, err: any) => rows().then(ok, err),
    };
    return node;
  };

  return {
    db: {
      transaction: createTransactionMock({ base: () => db }),
      query: {
        admins: table("admins"),
        users: table("users"),
        members: table("members"),
        events: table("events"),
        eventCheckIns: table("eventCheckIns"),
      },
      select: () => selectChain(false),
      selectDistinct: () => selectChain(true),
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", name: "name", email: "email" },
    members: {
      id: "id",
      userId: "user_id",
      firstName: "first_name",
      lastName: "last_name",
      school: "school",
      bootcampTerm: "bootcamp_term",
    },
    events: {
      id: "id",
      title: "title",
      description: "description",
      location: "location",
      eventDate: "event_date",
      checkInEnabled: "check_in_enabled",
      bootcampWeek: "bootcamp_week",
      bootcampTerm: "bootcamp_term",
    },
    eventCheckIns: { eventId: "event_id", userId: "user_id" },
  };
});

// The factory is hoisted above `let onSelect`, so it may only close over a
// container it can read later — not the binding itself.
const onSelectRef = {
  get current() {
    return onSelect;
  },
};

import { db, events, members, eventCheckIns } from "@query/db";

const TERM = currentTerm();
const LAST_TERM = "1999-fall";

const ADMIN = "user_admin";
const ALICE = "user_alice";
const BOB = "user_bob";

const WEEK_1 = "11111111-1111-4111-8111-111111111111";
const WEEK_2 = "22222222-2222-4222-8222-222222222222";
const WEEK_3 = "33333333-3333-4333-8333-333333333333";

const DAY = 24 * 60 * 60 * 1000;

const callerFor = (userId: string) =>
  appRouter.createCaller({
    db,
    session: { user: { id: userId } },
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: undefined,
  } as never);

/** Two sessions already taught, one still to come. */
const SESSIONS = [
  {
    id: WEEK_1,
    week: 1,
    title: "Python Basics",
    description: null,
    location: "Klaus 1443",
    eventDate: new Date(Date.now() - 7 * DAY),
    checkInEnabled: true,
  },
  {
    id: WEEK_2,
    week: 2,
    title: "Control Flow",
    description: null,
    location: "Klaus 1443",
    eventDate: new Date(Date.now() - 1 * DAY),
    checkInEnabled: true,
  },
  {
    id: WEEK_3,
    week: 3,
    title: "Functions",
    description: null,
    location: "Klaus 1443",
    eventDate: new Date(Date.now() + 6 * DAY),
    checkInEnabled: true,
  },
];

const ROSTER = [
  {
    userId: ALICE,
    firstName: "Alice",
    lastName: "Adams",
    email: "alice@gatech.edu",
    school: "Georgia Tech",
  },
  {
    userId: BOB,
    firstName: "Bob",
    lastName: "Brown",
    email: "bob@gatech.edu",
    school: "Georgia Tech",
  },
];

/** Alice made week 1 only; Bob made both that have happened. */
const CHECK_INS = [
  { eventId: WEEK_1, userId: ALICE },
  { eventId: WEEK_1, userId: BOB },
  { eventId: WEEK_2, userId: BOB },
];

describe("Bootcamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
    onSelect = () => [];
  });

  describe("myProgress", () => {
    it("reports not-enrolled rather than failing, and hands back nothing", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "members" ? { bootcampTerm: null } : undefined,
      );
      onSelect = () => SESSIONS;

      const result = await callerFor(ALICE).bootcamp.myProgress();

      // Has to be renderable state, not an error — the page shows an upsell.
      expect(result.enrolled).toBe(false);
      expect(result.sessions).toEqual([]);
      expect(result.term).toBe(TERM);
    });

    // The regression the term column exists for.
    it("does not carry last semester's intake into this one", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "members" ? { bootcampTerm: LAST_TERM } : undefined,
      );

      const result = await callerFor(ALICE).bootcamp.myProgress();

      expect(result.enrolled).toBe(false);
    });

    it("separates attended, missed and still-to-come", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "members" ? { bootcampTerm: TERM } : undefined,
      );
      onSelect = (table) =>
        table === events
          ? SESSIONS
          : table === eventCheckIns
            ? CHECK_INS.filter((row) => row.userId === ALICE)
            : [];

      const result = await callerFor(ALICE).bootcamp.myProgress();

      expect(result.enrolled).toBe(true);
      expect(result.sessions.map((s) => [s.week, s.attended, s.past])).toEqual([
        [1, true, true],
        [2, false, true],
        [3, false, false],
      ]);
      // Missing week 2 is what makes these differ.
      expect(result.attended).toBe(1);
      expect(result.held).toBe(2);
    });
  });

  describe("attendance", () => {
    const seedGrid = () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins"
          ? { userId: ADMIN, isActive: true, role: "admin" }
          : undefined,
      );
      onSelect = (table, distinct) => {
        if (table === events) return distinct ? [{ term: TERM }] : SESSIONS;
        if (table === members) return ROSTER;
        if (table === eventCheckIns) return CHECK_INS;
        return [];
      };
    };

    it("is closed to a member", async () => {
      mockFindFirst.mockReturnValue(undefined);

      const err: any = await callerFor(ALICE)
        .bootcamp.attendance({})
        .catch((e: unknown) => e);

      expect(err.code).toBe("FORBIDDEN");
    });

    it("is closed to a volunteer, who holds an admins row", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins"
          ? { userId: ALICE, isActive: true, role: "volunteer" }
          : undefined,
      );

      const err: any = await callerFor(ALICE)
        .bootcamp.attendance({})
        .catch((e: unknown) => e);

      expect(err.code).toBe("FORBIDDEN");
    });

    it("puts every member against every session", async () => {
      seedGrid();

      const result = await callerFor(ADMIN).bootcamp.attendance({});

      expect(result.members.map((m) => [m.name, m.attendedCount])).toEqual([
        ["Alice Adams", 1],
        ["Bob Brown", 2],
      ]);
      expect(result.members[0]?.attendedEventIds).toEqual([WEEK_1]);
      expect(result.members[1]?.attendedEventIds).toEqual([WEEK_1, WEEK_2]);
    });

    it("counts each session's turnout and averages only what has been held", async () => {
      seedGrid();

      const result = await callerFor(ADMIN).bootcamp.attendance({});

      expect(result.sessions.map((s) => s.attendance)).toEqual([2, 1, 0]);
      expect(result.stats).toMatchObject({
        enrolled: 2,
        sessionsPlanned: 3,
        sessionsHeld: 2,
        // Three attendances over two held sessions — week 3 must not count.
        averageAttendance: 1.5,
      });
    });

    it("reads the current term when the caller names none", async () => {
      seedGrid();

      const result = await callerFor(ADMIN).bootcamp.attendance({});

      expect(result.term).toBe(TERM);
      expect(result.terms).toEqual([TERM]);
    });
  });
});
