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

// Mutations resolve through this hook so conflict and successful validation
// paths use the router's real Drizzle call shape without a database.
let onMutation: (operation: "insert" | "update") => unknown[] = () => [];

type MutationCall = {
  operation: "insert" | "update";
  table: unknown;
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
  conflict?: {
    target: unknown[];
    set: Record<string, unknown>;
  };
};

let mutationCalls: MutationCall[] = [];

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
      leftJoin: () => node,
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
        bootcampWorkshops: table("bootcampWorkshops"),
      },
      select: () => selectChain(false),
      selectDistinct: () => selectChain(true),
      insert: (target: unknown) => {
        const call: MutationCall = { operation: "insert", table: target };
        mutationCallsRef.current.push(call);
        const node: any = {
          values: (values: Record<string, unknown>) => {
            call.values = values;
            return node;
          },
          onConflictDoUpdate: (conflict: MutationCall["conflict"]) => {
            call.conflict = conflict;
            return node;
          },
          returning: () =>
            Promise.resolve().then(() => onMutationRef.current("insert")),
        };
        return node;
      },
      update: (target: unknown) => {
        const call: MutationCall = { operation: "update", table: target };
        mutationCallsRef.current.push(call);
        const node: any = {
          set: (values: Record<string, unknown>) => {
            call.set = values;
            return node;
          },
          where: () => node,
          returning: () =>
            Promise.resolve().then(() => onMutationRef.current("update")),
        };
        return node;
      },
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
    bootcampWorkshops: {
      id: "id",
      term: "term",
      week: "week",
      title: "title",
      materialsKey: "materials_key",
      materialsFileName: "materials_file_name",
      materialsSizeBytes: "materials_size_bytes",
      solutionKey: "solution_key",
      solutionFileName: "solution_file_name",
      solutionSizeBytes: "solution_size_bytes",
      recordingUrl: "recording_url",
      isPublished: "is_published",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  };
});

// The factory is hoisted above `let onSelect`, so it may only close over a
// container it can read later — not the binding itself.
const onSelectRef = {
  get current() {
    return onSelect;
  },
};

const onMutationRef = {
  get current() {
    return onMutation;
  },
};

const mutationCallsRef = {
  get current() {
    return mutationCalls;
  },
};

