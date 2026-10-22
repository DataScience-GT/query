/**
 * Check-in flags meeting results: a team an organiser pulled from prizes is not
 * ranked by judging.results.compute, judging.results.list tells the organiser
 * how many flags are open on each placed team, and the public hackathon.getResults
 * drops a pulled team at once without ever carrying flag data.
 *
 * It also covers what calibration adds to those procedures: compute stores the
 * judge-adjusted score with the raw mean beside it, the organiser's list returns
 * both and a per-judge summary, and the public payload carries neither the raw
 * score nor anything about a judge.
 *
 * It covers which evaluations count (every rating, whether or not a written
 * response is missing, as with a draft submitted at the deadline), and the
 * calibration the list keeps for a minute, which compute never reads.
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
  judgingAppointments,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluationRatings,
  judgingEvaluationResponses,
  judgingEvaluations,
  judgingJudges,
  judgingPlacements,
  judgingRubricItems,
} from "@query/db";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";

const HACK = "11111111-1111-4111-8111-111111111111";
const ADMIN_ROW = { userId: "admin_user", isActive: true, role: "admin" };

const render = (condition: unknown) =>
  new PgDialect().sqlToQuery(condition as never);

type Query = {
  table: unknown;
  wheres: unknown[];
  /** The columns the select asked for, to tell two reads of one table apart. */
  fields?: Record<string, unknown>;
};

const mockSelect = vi.fn<(query: Query) => unknown[]>();
const mockFindMany = vi.fn();
const inserts: { table: unknown; values: any }[] = [];
const deletes: unknown[] = [];

const settled = <T>(value: T) => Object.assign(Promise.resolve(value), {});

