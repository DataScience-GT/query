/**
 * Check-in flags in the organiser's judging console: the project list carries
 * each project's flags and whether it was pulled from prizes, can be narrowed
 * to flagged projects, and the header counts open flags. Two writes close the
 * loop: dismissing a flag and pulling (or returning) a project from prizes.
 *
 * The schema is the real one; only the database handle is a stand-in, handed
 * to the router through the context the way judge-edge.test.ts does. It keeps
 * the rows of the tables a write touches and applies the conditions the router
 * asks for, so a missing edition condition lets another edition's row through
 * and fails the test, rather than passing on a canned answer. The flag
 * service has its own tests; here it is a stub, which also lets these tests
 * see exactly what the router asks it for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  auditLogs,
  hackathonCheckInFlags,
  hackathons,
  judgingConfigs,
  judgingEntries,
} from "@query/db";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import type * as CheckInFlags from "../services/check-in-flags";

const mockFlagsForEntries = vi.fn();
const mockFlaggedIds = vi.fn();
const mockOpenCount = vi.fn();

vi.mock("../services/check-in-flags", async (importActual) => ({
  ...(await importActual<typeof CheckInFlags>()),
  checkInFlagsForEntries: (...args: unknown[]) => mockFlagsForEntries(...args),
  flaggedEntryIds: (...args: unknown[]) => mockFlaggedIds(...args),
  openCheckInFlagCount: (...args: unknown[]) => mockOpenCount(...args),
}));

const HACK_A = "11111111-1111-4111-8111-111111111111";
const HACK_B = "22222222-2222-4222-8222-222222222222";
const ENTRY_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ENTRY_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ENTRY_3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const ENTRY_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const FLAG_1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const FLAG_OTHER = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const NO_SUCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const dialect = new PgDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as never);

type Row = Record<string, any>;
type SelectCall = {
  fields: Record<string, unknown> | undefined;
  table: unknown;
  where: unknown;
};

const camel = (name: string) =>
  name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const TERM = /"[a-z_]+"\."([a-z_]+)" = \$(\d+)/g;

/**
 * A row filter from a where made only of `column = value` terms joined by
 * `and`. Anything else throws, so the fake never quietly ignores a condition
 * it does not understand.
 */
function matcher(where: unknown) {
  const { sql: text, params } = render(where);
  const terms = [...text.matchAll(TERM)].map(
    (match) => [camel(match[1]!), params[Number(match[2]) - 1]] as const,
  );
  if (text.replace(TERM, "").replace(/[()\s]|and/g, "")) {
    throw new Error(`The fake database cannot evaluate: ${text}`);
  }
  return (row: Row) => terms.every(([key, value]) => row[key] === value);
}

// ---------------------------------------------------------------------------
// The stand-in database

let adminRow: Row | undefined;
const store = new Map<unknown, Row[]>();
const selects: SelectCall[] = [];
const updates: { table: unknown; values: Row }[] = [];
const inserts: { table: unknown; values: Row }[] = [];
// Answers a select outright; undefined hands it to the stored rows.
let route: ((call: SelectCall) => unknown[] | undefined) | null = null;

const matching = (table: unknown, where: unknown) => {
  const rows = store.get(table) ?? [];
  return where ? rows.filter(matcher(where)) : [...rows];
};