import {
  bootcampWorkshops,
  db,
  events,
  members,
  eventCheckIns,
} from "@query/db";

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
    onMutation = () => [];
    mutationCalls = [];
  });

  describe("workshop material", () => {
    const DRAFT = {
      id: "44444444-4444-4444-8444-444444444444",
      term: TERM,
      week: 1,
      title: "Python Basics",
      materialsKey: null,
      materialsFileName: null,
      materialsSizeBytes: null,
      solutionKey: null,
      solutionFileName: null,
      solutionSizeBytes: null,
      recordingUrl: null,
      isPublished: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      eventDate: null,
      location: null,
    };

    it("returns an empty list to a caller who is not enrolled", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "members" ? { bootcampTerm: null } : undefined,
      );
      onSelect = () => [{ ...DRAFT, isPublished: true }];

      await expect(callerFor(ALICE).bootcamp.workshops()).resolves.toEqual([]);
    });

    // Whoever bought the fall bootcamp keeps its material in January.
    it("still serves a past cohort its own published material", async () => {
      const past = { ...DRAFT, term: LAST_TERM, isPublished: true };
      mockFindFirst.mockImplementation((table: string) =>
        table === "members" ? { bootcampTerm: LAST_TERM } : undefined,
      );
      onSelect = (table) => (table === bootcampWorkshops ? [past] : []);

      await expect(callerFor(ALICE).bootcamp.workshops()).resolves.toEqual([
        past,
      ]);
    });

    it("keeps a draft out of member results but exposes it to staff", async () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "members") return { bootcampTerm: TERM };
        if (table === "admins") {
          return { userId: ADMIN, isActive: true, role: "admin" };
        }
        return undefined;
      });
      // The mock represents the database applying each procedure's WHERE: the
      // member query gets no published rows; the admin query gets the draft.
      let reads = 0;
      onSelect = (table) => {
        if (table !== bootcampWorkshops) return [];
        reads += 1;
        return reads === 1 ? [] : [DRAFT];
      };

      await expect(callerFor(ALICE).bootcamp.workshops()).resolves.toEqual([]);
      const rows = await callerFor(ADMIN).bootcamp.adminWorkshops({ term: TERM });
      expect(rows).toEqual([DRAFT]);
    });

    it("maps duplicate week conflicts on both create and update", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins"
          ? { userId: ADMIN, isActive: true, role: "admin" }
          : undefined,
      );
      onMutation = () => {
        throw { code: "23505" };
      };

      const createError: any = await callerFor(ADMIN)
        .bootcamp.createWorkshop({ week: 1, title: "Python" })
        .catch((error: unknown) => error);
      expect(createError.code).toBe("CONFLICT");

      const updateError: any = await callerFor(ADMIN)
        .bootcamp.updateWorkshop({ workshopId: DRAFT.id, title: "Python" })
        .catch((error: unknown) => error);
      expect(updateError.code).toBe("CONFLICT");
    });

    it("allows only http(s) recording URLs", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins"
          ? { userId: ADMIN, isActive: true, role: "admin" }
          : undefined,
      );
      onMutation = () => [DRAFT];

      for (const recordingUrl of ["javascript:alert(1)", "data:text/plain,x"]) {
        const error: any = await callerFor(ADMIN)
          .bootcamp.createWorkshop({ week: 1, title: "Python", recordingUrl })
          .catch((cause: unknown) => cause);
        expect(error.code).toBe("BAD_REQUEST");
      }

      await expect(
        callerFor(ADMIN).bootcamp.createWorkshop({
          week: 1,
          title: "Python",
          recordingUrl: "https://example.com/recording",
        }),
      ).resolves.toEqual(DRAFT);
    });

    it("returns the joined session date for the materials Date column", async () => {
      const sessionDate = new Date("2026-09-21T22:00:00.000Z");
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins"
          ? { userId: ADMIN, isActive: true, role: "admin" }
          : undefined,
      );
      onSelect = (table) =>
        table === bootcampWorkshops
          ? [{ ...DRAFT, eventDate: sessionDate }]
          : [];

      const [workshop] = await callerFor(ADMIN).bootcamp.adminWorkshops({});

      expect(workshop?.eventDate).toEqual(sessionDate);
    });

    // A past cohort's row, so a clock-derived term would show up as a mismatch.
    const adminWithWorkshop = (table: string) => {
      if (table === "admins") return { userId: ADMIN, isActive: true, role: "admin" };
      if (table === "bootcampWorkshops") {
        return { term: LAST_TERM, week: 1, title: "Python Basics" };
      }
      return undefined;
    };

    it("creates or updates a QR-backed session under the row's own term", async () => {
      const sessionDate = new Date("2026-09-21T22:00:00.000Z");
      const session = { id: WEEK_1, eventDate: sessionDate };
      mockFindFirst.mockImplementation(adminWithWorkshop);
      onMutation = () => [session];

      await expect(
        callerFor(ADMIN).bootcamp.upsertSession({
          workshopId: DRAFT.id,
          sessionDate,
          location: "Klaus 1443",
        }),
      ).resolves.toEqual(session);

      const call = mutationCalls.find(
        (entry) => entry.operation === "insert" && entry.table === events,
      );
      expect(call?.values).toMatchObject({
        title: "Python Basics",
        location: "Klaus 1443",
        eventDate: sessionDate,
        createdById: ADMIN,
        bootcampWeek: 1,
        bootcampTerm: LAST_TERM,
        bootcampOnly: true,
      });
      expect(call?.values?.qrCode).toEqual(expect.any(String));
      expect(call?.conflict?.target).toEqual([
        events.bootcampWeek,
        events.bootcampTerm,
      ]);
      expect(call?.conflict?.set).toMatchObject({
        location: "Klaus 1443",
        eventDate: sessionDate,
        bootcampOnly: true,
        updatedAt: expect.any(Date),
      });
      // The event's own title belongs to the events screen.
      expect(call?.conflict?.set).not.toHaveProperty("title");
      expect(call?.conflict?.set).not.toHaveProperty("qrCode");
      expect(call?.conflict?.set).not.toHaveProperty("createdById");
    });

    it("leaves an existing session's room alone when location is omitted", async () => {
      mockFindFirst.mockImplementation(adminWithWorkshop);
      onMutation = () => [{ id: WEEK_1 }];

      await callerFor(ADMIN).bootcamp.upsertSession({
        workshopId: DRAFT.id,
        sessionDate: new Date("2026-09-28T22:00:00.000Z"),
      });

      const call = mutationCalls.find((entry) => entry.table === events);
      expect(call?.conflict?.set).not.toHaveProperty("location");
    });

    it("clears a session by detaching its event without deleting check-ins", async () => {
      mockFindFirst.mockImplementation(adminWithWorkshop);
      onMutation = () => [{ id: WEEK_1 }];

      await callerFor(ADMIN).bootcamp.upsertSession({
        workshopId: DRAFT.id,
        sessionDate: null,
      });

      expect(mutationCalls).toHaveLength(1);
      expect(mutationCalls[0]).toMatchObject({
        operation: "update",
        table: events,
        set: {
          bootcampWeek: null,
          bootcampTerm: null,
          bootcampOnly: false,
          updatedAt: expect.any(Date),
        },
      });
      expect(mutationCalls[0]?.set).not.toHaveProperty("title");
      expect(mutationCalls[0]?.set).not.toHaveProperty("location");
    });

    it("refuses a session for a workshop that does not exist", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins"
          ? { userId: ADMIN, isActive: true, role: "admin" }
          : undefined,
      );

      const error: any = await callerFor(ADMIN)
        .bootcamp.upsertSession({ workshopId: DRAFT.id, sessionDate: null })
        .catch((cause: unknown) => cause);

      expect(error.code).toBe("NOT_FOUND");
      expect(mutationCalls).toEqual([]);
    });

    it("allows only admins to save the session event", async () => {
      mockFindFirst.mockReturnValue(undefined);

      const error: any = await callerFor(ALICE)
        .bootcamp.upsertSession({
          workshopId: DRAFT.id,
          sessionDate: new Date(),
        })
        .catch((cause: unknown) => cause);

      expect(error.code).toBe("FORBIDDEN");
      expect(mutationCalls).toEqual([]);
    });
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