const selectChain = (fields?: Record<string, unknown>) => {
  const query: Query = { table: null, wheres: [], fields };
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
  select: (fields?: Record<string, unknown>) => selectChain(fields),
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
  const evaluationRow = (
    id: string,
    entryId: string,
    judgeId: string,
    minute: number,
  ) => ({
    id,
    entryId,
    challengeId: "ch-1",
    judgeId,
    submittedAt: new Date(Date.UTC(2027, 1, 6, 10, minute)),
  });
  // One judge marked all three. With the pulled team left out of the
  // calibration she has two grades, a mean of 3.5 and the pool's own spread, so
  // nothing about her scores moves; with it counted, they would.
  const scored = [
    evaluationRow("eval-a", "entry-a", "judge-1", 0),
    evaluationRow("eval-b", "entry-b", "judge-1", 1),
    evaluationRow("eval-c", "entry-c", "judge-1", 2),
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
      // One rating item, which every evaluation here rated.
      if (table === judgingRubricItems) return [{ n: 1 }];
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
    expect(placed.map((row) => row.rawScore)).toEqual(["4.00", "3.00"]);
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

describe("judging.results.compute with judge calibration", () => {
  const entries = ["e1", "e2", "e3", "e4"].map((id) => ({
    id,
    deletedAt: null,
    prizeIneligibleAt: null,
  }));
  const evaluation = (
    id: string,
    entryId: string,
    judgeId: string,
    minute: number,
  ) => ({
    id,
    entryId,
    challengeId: "ch-1",
    judgeId,
    submittedAt: new Date(Date.UTC(2027, 1, 6, 10, minute)),
  });

  // A strict judge marked e1 and e2, a lenient one e3 and e4. Raw, e2 and e3
  // tie on 4.00 and the lenient judge's e4 runs away with first.
  const wire = () =>
    mockSelect.mockImplementation(({ table }) => {
      if (table === hackathons) {
        return [
          { id: HACK, name: "Hacklytics", startDate: null, endDate: null },
        ];
      }
      if (table === judgingEvaluationDrafts) return [];
      if (table === judgingConfigs) return [{ hackathonId: HACK }];
      if (table === judgingPlacements) return [{ n: 0 }];
      if (table === judgingEntries) return entries;
      if (table === judgingEvaluations) {
        return [
          evaluation("v1", "e1", "strict", 0),
          evaluation("v2", "e2", "strict", 1),
          evaluation("v3", "e3", "lenient", 2),
          evaluation("v4", "e4", "lenient", 3),
        ];
      }
      if (table === judgingEvaluationRatings) {
        return [
          { evaluationId: "v1", value: 3 },
          { evaluationId: "v2", value: 4 },
          { evaluationId: "v3", value: 4 },
          { evaluationId: "v4", value: 5 },
        ];
      }
      if (table === judgingRubricItems) return [{ n: 1 }];
      return [];
    });

  it("stores the judge-adjusted score with the raw mean beside it", async () => {
    wire();

    await adminCaller().judging.results.compute({ hackathonId: HACK });

    // Pool mean 4. Two grades each gives an offset of 2/5 of the 0.5 gap: the
    // strict judge is lifted 0.2, the lenient one lowered 0.2. Both spread
    // their marks by the same 0.5, so neither is stretched.
    expect(
      placementsInserted().map((row) => [
        row.entryId,
        row.placement,
        row.score,
        row.rawScore,
      ]),
    ).toEqual([
      ["e4", 1, "4.80", "5.00"],
      ["e2", 2, "4.20", "4.00"],
      ["e3", 3, "3.80", "4.00"],
      ["e1", 4, "3.20", "3.00"],
    ]);
  });
});

// ---------------------------------------------------------------------------
describe("judging.results.compute with grades submitted at the deadline", () => {
  const entries = ["entry-a", "entry-b", "entry-c"].map((id) => ({
    id,
    deletedAt: null,
    prizeIneligibleAt: null,
  }));
  const evaluation = (
    id: string,
    entryId: string,
    minute: number,
    isComplete: boolean,
  ) => ({
    id,
    entryId,
    challengeId: "ch-1",
    judgeId: "judge-1",
    submittedAt: new Date(Date.UTC(2027, 1, 6, 10, minute)),
    isComplete,
  });
  // A rubric of two rating items. entry-a's only grade is an auto-submit: both
  // ratings, a required response left empty, so isComplete is false. entry-b's
  // stopped after one rating. entry-c's is whole.
  const stored = [
    evaluation("eval-a", "entry-a", 0, false),
    evaluation("eval-b", "entry-b", 1, false),
    evaluation("eval-c", "entry-c", 2, true),
  ];
  const ratings = [
    { evaluationId: "eval-a", value: 4 },
    { evaluationId: "eval-a", value: 4 },
    { evaluationId: "eval-b", value: 5 },
    { evaluationId: "eval-c", value: 3 },
    { evaluationId: "eval-c", value: 3 },
  ];
  let evaluationWheres: unknown[] = [];
  let ratingWheres: unknown[] = [];

  const wire = () => {
    evaluationWheres = [];
    ratingWheres = [];
    mockSelect.mockImplementation(({ table, wheres }) => {
      if (table === hackathons) {
        return [
          { id: HACK, name: "Hacklytics", startDate: null, endDate: null },
        ];
      }
      if (table === judgingEvaluationDrafts) return [];
      if (table === judgingConfigs) return [{ hackathonId: HACK }];
      if (table === judgingPlacements) return [{ n: 0 }];
      if (table === judgingEntries) return entries;
      if (table === judgingRubricItems) return [{ n: 2 }];
      if (table === judgingEvaluations) {
        evaluationWheres = wheres;
        return stored;
      }
      if (table === judgingEvaluationRatings) {
        ratingWheres = wheres;
        return ratings;
      }
      return [];
    });
  };

  it("places a project whose only grade is such an auto-submit", async () => {
    wire();

    const result = await adminCaller().judging.results.compute({
      hackathonId: HACK,
    });

    const placed = placementsInserted();
    expect(
      placed.map((row) => [row.entryId, row.scope, row.placement, row.score]),
    ).toEqual([
      ["entry-a", "overall", 1, "4.00"],
      ["entry-c", "overall", 2, "3.00"],
    ]);
    expect(placed.map((row) => row.evaluationCount)).toEqual([1, 1]);
    expect(result.placements).toBe(2);
  });

  it("leaves a grade short of a rating out, and does not count it as ranked", async () => {
    wire();

    const result = await adminCaller().judging.results.compute({
      hackathonId: HACK,
    });

    expect(placementsInserted().map((row) => row.entryId)).not.toContain(
      "entry-b",
    );
    expect(result.evaluations).toBe(2);
  });

  it("does not filter evaluations or ratings on isComplete", async () => {
    wire();

    await adminCaller().judging.results.compute({ hackathonId: HACK });

    expect(evaluationWheres.length).toBeGreaterThan(0);
    expect(ratingWheres.length).toBeGreaterThan(0);
    for (const where of [...evaluationWheres, ...ratingWheres]) {
      expect(render(where).sql).not.toContain("is_complete");
      expect(render(where).params).toContain(HACK);
    }
  });

  it("asks the rubric how many rating items an evaluation must have", async () => {
    wire();

    await adminCaller().judging.results.compute({ hackathonId: HACK });

    const rubric = mockSelect.mock.calls.find(
      ([query]) => query.table === judgingRubricItems,
    )![0];
    expect(render(rubric.wheres[0]).params).toEqual([HACK, "rating"]);
  });
});

// ---------------------------------------------------------------------------
describe("judging.results.compute beside the list's calibration cache", () => {
  const entries = ["e1", "e2", "e3", "e4"].map((id) => ({
    id,
    deletedAt: null,
    prizeIneligibleAt: null,
  }));
  const evaluation = (
    id: string,
    entryId: string,
    judgeId: string,
    minute: number,
  ) => ({
    id,
    entryId,
    challengeId: "ch-1",
    judgeId,
    submittedAt: new Date(Date.UTC(2027, 1, 6, 10, minute)),
  });
  const stored = [
    evaluation("v1", "e1", "strict", 0),
    evaluation("v2", "e2", "strict", 1),
    evaluation("v3", "e3", "lenient", 2),
    evaluation("v4", "e4", "lenient", 3),
  ];
  let ratings = [
    { evaluationId: "v1", value: 3 },
    { evaluationId: "v2", value: 4 },
    { evaluationId: "v3", value: 4 },
    { evaluationId: "v4", value: 5 },
  ];
  const computedAt = new Date("2027-02-07T09:00:00Z");

  beforeEach(() => {
    ratings = [
      { evaluationId: "v1", value: 3 },
      { evaluationId: "v2", value: 4 },
      { evaluationId: "v3", value: 4 },
      { evaluationId: "v4", value: 5 },
    ];
  });

  // The same edition answers both procedures. Placements come back as rows for
  // the list and as a published count for compute, which asks for `n`.
  const wire = () =>
    mockSelect.mockImplementation(({ table, fields }) => {
      if (table === hackathons) {
        return [
          { id: HACK, name: "Hacklytics", startDate: null, endDate: null },
        ];
      }
      if (table === judgingPlacements) {
        return fields && "n" in fields
          ? [{ n: 0 }]
          : [
              {
                id: "p1",
                scope: "overall",
                scopeLabel: "Overall",
                placement: 1,
                score: "4.00",
                evaluationCount: 1,
                publishedAt: null,
                computedAt,
                entryId: "e1",
                title: "Project e1",
                deletedAt: null,
                prizeIneligibleAt: null,
              },
            ];
      }
      if (table === judgingEvaluationDrafts) return [];
      if (table === judgingConfigs) return [{ hackathonId: HACK }];
      if (table === judgingEntries) {
        return fields && "latest" in fields
          ? [{ n: 4, latest: new Date("2027-02-06T09:00:00Z") }]
          : entries;
      }
      if (table === judgingEvaluations) {
        if (fields && "latest" in fields) {
          return [{ n: 4, latest: new Date("2027-02-06T11:00:00Z") }];
        }
        return fields && "n" in fields ? [{ n: 0 }] : stored;
      }
      if (table === judgingRubricItems) return [{ n: 1 }];
      if (table === judgingEvaluationRatings) return ratings;
      if (table === judgingJudges) {
        return [
          { id: "strict", displayName: "Sam Strict", kind: "member" },
          { id: "lenient", displayName: "Lee Lenient", kind: "member" },
        ];
      }
      if (table === judgingChallenges) {
        return [{ id: "ch-1", label: "General" }];
      }
      return [];
    });

  const ratingReads = () =>
    mockSelect.mock.calls.filter(
      ([query]) => query.table === judgingEvaluationRatings,
    ).length;

  it("ranks on the evaluations as they stand, whatever the list has cached", async () => {
    wire();
    const getOrSet = vi.spyOn(cache, "getOrSet");

    // The list fills the cache, and a second poll is answered from it.
    await adminCaller().judging.results.list({ hackathonId: HACK });
    await adminCaller().judging.results.list({ hackathonId: HACK });
    expect(ratingReads()).toBe(1);
    expect(getOrSet).toHaveBeenCalledTimes(2);

    // A rating changes under it, with nothing the cache key could see.
    ratings = ratings.map((rating) =>
      rating.evaluationId === "v4" ? { ...rating, value: 1 } : rating,
    );
    await adminCaller().judging.results.compute({ hackathonId: HACK });

    // Compute read the ratings itself and did not touch the cache.
    expect(ratingReads()).toBe(2);
    expect(getOrSet).toHaveBeenCalledTimes(2);
    // v4 is the lenient judge's lowest now, so e4 ranks last.
    expect(placementsInserted().at(-1)?.entryId).toBe("e4");
    getOrSet.mockRestore();
  });

  it("reads the ratings again on every compute", async () => {
    wire();

    await adminCaller().judging.results.compute({ hackathonId: HACK });
    await adminCaller().judging.results.compute({ hackathonId: HACK });

    expect(ratingReads()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe("judging.results.list", () => {
  // What the calibration cache key is read from: the edition's evaluations and
  // its ranked entries, each a count and a latest save. A test changes one
  // between two lists to stand for a save, a reopen or a pulled team.
  const stamps = {
    evaluations: { n: 4, latest: new Date("2027-02-06T11:00:00Z") } as Record<
      string,
      unknown
    >,
    entries: { n: 6, latest: new Date("2027-02-06T09:00:00Z") } as Record<
      string,
      unknown
    >,
  };
  beforeEach(() => {
    stamps.evaluations = { n: 4, latest: new Date("2027-02-06T11:00:00Z") };
    stamps.entries = { n: 6, latest: new Date("2027-02-06T09:00:00Z") };
  });

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
    /** Live entries, as the calibration summary reads them. */
    live?: unknown[];
    /** Complete evaluations, as the calibration summary reads them. */
    evaluations?: unknown[];
    ratings?: unknown[];
    /** Rating items on the rubric. The fixtures rate one each unless said. */
    ratingItems?: number;
    judges?: unknown[];
    challenges?: unknown[];
  }) => {
    mockSelect.mockImplementation(({ table, fields }) => {
      if (table === judgingPlacements) return opts.placements;
      // The cache key reads a count and a latest time, the stale count reads
      // a count alone, and the calibration summary reads many columns.
      if (table === judgingEvaluations) {
        if (fields && "latest" in fields) return [stamps.evaluations];
        return fields && "n" in fields ? [{ n: 0 }] : (opts.evaluations ?? []);
      }
      if (table === judgingRubricItems) return [{ n: opts.ratingItems ?? 1 }];
      if (table === judgingEvaluationRatings) return opts.ratings ?? [];
      if (table === judgingJudges) return opts.judges ?? [];
      if (table === judgingChallenges) return opts.challenges ?? [];
      if (table === hackathonCheckInFlags) return opts.flags ?? [];
      if (table === hackathonEvents) {
        return [
          { id: "event-1", name: "Opening Workshop" },
          { id: "event-2", name: "Sponsor Talk" },
        ];
      }
      if (table === judgingEntries) {
        if (fields && "latest" in fields) return [stamps.entries];
        return opts.portal ?? opts.live ?? [];
      }
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
      "rawScore",
      "score",
      "title",
      "withdrawn",
    ]);
  });

  it("returns the raw score beside the adjusted one, and null on older rows", async () => {
    wire({
      placements: [
        placement("p1", "entry-a", { score: "4.20", rawScore: "3.90" }),
        placement("p2", "entry-b", { placement: 2, rawScore: null }),
      ],
    });

    const data = await adminCaller().judging.results.list({
      hackathonId: HACK,
    });

    const byEntry = Object.fromEntries(
      rowsOf(data).map((row) => [row.entryId, row]),
    ) as Record<string, any>;
    expect(byEntry["entry-a"].score).toBe(4.2);
    expect(byEntry["entry-a"].rawScore).toBe(3.9);
    expect(byEntry["entry-b"].rawScore).toBeNull();
  });

  describe("judge calibration summary", () => {
    const graded = (
      id: string,
      entryId: string,
      judgeId: string,
      challengeId: string,
      minute: number,
    ) => ({
      id,
      entryId,
      challengeId,
      judgeId,
      submittedAt: new Date(Date.UTC(2027, 1, 6, 10, minute)),
    });
    const challenges = [
      { id: "ch-sponsor", label: "Sponsor Prize" },
      { id: "ch-general", label: "General" },
    ];
    const judges = [
      { id: "strict", displayName: "Sam Strict", kind: "member" },
      { id: "lenient", displayName: "Lee Lenient", kind: "guest" },
      { id: "sponsor-guest", displayName: "Gus Guest", kind: "guest" },
    ];
    // Six table grades by two judges, and two by the sponsor's own guest.
    const table = [
      ["g1", "strict", 3],
      ["g2", "strict", 3],
      ["g3", "strict", 4],
      ["g4", "lenient", 4],
      ["g5", "lenient", 5],
      ["g6", "lenient", 5],
    ] as const;
    const evaluations = [
      ...table.map(([id, judgeId], i) =>
        graded(id, `entry-${i}`, judgeId, "ch-general", i),
      ),
      graded("s1", "entry-0", "sponsor-guest", "ch-sponsor", 10),
      graded("s2", "entry-1", "sponsor-guest", "ch-sponsor", 11),
    ];
    const ratings = [
      ...table.map(([id, , value]) => ({ evaluationId: id, value })),
      { evaluationId: "s1", value: 2 },
      { evaluationId: "s2", value: 2 },
    ];
    const live = Array.from({ length: 6 }, (_, i) => ({ id: `entry-${i}` }));

    it("is computed on read, per challenge, one row for each judge", async () => {
      wire({
        placements: [placement("p1", "entry-0")],
        evaluations,
        ratings,
        judges,
        challenges,
        live,
      });

      const data = await adminCaller().judging.results.list({
        hackathonId: HACK,
      });

      expect(data.calibration.map((c) => c.challenge)).toEqual([
        "Sponsor Prize",
        "General",
      ]);
      const [sponsor, general] = data.calibration;
      // The sponsor's guest is compared with no one at the tables.
      expect(sponsor!.judges).toHaveLength(1);
      expect(sponsor!.judges[0]).toMatchObject({
        judgeName: "Gus Guest",
        kind: "guest",
        grades: 2,
        offset: 0,
        spread: 1,
        drift: 0,
      });
      expect(general!.judges.map((j) => [j.judgeName, j.grades])).toEqual([
        ["Lee Lenient", 3],
        ["Sam Strict", 3],
      ]);
      const [lee, sam] = general!.judges;
      expect(lee!.offset).toBeGreaterThan(0);
      expect(sam!.offset).toBeLessThan(0);
      // Rounded to two places.
      for (const judge of general!.judges) {
        for (const value of [judge.offset, judge.spread, judge.drift]) {
          expect(value).toBe(Math.round(value * 100) / 100);
        }
      }
    });

    it("leaves a team pulled from prizes out of the summary", async () => {
      wire({
        placements: [placement("p1", "entry-0")],
        evaluations,
        ratings,
        judges,
        challenges,
        // Only the first four teams are live and prize-eligible.
        live: live.slice(0, 4),
      });

      const data = await adminCaller().judging.results.list({
        hackathonId: HACK,
      });

      const general = data.calibration.find((c) => c.challenge === "General");
      expect(general!.judges.map((j) => j.grades)).toEqual([1, 3]);
    });

    it("is empty before anything is computed", async () => {
      wire({ placements: [], evaluations, ratings, judges, challenges, live });

      const data = await adminCaller().judging.results.list({
        hackathonId: HACK,
      });

      expect(data.calibration).toEqual([]);
    });

    it("counts a grade submitted at the deadline with every rating, and not one short of a rating", async () => {
      // Two rating items. g1 is an auto-submit: all its ratings, a response
      // left empty, so the evaluation is incomplete. g3 stopped after one.
      const two = [
        { ...evaluations[0]!, isComplete: false },
        evaluations[1]!,
        evaluations[2]!,
      ];
      const rated = [
        { evaluationId: "g1", value: 3 },
        { evaluationId: "g1", value: 3 },
        { evaluationId: "g2", value: 3 },
        { evaluationId: "g2", value: 3 },
        { evaluationId: "g3", value: 4 },
      ];
      wire({
        placements: [placement("p1", "entry-0")],
        evaluations: two,
        ratings: rated,
        ratingItems: 2,
        judges,
        challenges,
        live,
      });

      const data = await adminCaller().judging.results.list({
        hackathonId: HACK,
      });

      const general = data.calibration.find((c) => c.challenge === "General");
      expect(general!.judges.map((j) => [j.judgeName, j.grades])).toEqual([
        ["Sam Strict", 2],
      ]);
    });

    describe("cache", () => {
      const list = () =>
        adminCaller().judging.results.list({ hackathonId: HACK });
      // The heavy read: every rating of the edition.
      const calibrations = () =>
        mockSelect.mock.calls.filter(
          ([query]) => query.table === judgingEvaluationRatings,
        ).length;
      const setUp = () =>
        wire({
          placements: [placement("p1", "entry-0")],
          evaluations,
          ratings,
          judges,
          challenges,
          live,
        });

      it("calibrates once for polls that find nothing changed", async () => {
        setUp();

        const first = await list();
        const second = await list();
        const third = await list();

        expect(calibrations()).toBe(1);
        expect(second.calibration).toEqual(first.calibration);
        expect(third.calibration).toEqual(first.calibration);
        expect(first.calibration.length).toBeGreaterThan(0);
      });

      it("calibrates again when an evaluation is added or deleted", async () => {
        setUp();
        await list();

        stamps.evaluations = { ...stamps.evaluations, n: 5 };
        await list();
        expect(calibrations()).toBe(2);

        // Two grades reopened, the newest among them: fewer, and an earlier
        // latest save.
        stamps.evaluations = {
          n: 3,
          latest: new Date("2027-02-06T10:30:00Z"),
        };
        await list();
        expect(calibrations()).toBe(3);
      });

      it("calibrates again when an evaluation is edited", async () => {
        setUp();
        await list();

        // Same count, saved later.
        stamps.evaluations = {
          ...stamps.evaluations,
          latest: new Date("2027-02-06T11:05:00Z"),
        };
        await list();

        expect(calibrations()).toBe(2);
      });

      it("calibrates again when a team is pulled from prizes or put back", async () => {
        setUp();
        await list();

        stamps.entries = { n: 5, latest: new Date("2027-02-07T08:00:00Z") };
        await list();
        expect(calibrations()).toBe(2);

        // Back in, a moment later: the count is as it was, the time is not.
        stamps.entries = { n: 6, latest: new Date("2027-02-07T08:01:00Z") };
        await list();
        expect(calibrations()).toBe(3);
      });

      it("keys the result by edition and by what it was computed from", async () => {
        setUp();
        const getOrSet = vi.spyOn(cache, "getOrSet");

        await list();

        expect(getOrSet).toHaveBeenCalledTimes(1);
        const [key, , ttl] = getOrSet.mock.calls[0]!;
        const latest = (stamps.evaluations.latest as Date).getTime();
        const entries = (stamps.entries.latest as Date).getTime();
        expect(key).toBe(
          `judging:${HACK}:calibration:4:${latest}:6:${entries}`,
        );
        expect(ttl).toBe(60);
        getOrSet.mockRestore();
      });

      it("does not share a result between editions", async () => {
        setUp();
        await list();

        await adminCaller().judging.results.list({
          hackathonId: "99999999-9999-4999-8999-999999999999",
        });

        expect(calibrations()).toBe(2);
      });

      it("keeps the result for a minute and no longer", async () => {
        setUp();
        const getOrSet = vi.spyOn(cache, "getOrSet");
        await list();
        const key = getOrSet.mock.calls[0]![0];
        getOrSet.mockRestore();

        // Only the clock the cache reads is moved: the router's own rate
        // limiter keeps real time.
        const clock = vi.spyOn(Date, "now");
        const now = Date.now();
        try {
          clock.mockReturnValue(now + 59_000);
          expect(cache.has(key)).toBe(true);
          clock.mockReturnValue(now + 61_000);
          expect(cache.has(key)).toBe(false);
        } finally {
          clock.mockRestore();
        }
      });
    });
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
describe("the organiser's evaluation views with a grade short of a response", () => {
  const APPOINTMENT = "33333333-3333-4333-8333-333333333333";
  const at = new Date("2027-02-06T11:00:00Z");
  // A rubric of two rating items. Judge A's grade was submitted at the
  // deadline with both ratings and a response left empty. B's is whole. C's
  // stopped after one rating.
  const evaluations = [
    {
      id: "eval-a",
      entryId: "entry-1",
      title: "Project 1",
      challengeId: "ch-1",
      challenge: "General",
      judgeId: "judge-a",
      judgeName: "Ada Auto",
      kind: "member",
      appointmentId: APPOINTMENT,
      isComplete: false,
      revision: 1,
      submittedAt: at,
      autoSubmittedAt: at,
      updatedAt: at,
    },
    {
      id: "eval-b",
      entryId: "entry-1",
      title: "Project 1",
      challengeId: "ch-1",
      challenge: "General",
      judgeId: "judge-b",
      judgeName: "Bea Whole",
      kind: "member",
      appointmentId: APPOINTMENT,
      isComplete: true,
      revision: 1,
      submittedAt: at,
      autoSubmittedAt: null,
      updatedAt: at,
    },
    {
      id: "eval-c",
      entryId: "entry-1",
      title: "Project 1",
      challengeId: "ch-1",
      challenge: "General",
      judgeId: "judge-c",
      judgeName: "Cy Short",
      kind: "member",
      appointmentId: APPOINTMENT,
      isComplete: false,
      revision: 1,
      submittedAt: at,
      autoSubmittedAt: at,
      updatedAt: at,
    },
  ];
  const rating = (
    evaluationId: string,
    item: "one" | "two",
    value: number,
  ) => ({
    evaluationId,
    itemId: `item-${item}`,
    label: item === "one" ? "Impact" : "Craft",
    value,
  });
  const ratings = [
    rating("eval-a", "one", 5),
    rating("eval-a", "two", 3),
    rating("eval-b", "one", 4),
    rating("eval-b", "two", 4),
    rating("eval-c", "one", 2),
  ];

  const wire = () =>
    mockSelect.mockImplementation(({ table, fields }) => {
      if (table === judgingEvaluationDrafts) return [];
      if (table === judgingRubricItems) return [{ n: 2 }];
      if (table === judgingEvaluationRatings) return ratings;
      if (table === judgingEvaluationResponses) return [];
      if (table === judgingAppointments) {
        return [
          {
            id: APPOINTMENT,
            entryId: "entry-1",
            challengeId: "ch-1",
            startsAt: at,
            endsAt: at,
            title: "Project 1",
            challenge: "General",
            room: "Table 1",
            building: null,
          },
        ];
      }
      if (table === judgingEvaluations) {
        // The "elsewhere" check reads the id alone; the rest read the judge.
        return fields && "judgeName" in fields ? evaluations : [];
      }
      return [];
    });

  describe("appointmentResults", () => {
    const results = () =>
      adminCaller().judging.results.appointmentResults({
        hackathonId: HACK,
        appointmentId: APPOINTMENT,
      });

    it("counts a grade with every rating, whether or not it is complete", async () => {
      wire();

      const data = await results();

      const byName = Object.fromEntries(
        data.judges.map((judge) => [judge.judgeName, judge]),
      );
      expect(byName["Ada Auto"]).toMatchObject({
        status: "incomplete",
        autoSubmitted: true,
        counted: true,
        score: 4,
      });
      expect(byName["Ada Auto"]!.ratings.map((r) => r.value)).toEqual([5, 3]);
      expect(byName["Bea Whole"]).toMatchObject({
        status: "complete",
        counted: true,
        score: 4,
      });
    });

    it("leaves a grade short of a rating out of the score and the average", async () => {
      wire();

      const data = await results();

      const short = data.judges.find((judge) => judge.judgeName === "Cy Short");
      expect(short).toMatchObject({ counted: false, score: null, ratings: [] });
      expect(data.countedCount).toBe(2);
      expect(data.average).toBe(4);
    });
  });

  describe("evaluationAudit", () => {
    it("says which evaluations the placings count", async () => {
      wire();

      const rows = await adminCaller().judging.results.evaluationAudit({
        hackathonId: HACK,
      });

      expect(rows.map((row) => [row.id, row.isComplete, row.counted])).toEqual([
        ["eval-a", false, true],
        ["eval-b", true, true],
        ["eval-c", false, false],
      ]);
    });
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
    // Stored beside the score; it must never leave in the public payload.
    rawScore: "3.75",
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
      "entryId",
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
    expect(text).not.toContain("3.75");
    expect(text).not.toContain("calibrat");
    // The cached payload is built from placements alone: no select, so no
    // flag table, ran for it.
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("lists a portal project's repository as code, never as its demo", async () => {
    const repo = "https://github.com/team/project";
    wire([
      placementRow("a", {
        // Promotion stores the repository among the demo links.
        demoLinks: [repo],
        sourceProject: { id: "p-a", githubUrl: repo, demoUrl: null, team: null },
      }),
      placementRow("b", {
        demoLinks: ["https://b.example.com", repo],
        sourceProject: {
          id: "p-b",
          githubUrl: repo,
          demoUrl: "https://b.example.com",
          team: null,
        },
      }),
      placementRow("c", { demoLinks: ["https://c.example.com"] }),
    ]);

    const results = await anonCaller().hackathon.getResults({
      hackathonId: HACK,
    });

    const byName = new Map(results.map((row) => [row.projectName, row]));
    expect(byName.get("Project a")).toMatchObject({
      githubUrl: repo,
      demoUrl: null,
    });
    expect(byName.get("Project b")?.demoUrl).toBe("https://b.example.com");
    // A Devpost entry has only its "Try it out" links.
    expect(byName.get("Project c")?.demoUrl).toBe("https://c.example.com");
  });

  it("names each placing's entry, so a solo project can be found", async () => {
    wire([placementRow("a")]);

    const results = await anonCaller().hackathon.getResults({
      hackathonId: HACK,
    });

    expect(
      results.find((row) => row.projectName === "Project a")?.entryId,
    ).toBe("entry-a");
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