const fakeDb: any = {
  query: { admins: { findFirst: async () => adminRow } },
  select: (fields?: Record<string, unknown>) => {
    const call: SelectCall = { fields, table: null, where: null };
    selects.push(call);
    const chain: any = {
      then: (onOk: any, onErr: any) =>
        Promise.resolve(route?.(call) ?? matching(call.table, call.where)).then(
          onOk,
          onErr,
        ),
    };
    chain.from = (table: unknown) => {
      call.table = table;
      return chain;
    };
    chain.where = (where: unknown) => {
      call.where = where;
      return chain;
    };
    for (const method of [
      "innerJoin",
      "leftJoin",
      "groupBy",
      "orderBy",
      "limit",
      "offset",
      "for",
    ]) {
      chain[method] = () => chain;
    }
    return chain;
  },
  insert: (table: unknown) => ({
    values: (values: Row) => {
      inserts.push({ table, values });
      return Object.assign(Promise.resolve(undefined), {
        // The config row already exists, so a create-if-missing finds nothing
        // to return and reads the stored one.
        onConflictDoNothing: () => ({ returning: async () => [] }),
        returning: async () => [values],
      });
    },
  }),
  update: (table: unknown) => ({
    set: (values: Row) => ({
      where: (where: unknown) => {
        const hit = matching(table, where);
        for (const row of hit) Object.assign(row, values);
        updates.push({ table, values });
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => hit.map((row) => ({ ...row })),
        });
      },
    }),
  }),
  delete: () => ({ where: async () => [] }),
  transaction: async (callback: (tx: unknown) => unknown) => callback(fakeDb),
};

