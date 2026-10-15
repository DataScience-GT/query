/**
 * Check-in flags meeting results: a team an organiser pulled from prizes is not
 * ranked by judging.results.compute, judging.results.list tells the organiser
 * how many flags are open on each placed team, and the public hackathon.getResults
 * drops a pulled team at once without ever carrying flag data.
 *
 * The schema is the real one; only the database handle is a stand-in, handed
 * to the router through the context the way judge-edge.test.ts does. Its
 * selects answer by the table they read from, and the entries query applies
 * the filters it is given, so a filter taken out of the router changes the
 * result instead of passing unnoticed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  hackathonCheckInFlags,
  hackathonEvents,
  hackathons,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluationRatings,
  judgingEvaluations,
  judgingPlacements,
} from "@query/db";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";

const HACK = "11111111-1111-4111-8111-111111111111";
const ADMIN_ROW = { userId: "admin_user", isActive: true, role: "admin" };

const render = (condition: unknown) =>
  new PgDialect().sqlToQuery(condition as never);

type Query = { table: unknown; wheres: unknown[] };

const mockSelect = vi.fn<(query: Query) => unknown[]>();
const mockFindMany = vi.fn();
const inserts: { table: unknown; values: any }[] = [];
const deletes: unknown[] = [];

const settled = <T>(value: T) => Object.assign(Promise.resolve(value), {});

const selectChain = () => {
  const query: Query = { table: null, wheres: [] };
  const chain: any = {
    then: (onOk: any, onErr: any) =>
      Promise.resolve(mockSelect(query)).then(onOk, onErr),
  };
  chain.from = (table: unknown) => {
    query.table = table;
    return chain;
  };
  chain.where = (condition: unknown) => {
    query.wheres.push(condition);
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
};

const fakeDb: any = {
  query: {
    admins: { findFirst: async () => ADMIN_ROW },
    hackathons: {
      findFirst: async () => ({ id: HACK, status: "completed" }),
    },
    hackathonResults: { findMany: async () => [] },
    judgingPlacements: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
  select: () => selectChain(),
  transaction: async (callback: (tx: unknown) => unknown) => callback(fakeDb),
  insert: (table: unknown) => ({
    values: (values: unknown) => {
      inserts.push({ table, values });
      return Object.assign(Promise.resolve(undefined), {
        returning: async () => [{ id: "row" }],
        onConflictDoNothing: () => ({ returning: async () => [{ id: "row" }] }),
      });
    },
  }),
  delete: (table: unknown) => ({
    where: () => {
      deletes.push(table);
      return settled(undefined);
    },
  }),
};

const adminCaller = () =>
  appRouter.createCaller({
    db: fakeDb,
    session: { user: { id: "admin_user" } },
    userId: "admin_user",
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as any);

const anonCaller = () =>
  appRouter.createCaller({
    db: fakeDb,
    session: null,
    userId: undefined,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as any);

const placementsInserted = () =>
  inserts
    .filter((write) => write.table === judgingPlacements)
    .flatMap((write) => write.values as any[]);

beforeEach(() => {
  vi.clearAllMocks();
  cache.clear();
  inserts.length = 0;
  deletes.length = 0;
  mockSelect.mockReset();
  mockFindMany.mockReset();
});

// ---------------------------------------------------------------------------
describe("judging.results.compute", () => {
  const entries = [
    { id: "entry-a", deletedAt: null, prizeIneligibleAt: null },
    // Pulled from prizes. Its judges scored it highest of the three.
    { id: "entry-b", deletedAt: null, prizeIneligibleAt: new Date() },
    { id: "entry-c", deletedAt: null, prizeIneligibleAt: null },
  ];
  const scored = [
    { id: "eval-a", entryId: "entry-a", challengeId: "ch-1", isComplete: true },
    { id: "eval-b", entryId: "entry-b", challengeId: "ch-1", isComplete: true },
    { id: "eval-c", entryId: "entry-c", challengeId: "ch-1", isComplete: true },
  ];
  const ratings = [
    { evaluationId: "eval-a", value: 4 },
    { evaluationId: "eval-b", value: 5 },
    { evaluationId: "eval-c", value: 3 },
  ];

  let entryWheres: unknown[] = [];

  const wire = (stored = entries) => {
    entryWheres = [];
    mockSelect.mockImplementation(({ table, wheres }) => {
      if (table === hackathons) {
        return [
          { id: HACK, name: "Hacklytics", startDate: null, endDate: null },
        ];
      }
      // Nothing is due, so reconcileDueDrafts returns at once.
      if (table === judgingEvaluationDrafts) return [];
      if (table === judgingConfigs) return [{ hackathonId: HACK }];
      // Nothing is published yet.
      if (table === judgingPlacements) return [{ n: 0 }];
      if (table === judgingEntries) {
        entryWheres = wheres;
        // What the database would hand back for the conditions asked for.
        const asked = wheres.map((where) => render(where).sql).join(" ");
        return stored.filter(
          (entry) =>
            (!asked.includes('"deleted_at" is null') || !entry.deletedAt) &&
            (!asked.includes('"prize_ineligible_at" is null') ||
              !entry.prizeIneligibleAt),
        );
      }
      if (table === judgingEntryChallenges) return [];
      if (table === judgingChallenges) return [];
      if (table === judgingEvaluations) return scored;
      if (table === judgingEvaluationRatings) return ratings;
      return [];
    });
  };

  it("leaves a team pulled from prizes out of the ranking", async () => {
    wire();

    const result = await adminCaller().judging.results.compute({
      hackathonId: HACK,
    });

    const placed = placementsInserted();
    expect(placed.map((row) => row.entryId)).not.toContain("entry-b");
    // The next team moves up: entry-a is 1st on 4.00 and entry-c 2nd on 3.00,
    // although entry-b's 5.00 would have taken first place.
    expect(
      placed.map((row) => [row.entryId, row.scope, row.placement, row.score]),
    ).toEqual([
      ["entry-a", "overall", 1, "4.00"],
      ["entry-c", "overall", 2, "3.00"],
    ]);
    expect(result.placements).toBe(2);
  });

  it("still counts the pulled team's evaluations as scored", async () => {
    wire();

    const result = await adminCaller().judging.results.compute({
      hackathonId: HACK,
    });

    // Judges keep scoring it; only the placing is withheld.
    expect(result.evaluations).toBe(3);
  });

  it("asks for live, prize-eligible entries of the edition", async () => {
    wire();

    await adminCaller().judging.results.compute({ hackathonId: HACK });

    const query = render(entryWheres[0]);
    expect(query.params).toContain(HACK);
    expect(query.sql).toContain('"deleted_at" is null');
    expect(query.sql).toContain('"prize_ineligible_at" is null');
  });

  it("ranks everyone when nobody is pulled", async () => {
    wire(entries.map((entry) => ({ ...entry, prizeIneligibleAt: null })));

    await adminCaller().judging.results.compute({ hackathonId: HACK });

    expect(placementsInserted().map((row) => row.entryId)).toEqual([
      "entry-b",
      "entry-a",
      "entry-c",
    ]);
  });
});

// ---------------------------------------------------------------------------
describe("judging.results.list", () => {
  const COMPUTED_AT = new Date("2027-02-07T09:00:00Z");
  const placement = (
    id: string,
    entryId: string,
    over: Record<string, unknown> = {},
  ) => ({
    id,
    scope: "overall",
    scopeLabel: "Overall",
    placement: 1,
    score: "4.00",
    evaluationCount: 2,
    publishedAt: null,
    computedAt: COMPUTED_AT,
    entryId,
    title: `Project ${entryId}`,
    deletedAt: null,
    prizeIneligibleAt: null,
    ...over,
  });

  const flagRow = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    participantId: `part-${id}`,
    eventId: "event-2",
    conflictEventId: "event-1",
    rule: "overlap",
    method: "code",
    attempts: 1,
    createdAt: new Date("2027-02-06T18:00:00Z"),
    lastAttemptAt: new Date("2027-02-06T18:00:00Z"),
    dismissedAt: null,
    teamId: "team-1",
    userId: `user-${id}`,
    firstName: "Secret",
    lastName: `Hacker${id}`,
    accountName: null,
    email: `${id}@example.com`,
    ...over,
  });

  const wire = (opts: {
    placements: unknown[];
    flags?: unknown[];
    portal?: unknown[];
  }) => {
    mockSelect.mockImplementation(({ table }) => {
      if (table === judgingPlacements) return opts.placements;
      if (table === judgingEvaluations) return [{ n: 0 }];
      if (table === hackathonCheckInFlags) return opts.flags ?? [];
      if (table === hackathonEvents) {
        return [
          { id: "event-1", name: "Opening Workshop" },
          { id: "event-2", name: "Sponsor Talk" },
        ];
      }
      if (table === judgingEntries) return opts.portal ?? [];
      if (table === judgingEntryMembers) return [];
      return [];
    });
  };

  const rowsOf = (data: { scopes: { placements: { entryId: string }[] }[] }) =>
    data.scopes.flatMap((scope) => scope.placements);

  it("counts the open flags on each placed team and skips dismissed ones", async () => {
    wire({
      placements: [
        placement("p1", "entry-a"),
        placement("p2", "entry-b", { placement: 2 }),
      ],
      // Team one has two open flags and a cleared one; entry-b has none.
      flags: [
        flagRow("f1"),
        flagRow("f2", { participantId: "part-f1b" }),
        flagRow("f3", { dismissedAt: new Date("2027-02-06T20:00:00Z") }),
      ],
      portal: [{ entryId: "entry-a", teamId: "team-1", submittedById: null }],
    });

    const data = await adminCaller().judging.results.list({
      hackathonId: HACK,
    });

    const byEntry = Object.fromEntries(
      rowsOf(data).map((row) => [row.entryId, row]),
    ) as Record<string, any>;
    expect(byEntry["entry-a"].openCheckInFlags).toBe(2);
    expect(byEntry["entry-b"].openCheckInFlags).toBe(0);
  });

  it("says which placed teams are pulled from prizes", async () => {
    wire({
      placements: [
        placement("p1", "entry-a"),
        placement("p2", "entry-b", {
          placement: 2,
          prizeIneligibleAt: new Date("2027-02-07T10:00:00Z"),
        }),
      ],
    });

    const data = await adminCaller().judging.results.list({
      hackathonId: HACK,
    });

    const byEntry = Object.fromEntries(
      rowsOf(data).map((row) => [row.entryId, row]),
    ) as Record<string, any>;
    expect(byEntry["entry-a"].prizeIneligible).toBe(false);
    expect(byEntry["entry-b"].prizeIneligible).toBe(true);
    expect(byEntry["entry-a"].openCheckInFlags).toBe(0);
  });

  it("carries a count and a flag, never who or why", async () => {
    wire({
      placements: [placement("p1", "entry-a")],
      flags: [flagRow("f1")],
      portal: [{ entryId: "entry-a", teamId: "team-1", submittedById: null }],
    });

    const data = await adminCaller().judging.results.list({
      hackathonId: HACK,
    });

    const text = JSON.stringify(data);
    expect(text).not.toContain("Secret");
    expect(text).not.toContain("example.com");
    expect(text).not.toContain("Opening Workshop");
    expect(text).not.toContain("Sponsor Talk");
    expect(Object.keys(rowsOf(data)[0]!).sort()).toEqual([
      "entryId",
      "evaluationCount",
      "id",
      "openCheckInFlags",
      "placement",
      "prizeIneligible",
      "score",
      "title",
      "withdrawn",
    ]);
  });

  it("reads no flags when nothing is placed", async () => {
    wire({ placements: [] });

    const data = await adminCaller().judging.results.list({
      hackathonId: HACK,
    });

    expect(data.scopes).toEqual([]);
    const tables = mockSelect.mock.calls.map(([query]) => query.table);
    expect(tables).not.toContain(hackathonCheckInFlags);
  });
});

// ---------------------------------------------------------------------------
describe("hackathon.getResults", () => {
  const placementRow = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    scope: "overall",
    scopeLabel: "Overall",
    placement: 1,
    score: "4.25",
    entry: {
      id: `entry-${id}`,
      title: `Project ${id}`,
      submissionUrl: null,
      demoLinks: [],
      deletedAt: null,
      prizeIneligibleAt: null,
      sourceProject: null,
      ...over,
    },
  });

  const wire = (rows: unknown[]) => {
    mockFindMany.mockImplementation(async () => rows);
  };

  it("hides a team pulled from prizes after the placings went out", async () => {
    wire([
      placementRow("a"),
      placementRow("b", {
        prizeIneligibleAt: new Date("2027-02-07T10:00:00Z"),
      }),
      placementRow("c", { deletedAt: new Date("2027-02-07T10:00:00Z") }),
    ]);

    const results = await anonCaller().hackathon.getResults({
      hackathonId: HACK,
    });

    expect(results.map((row) => row.projectName)).toEqual(["Project a"]);
  });

  it("reads the column it filters on", async () => {
    wire([]);

    await anonCaller().hackathon.getResults({ hackathonId: HACK });

    const args = mockFindMany.mock.calls[0]![0];
    expect(args.with.entry.columns).toMatchObject({
      deletedAt: true,
      prizeIneligibleAt: true,
    });
  });

  it("carries no flag data, and reads none", async () => {
    wire([
      placementRow("a"),
      placementRow("b", {
        prizeIneligibleAt: new Date("2027-02-07T10:00:00Z"),
      }),
    ]);

    const results = await anonCaller().hackathon.getResults({
      hackathonId: HACK,
    });

    expect(Object.keys(results[0]!).sort()).toEqual([
      "demoUrl",
      "githubUrl",
      "id",
      "placement",
      "projectName",
      "scope",
      "scopeLabel",
      "score",
      "submissionUrl",
      "teamName",
    ]);
    const text = JSON.stringify(results).toLowerCase();
    expect(text).not.toContain("flag");
    expect(text).not.toContain("ineligible");
    // The cached payload is built from placements alone: no select, so no
    // flag table, ran for it.
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("serves a pulled team's absence from the cache too", async () => {
    wire([
      placementRow("a"),
      placementRow("b", {
        prizeIneligibleAt: new Date("2027-02-07T10:00:00Z"),
      }),
    ]);

    await anonCaller().hackathon.getResults({ hackathonId: HACK });
    const cached = await anonCaller().hackathon.getResults({
      hackathonId: HACK,
    });

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(cached.map((row) => row.projectName)).toEqual(["Project a"]);
  });
});