const callerAs = (userId: string | undefined) =>
  appRouter.createCaller({
    db: fakeDb,
    session: userId ? { user: { id: userId } } : null,
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as any);

const admin = () => callerAs("admin_user");

const audits = () =>
  inserts.filter((write) => write.table === auditLogs).map((w) => w.values);

const flagView = (
  over: Partial<CheckInFlags.CheckInFlagView> = {},
): CheckInFlags.CheckInFlagView => ({
  id: FLAG_1,
  participantName: "Ada Lovelace",
  rule: "overlap",
  eventName: "BNY Workshop",
  conflictEventName: "Full Sail Fireside",
  method: "code",
  attempts: 3,
  createdAt: new Date("2027-02-06T18:00:00Z"),
  lastAttemptAt: new Date("2027-02-06T19:41:00Z"),
  dismissed: false,
  ...over,
});

const entryRow = (id: string, over: Row = {}) => ({
  id,
  source: "portal",
  sourceProjectId: null,
  title: `Project ${id.slice(-1)}`,
  submissionUrl: null,
  description: "",
  demoLinks: [],
  videoUrl: null,
  technologies: [],
  universities: [],
  prizeCategories: [],
  participantCount: 2,
  submittedAt: null,
  deletedAt: null,
  prizeIneligible: false,
  createdAt: new Date("2027-02-06T12:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  cache.clear();
  selects.length = 0;
  updates.length = 0;
  inserts.length = 0;
  route = null;
  adminRow = { userId: "admin_user", isActive: true, role: "admin" };
  mockFlagsForEntries.mockReset().mockResolvedValue(new Map());
  mockFlaggedIds.mockReset().mockResolvedValue(new Set());
  mockOpenCount.mockReset().mockResolvedValue(0);

  store.clear();
  store.set(hackathons, [
    { id: HACK_A, name: "Hacklytics 2027", startDate: null, endDate: null },
    { id: HACK_B, name: "Hacklytics 2026", startDate: null, endDate: null },
  ]);
  store.set(judgingConfigs, [
    {
      hackathonId: HACK_A,
      state: "draft",
      openedAt: null,
      closedAt: null,
      showAllScores: false,
      inventoryLockedAt: null,
      groupsInitializedAt: null,
      itineraryPublished: false,
      emergencyMode: false,
      claimsStartedAt: null,
    },
    {
      hackathonId: HACK_B,
      state: "draft",
      openedAt: null,
      closedAt: null,
      showAllScores: false,
      inventoryLockedAt: null,
      groupsInitializedAt: null,
      itineraryPublished: false,
      emergencyMode: false,
      claimsStartedAt: null,
    },
  ]);
  store.set(hackathonCheckInFlags, [
    {
      id: FLAG_1,
      hackathonId: HACK_A,
      dismissedAt: null,
      dismissedById: null,
    },
    {
      id: FLAG_OTHER,
      hackathonId: HACK_B,
      dismissedAt: null,
      dismissedById: null,
    },
  ]);
  store.set(judgingEntries, [
    {
      id: ENTRY_1,
      hackathonId: HACK_A,
      prizeIneligibleAt: null,
      prizeIneligibleById: null,
    },
    {
      id: ENTRY_OTHER,
      hackathonId: HACK_B,
      prizeIneligibleAt: null,
      prizeIneligibleById: null,
    },
  ]);
});

// ---------------------------------------------------------------------------
describe("judging.admin.listEntries", () => {
  /** The page of projects the database returns, whatever filter it was given. */
  const wirePage = (rows: Row[], liveIds: string[] = rows.map((r) => r.id)) => {
    route = (call) => {
      if (call.table !== judgingEntries) return [];
      if (call.fields && "value" in call.fields)
        return [{ value: rows.length }];
      if (call.fields && "title" in call.fields) return rows;
      return liveIds.map((id) => ({ id }));
    };
  };

  const pageQuery = () =>
    selects.find((call) => call.fields && "title" in call.fields)!;
  const totalQuery = () =>
    selects.find((call) => call.fields && "value" in call.fields)!;

  it("puts each project's flags and its prize status on the project", async () => {
    wirePage([entryRow(ENTRY_1, { prizeIneligible: true }), entryRow(ENTRY_2)]);
    const flag = flagView();
    mockFlagsForEntries.mockResolvedValue(new Map([[ENTRY_1, [flag]]]));

    const result = await admin().judging.admin.listEntries({
      hackathonId: HACK_A,
    });

    expect(result.entries.map((e) => e.id)).toEqual([ENTRY_1, ENTRY_2]);
    expect(result.entries[0]).toMatchObject({
      checkInFlags: [flag],
      prizeIneligible: true,
    });
    expect(result.entries[1]).toMatchObject({
      checkInFlags: [],
      prizeIneligible: false,
    });
    // Asked for this page's projects only, in this edition.
    expect(mockFlagsForEntries).toHaveBeenCalledTimes(1);
    expect(mockFlagsForEntries).toHaveBeenCalledWith(fakeDb, HACK_A, [
      ENTRY_1,
      ENTRY_2,
    ]);
  });

  it("reads prize status from the entry's prize_ineligible_at column", async () => {
    wirePage([entryRow(ENTRY_1)]);

    await admin().judging.admin.listEntries({ hackathonId: HACK_A });

    expect(render(pageQuery().fields!.prizeIneligible).sql).toBe(
      '"judging_entry"."prize_ineligible_at" is not null',
    );
  });

  it("does not look up flags for an empty page", async () => {
    wirePage([]);

    const result = await admin().judging.admin.listEntries({
      hackathonId: HACK_A,
    });

    expect(result.entries).toEqual([]);
    expect(mockFlagsForEntries).not.toHaveBeenCalled();
  });

  it("applies no flag condition unless asked", async () => {
    wirePage([entryRow(ENTRY_1)]);

    await admin().judging.admin.listEntries({ hackathonId: HACK_A });
    await admin().judging.admin.listEntries({
      hackathonId: HACK_A,
      flagged: false,
    });

    expect(mockFlaggedIds).not.toHaveBeenCalled();
    for (const call of selects.filter((c) => c.fields && "title" in c.fields)) {
      expect(render(call.where).sql).not.toMatch(/ in \(/);
    }
  });

  it("narrows the page and the total to projects with an open flag", async () => {
    wirePage([entryRow(ENTRY_2)], [ENTRY_1, ENTRY_2, ENTRY_3]);
    mockFlaggedIds.mockResolvedValue(new Set([ENTRY_2]));

    const result = await admin().judging.admin.listEntries({
      hackathonId: HACK_A,
      flagged: true,
    });

    // Open flags are looked for among this edition's live projects.
    expect(mockFlaggedIds).toHaveBeenCalledWith(fakeDb, HACK_A, [
      ENTRY_1,
      ENTRY_2,
      ENTRY_3,
    ]);
    const liveRead = selects.find(
      (call) =>
        call.table === judgingEntries &&
        call.fields &&
        !("title" in call.fields) &&
        !("value" in call.fields),
    )!;
    const live = render(liveRead.where);
    expect(live.sql).toContain('"judging_entry"."deleted_at" is null');
    expect(live.params).toContain(HACK_A);

    // The same condition sits in the query that pages and the one that counts,
    // so the total is the flagged total and not the edition's.
    for (const call of [pageQuery(), totalQuery()]) {
      const { sql, params } = render(call.where);
      expect(sql).toMatch(/"judging_entry"\."id" in \(\$\d+\)/);
      expect(params).toContain(ENTRY_2);
      expect(params).not.toContain(ENTRY_1);
      expect(params).not.toContain(ENTRY_3);
    }
    expect(result.total).toBe(1);
  });

  it("matches nothing when no project has an open flag", async () => {
    wirePage([], [ENTRY_1, ENTRY_2]);

    const result = await admin().judging.admin.listEntries({
      hackathonId: HACK_A,
      flagged: true,
    });

    for (const call of [pageQuery(), totalQuery()]) {
      expect(render(call.where).sql).toMatch(/ and false\)$/);
    }
    expect(result).toMatchObject({ total: 0, entries: [] });
  });

  it("combines the flag filter with the others", async () => {
    wirePage([], [ENTRY_1]);
    mockFlaggedIds.mockResolvedValue(new Set([ENTRY_1]));

    await admin().judging.admin.listEntries({
      hackathonId: HACK_A,
      flagged: true,
      source: "portal",
      status: "live",
    });

    const { sql, params } = render(pageQuery().where);
    expect(sql).toContain('"judging_entry"."source" = $');
    expect(sql).toMatch(/"judging_entry"\."id" in \(/);
    expect(params).toEqual(expect.arrayContaining([HACK_A, "portal", ENTRY_1]));
  });
});

// ---------------------------------------------------------------------------
describe("judging.admin.overview", () => {
  const overview = () =>
    admin().judging.admin.overview({ hackathonId: HACK_A });

  // Every other count reads from tables this test leaves empty.
  beforeEach(() => {
    route = (call) =>
      call.table === hackathons || call.table === judgingConfigs
        ? undefined
        : [];
  });

  it("counts the open check-in flags and nothing about them", async () => {
    mockOpenCount.mockResolvedValue(4);

    const result = await overview();

    expect(result.counts.checkInFlags).toEqual({ open: 4 });
    expect(mockOpenCount).toHaveBeenCalledWith(fakeDb, HACK_A);
  });

  it("reports zero when there are none", async () => {
    const result = await overview();

    expect(result.counts.checkInFlags).toEqual({ open: 0 });
  });
});

// ---------------------------------------------------------------------------
describe("judging.admin.dismissCheckInFlag", () => {
  const flagRow = (id: string) =>
    store.get(hackathonCheckInFlags)!.find((row) => row.id === id)!;

  it("dismisses a flag and records who", async () => {
    const result = await admin().judging.admin.dismissCheckInFlag({
      hackathonId: HACK_A,
      flagId: FLAG_1,
      dismissed: true,
    });

    expect(result).toEqual({ dismissed: true });
    expect(flagRow(FLAG_1)).toMatchObject({
      dismissedAt: expect.any(Date),
      dismissedById: "admin_user",
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe(hackathonCheckInFlags);
    expect(Object.keys(updates[0]!.values).sort()).toEqual([
      "dismissedAt",
      "dismissedById",
    ]);
    expect(audits()).toEqual([
      expect.objectContaining({
        userId: "admin_user",
        action: "judging.dismissCheckInFlag",
        resourceId: FLAG_1,
        severity: "info",
        metadata: { hackathonId: HACK_A },
      }),
    ]);
  });

  it("opens a dismissed flag again", async () => {
    Object.assign(flagRow(FLAG_1), {
      dismissedAt: new Date(),
      dismissedById: "someone",
    });

    const result = await admin().judging.admin.dismissCheckInFlag({
      hackathonId: HACK_A,
      flagId: FLAG_1,
      dismissed: false,
    });

    expect(result).toEqual({ dismissed: false });
    expect(flagRow(FLAG_1)).toMatchObject({
      dismissedAt: null,
      dismissedById: null,
    });
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "judging.reopenCheckInFlag",
        resourceId: FLAG_1,
      }),
    ]);
  });

  it("refuses a flag that belongs to another hackathon", async () => {
    await expect(
      admin().judging.admin.dismissCheckInFlag({
        hackathonId: HACK_A,
        flagId: FLAG_OTHER,
        dismissed: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(flagRow(FLAG_OTHER).dismissedAt).toBeNull();
    expect(audits()).toEqual([]);
  });

  it("refuses a flag that does not exist", async () => {
    await expect(
      admin().judging.admin.dismissCheckInFlag({
        hackathonId: HACK_A,
        flagId: NO_SUCH,
        dismissed: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(audits()).toEqual([]);
  });

  it("leaves the cached public results alone", async () => {
    cache.set(`hackathon:${HACK_A}:results`, [{ id: "placing" }], 60);

    await admin().judging.admin.dismissCheckInFlag({
      hackathonId: HACK_A,
      flagId: FLAG_1,
      dismissed: true,
    });

    expect(cache.get(`hackathon:${HACK_A}:results`)).toEqual([
      { id: "placing" },
    ]);
  });
});

// ---------------------------------------------------------------------------
describe("judging.admin.setPrizeEligibility", () => {
  const entry = (id: string) =>
    store.get(judgingEntries)!.find((row) => row.id === id)!;
  const resultsKey = (hackathonId: string) =>
    `hackathon:${hackathonId}:results`;

  it("pulls a project from prizes and clears the cached results at once", async () => {
    cache.set(resultsKey(HACK_A), [{ id: "placing" }], 60);
    cache.set(resultsKey(HACK_B), [{ id: "last year" }], 60);

    const result = await admin().judging.admin.setPrizeEligibility({
      hackathonId: HACK_A,
      entryId: ENTRY_1,
      eligible: false,
    });

    expect(result).toEqual({ changed: true });
    expect(entry(ENTRY_1)).toMatchObject({
      prizeIneligibleAt: expect.any(Date),
      prizeIneligibleById: "admin_user",
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe(judgingEntries);
    expect(cache.get(resultsKey(HACK_A))).toBeNull();
    // Only this edition's results.
    expect(cache.get(resultsKey(HACK_B))).toEqual([{ id: "last year" }]);
    expect(audits()).toEqual([
      expect.objectContaining({
        userId: "admin_user",
        action: "judging.setPrizeEligibility",
        resourceId: ENTRY_1,
        severity: "warn",
        metadata: { hackathonId: HACK_A, eligible: false },
      }),
    ]);
  });

  it("puts a project back in the running and clears the cached results", async () => {
    Object.assign(entry(ENTRY_1), {
      prizeIneligibleAt: new Date(),
      prizeIneligibleById: "someone",
    });
    cache.set(resultsKey(HACK_A), [{ id: "placing" }], 60);

    const result = await admin().judging.admin.setPrizeEligibility({
      hackathonId: HACK_A,
      entryId: ENTRY_1,
      eligible: true,
    });

    expect(result).toEqual({ changed: true });
    expect(entry(ENTRY_1)).toMatchObject({
      prizeIneligibleAt: null,
      prizeIneligibleById: null,
    });
    expect(cache.get(resultsKey(HACK_A))).toBeNull();
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "judging.setPrizeEligibility",
        severity: "warn",
        metadata: { hackathonId: HACK_A, eligible: true },
      }),
    ]);
  });

  it("does nothing when the project is already in that state", async () => {
    cache.set(resultsKey(HACK_A), [{ id: "placing" }], 60);

    const result = await admin().judging.admin.setPrizeEligibility({
      hackathonId: HACK_A,
      entryId: ENTRY_1,
      eligible: true,
    });

    expect(result).toEqual({ changed: false });
    expect(updates).toEqual([]);
    expect(audits()).toEqual([]);
    expect(cache.get(resultsKey(HACK_A))).toEqual([{ id: "placing" }]);
  });

  it("does not move the pull date when asked to pull again", async () => {
    const pulledAt = new Date("2027-02-06T20:00:00Z");
    Object.assign(entry(ENTRY_1), {
      prizeIneligibleAt: pulledAt,
      prizeIneligibleById: "first_admin",
    });

    const result = await admin().judging.admin.setPrizeEligibility({
      hackathonId: HACK_A,
      entryId: ENTRY_1,
      eligible: false,
    });

    expect(result).toEqual({ changed: false });
    expect(entry(ENTRY_1)).toMatchObject({
      prizeIneligibleAt: pulledAt,
      prizeIneligibleById: "first_admin",
    });
  });

  it("refuses a project that belongs to another hackathon", async () => {
    cache.set(resultsKey(HACK_A), [{ id: "placing" }], 60);
    cache.set(resultsKey(HACK_B), [{ id: "last year" }], 60);

    await expect(
      admin().judging.admin.setPrizeEligibility({
        hackathonId: HACK_A,
        entryId: ENTRY_OTHER,
        eligible: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(entry(ENTRY_OTHER).prizeIneligibleAt).toBeNull();
    expect(updates).toEqual([]);
    expect(audits()).toEqual([]);
    expect(cache.get(resultsKey(HACK_A))).toEqual([{ id: "placing" }]);
    expect(cache.get(resultsKey(HACK_B))).toEqual([{ id: "last year" }]);
  });

  it("refuses a project that does not exist", async () => {
    await expect(
      admin().judging.admin.setPrizeEligibility({
        hackathonId: HACK_A,
        entryId: NO_SUCH,
        eligible: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(updates).toEqual([]);
  });

  it("refuses an edition that does not exist", async () => {
    await expect(
      admin().judging.admin.setPrizeEligibility({
        hackathonId: NO_SUCH,
        entryId: ENTRY_1,
        eligible: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(entry(ENTRY_1).prizeIneligibleAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("who may use them", () => {
  const writes = (caller: ReturnType<typeof callerAs>) => [
    () =>
      caller.judging.admin.dismissCheckInFlag({
        hackathonId: HACK_A,
        flagId: FLAG_1,
        dismissed: true,
      }),
    () =>
      caller.judging.admin.setPrizeEligibility({
        hackathonId: HACK_A,
        entryId: ENTRY_1,
        eligible: false,
      }),
  ];
  const reads = (caller: ReturnType<typeof callerAs>) => [
    () => caller.judging.admin.listEntries({ hackathonId: HACK_A }),
    () => caller.judging.admin.overview({ hackathonId: HACK_A }),
  ];

  const untouched = () => {
    expect(updates).toEqual([]);
    expect(
      store
        .get(hackathonCheckInFlags)!
        .every((row) => row.dismissedAt === null),
    ).toBe(true);
    expect(
      store.get(judgingEntries)!.every((row) => row.prizeIneligibleAt === null),
    ).toBe(true);
    expect(mockFlagsForEntries).not.toHaveBeenCalled();
    expect(mockOpenCount).not.toHaveBeenCalled();
  };

  it("refuses someone who is not an admin, reads and writes alike", async () => {
    adminRow = undefined;
    const caller = callerAs("hacker_user");

    for (const run of [...reads(caller), ...writes(caller)]) {
      await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    untouched();
  });

  it("refuses a volunteer, who only staffs the scanner", async () => {
    adminRow = { userId: "vol_user", isActive: true, role: "volunteer" };
    const caller = callerAs("vol_user");

    for (const run of [...reads(caller), ...writes(caller)]) {
      await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    untouched();
  });

  it("refuses someone who is not signed in", async () => {
    const caller = callerAs(undefined);

    for (const run of [...reads(caller), ...writes(caller)]) {
      await expect(run()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    untouched();
  });

  it("lets a bug tester read but not write", async () => {
    adminRow = { userId: "qa_user", isActive: true, role: "bug_tester" };
    const caller = callerAs("qa_user");
    route = (call) =>
      call.table === hackathons || call.table === judgingConfigs
        ? undefined
        : [];

    for (const run of reads(caller)) await run();
    for (const run of writes(caller)) {
      await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    expect(updates).toEqual([]);
    expect(audits()).toEqual([]);
  });
});
