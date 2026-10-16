import { afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import {
  hackathonCheckInFlags,
  hackathonEvents,
  judgingEntries,
  judgingEntryMembers,
} from "@query/db";
import type { DrizzleDB } from "@query/db";
import {
  checkInFlagsForEntries,
  entriesForFlags,
  flaggedEntryIds,
  flaggingRuleBreaks,
  openCheckInFlagCount,
  recordCheckInFlag,
} from "./check-in-flags";
import { CheckInRuleBreak } from "./points";
import type { CheckInRuleBreakDetails } from "./points";

const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const AT = new Date("2027-02-06T18:00:00Z");

const breach: CheckInRuleBreakDetails = {
  participantId: "part-1",
  eventId: "event-2",
  conflictEventId: "event-1",
  rule: "overlap",
  method: "code",
  actorId: "user-1",
  at: AT,
};

const render = (condition: unknown) =>
  new PgDialect().sqlToQuery(condition as never);

// ---------------------------------------------------------------------------
// The table

describe("hackathonCheckInFlags", () => {
  const foreignKey = (name: string) =>
    getTableConfig(hackathonCheckInFlags).foreignKeys.find(
      (key) => key.getName() === name,
    )!;

  // Deleting an event must not delete the record that someone broke the rules
  // at it: prize review reads these long after a session is cancelled.
  it.each([
    ["event_id", "check_in_flag_event_fk", hackathonCheckInFlags.eventId],
    [
      "conflict_event_id",
      "check_in_flag_conflict_event_fk",
      hackathonCheckInFlags.conflictEventId,
    ],
  ])(
    "keeps the flag and clears %s when that event is deleted",
    (_, name, column) => {
      const key = foreignKey(name);
      expect(key.reference().foreignTable).toBe(hackathonEvents);
      expect(key.onDelete).toBe("set null");
      expect(column.notNull).toBe(false);
    },
  );

  it("still goes with its participant", () => {
    const key = foreignKey("check_in_flag_participant_fk");
    expect(key.onDelete).toBe("cascade");
    expect(hackathonCheckInFlags.participantId.notNull).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Writing

describe("recordCheckInFlag", () => {
  const fakeInsertDb = () => {
    const writes: {
      table: unknown;
      values: Record<string, unknown>;
      conflict: { target: unknown[]; set: Record<string, unknown> };
    }[] = [];
    const db = {
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async (conflict: {
            target: unknown[];
            set: Record<string, unknown>;
          }) => {
            writes.push({ table, values, conflict });
          },
        }),
      }),
    };
    return { db: db as unknown as DrizzleDB, writes };
  };

  it("inserts one row for the person, the event tried and the event they were in", async () => {
    const { db, writes } = fakeInsertDb();
    await recordCheckInFlag(db, HACK, breach);

    expect(writes).toHaveLength(1);
    expect(writes[0]!.table).toBe(hackathonCheckInFlags);
    // Both timestamps come from the clock the rule was judged on, not from the
    // database's now().
    expect(writes[0]!.values).toEqual({
      hackathonId: HACK,
      participantId: "part-1",
      eventId: "event-2",
      conflictEventId: "event-1",
      rule: "overlap",
      method: "code",
      attemptedById: "user-1",
      attempts: 1,
      createdAt: AT,
      lastAttemptAt: AT,
    });
  });

  it("counts a repeat instead of adding a row, and leaves the dismissal alone", async () => {
    const { db, writes } = fakeInsertDb();
    await recordCheckInFlag(db, HACK, breach);

    const { target, set } = writes[0]!.conflict;
    expect(target).toEqual([
      hackathonCheckInFlags.participantId,
      hackathonCheckInFlags.eventId,
      hackathonCheckInFlags.conflictEventId,
    ]);
    expect(Object.keys(set).sort()).toEqual(["attempts", "lastAttemptAt"]);
    expect(set.lastAttemptAt).toBe(AT);
    expect(render(set.attempts).sql).toBe(
      '"hackathon_check_in_flag"."attempts" + 1',
    );
  });

  it("keeps the staff member as the one who tried when there is no hacker", async () => {
    const { db, writes } = fakeInsertDb();
    await recordCheckInFlag(db, HACK, {
      ...breach,
      method: "scan",
      rule: "too_soon",
      actorId: null,
    });
    expect(writes[0]!.values).toMatchObject({
      method: "scan",
      rule: "too_soon",
      attemptedById: null,
    });
  });
});

describe("flaggingRuleBreaks", () => {
  afterEach(() => vi.restoreAllMocks());

  const refusal = () =>
    new TRPCError({
      code: "FORBIDDEN",
      message: "You're already checked into BNY Workshop.",
      cause: new CheckInRuleBreak(breach),
    });

  // A pool whose insert chain ends in `onConflictDoUpdate`, noting each flag.
  const pool = (opts: { failWith?: Error } = {}) => {
    const flags: unknown[] = [];
    const db = {
      insert: () => ({
        values: (values: unknown) => ({
          onConflictDoUpdate: async () => {
            if (opts.failWith) throw opts.failWith;
            flags.push(values);
          },
        }),
      }),
    };
    return { db: db as unknown as DrizzleDB, flags };
  };

  it("returns what the write returned and records nothing", async () => {
    const { db, flags } = pool();
    await expect(
      flaggingRuleBreaks(db, HACK, async () => ({ pointsAwarded: 5 })),
    ).resolves.toEqual({ pointsAwarded: 5 });
    expect(flags).toEqual([]);
  });

  it("records a refusal for the check-in rules and rethrows the same error", async () => {
    const { db, flags } = pool();
    const error = refusal();

    const caught = await flaggingRuleBreaks(db, HACK, async () => {
      throw error;
    }).catch((e: unknown) => e);

    expect(caught).toBe(error);
    expect(flags).toEqual([
      expect.objectContaining({
        hackathonId: HACK,
        participantId: "part-1",
        eventId: "event-2",
        conflictEventId: "event-1",
        rule: "overlap",
        method: "code",
        attemptedById: "user-1",
      }),
    ]);
  });

  it("ignores every other failure", async () => {
    for (const error of [
      new Error("connection reset"),
      new TRPCError({ code: "CONFLICT", message: "Already checked in." }),
      new TRPCError({
        code: "FORBIDDEN",
        message: "Not accepted.",
        cause: new Error("something else"),
      }),
      // A cause shaped like a rule break is not one.
      new TRPCError({
        code: "FORBIDDEN",
        message: "Lookalike.",
        cause: Object.assign(new Error("lookalike"), { ...breach }),
      }),
    ]) {
      const { db, flags } = pool();
      const caught = await flaggingRuleBreaks(db, HACK, async () => {
        throw error;
      }).catch((e: unknown) => e);
      expect(caught).toBe(error);
      expect(flags).toEqual([]);
    }
  });

  it("still throws the original refusal when the flag cannot be written", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { db } = pool({ failWith: new Error("database is down") });
    const error = refusal();

    const caught = await flaggingRuleBreaks(db, HACK, async () => {
      throw error;
    }).catch((e: unknown) => e);

    // The person at the door reads the same sentence either way.
    expect(caught).toBe(error);
    expect((caught as TRPCError).code).toBe("FORBIDDEN");
    expect((caught as TRPCError).message).toBe(
      "You're already checked into BNY Workshop.",
    );
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("is not thrown off when the pool itself is unusable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = {
      insert: () => {
        throw new Error("pool is closed");
      },
    } as unknown as DrizzleDB;
    const error = refusal();

    await expect(
      flaggingRuleBreaks(db, HACK, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});

// ---------------------------------------------------------------------------
// Reading

describe("entriesForFlags", () => {
  const flag = (
    id: string,
    over: Partial<{
      participantId: string;
      teamId: string | null;
      userId: string;
    }> = {},
  ) => ({
    id,
    participantId: `part-${id}`,
    teamId: null as string | null,
    userId: `user-${id}`,
    ...over,
  });

  it("puts a hacker's flag on their team's portal entry", () => {
    const result = entriesForFlags(
      [flag("f1", { teamId: "team-1" })],
      [
        { entryId: "e-team", teamId: "team-1", submittedById: "part-cap" },
        { entryId: "e-other", teamId: "team-2", submittedById: "part-x" },
      ],
      [],
    );
    expect(result.get("f1")).toEqual(new Set(["e-team"]));
  });

  it("matches a solo project by who filed it", () => {
    const result = entriesForFlags(
      [flag("f1")],
      [
        { entryId: "e-solo", teamId: null, submittedById: "part-f1" },
        { entryId: "e-not-me", teamId: null, submittedById: "part-other" },
      ],
      [],
    );
    expect(result.get("f1")).toEqual(new Set(["e-solo"]));
  });

  it("does not treat a former captain as a member of the team's project", () => {
    // They filed it, then moved to team-2: only the team link counts for a
    // project that has a team.
    const result = entriesForFlags(
      [flag("f1", { teamId: "team-2" })],
      [{ entryId: "e-team-1", teamId: "team-1", submittedById: "part-f1" }],
      [],
    );
    expect(result.get("f1")).toEqual(new Set());
  });

  it("does not match teamless hackers to teamless projects by their missing team", () => {
    const result = entriesForFlags(
      [flag("f1", { teamId: null })],
      [{ entryId: "e-solo", teamId: null, submittedById: "part-other" }],
      [],
    );
    expect(result.get("f1")).toEqual(new Set());
  });

  it("matches a member by account, which covers Devpost entries and claimed teammates", () => {
    const result = entriesForFlags(
      [flag("f1")],
      [],
      [
        { entryId: "e-devpost", userId: "user-f1" },
        { entryId: "e-unclaimed", userId: null },
        { entryId: "e-else", userId: "user-else" },
      ],
    );
    expect(result.get("f1")).toEqual(new Set(["e-devpost"]));
  });

  it("counts an entry once however many ways the hacker reaches it", () => {
    const result = entriesForFlags(
      [flag("f1", { teamId: "team-1" })],
      [{ entryId: "e1", teamId: "team-1", submittedById: null }],
      [
        { entryId: "e1", userId: "user-f1" },
        { entryId: "e2", userId: "user-f1" },
      ],
    );
    expect(result.get("f1")).toEqual(new Set(["e1", "e2"]));
  });

  it("gives every flag an answer, empty when it is on nobody's entry", () => {
    const result = entriesForFlags(
      [flag("f1"), flag("f2", { teamId: "team-1" })],
      [{ entryId: "e1", teamId: "team-1", submittedById: null }],
      [],
    );
    expect(result.get("f1")).toEqual(new Set());
    expect(result.get("f2")).toEqual(new Set(["e1"]));
  });
});

describe("reading flags", () => {
  // A db that answers by the table a query reads from, and notes each query so
  // a test can say how many there were and what they asked for. It does not
  // evaluate any SQL, so the conditions are checked by rendering them.
  const fakeReadDb = (rows: Map<unknown, unknown[]>) => {
    const calls: {
      table: unknown;
      fields: Record<string, unknown>;
      where?: unknown;
    }[] = [];
    const db = {
      select: (fields: Record<string, unknown>) => ({
        from: (table: unknown) => {
          const call: (typeof calls)[number] = { table, fields };
          calls.push(call);
          // Chainable and awaitable, like a drizzle query.
          type Query = {
            innerJoin: () => Query;
            where: (condition: unknown) => Query;
            then: (
              resolve: (value: unknown) => unknown,
              reject: (reason: unknown) => unknown,
            ) => Promise<unknown>;
          };
          const node: Query = {
            innerJoin: () => node,
            where: (condition) => {
              call.where = condition;
              return node;
            },
            then: (resolve, reject) =>
              Promise.resolve(rows.get(table) ?? []).then(resolve, reject),
          };
          return node;
        },
      }),
    };
    return { db: db as unknown as DrizzleDB, calls };
  };

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
    teamId: null,
    userId: `user-${id}`,
    firstName: "Ada",
    lastName: "Lovelace",
    accountName: "ada l",
    email: "ada@example.com",
    ...over,
  });

  const events = [
    { id: "event-1", name: "BNY Workshop" },
    { id: "event-2", name: "Full Sail Fireside" },
  ];

  const table = (...entries: [unknown, unknown[]][]) => new Map(entries);

  describe("checkInFlagsForEntries", () => {
    it("asks nothing for an empty list of entries", async () => {
      const { db, calls } = fakeReadDb(table());
      const result = await checkInFlagsForEntries(db, HACK, []);
      expect(result.size).toBe(0);
      expect(calls).toEqual([]);
    });

    it("stops after one read when the edition has no flags", async () => {
      const { db, calls } = fakeReadDb(table());
      const result = await checkInFlagsForEntries(db, HACK, null);
      expect(result.size).toBe(0);
      expect(calls).toHaveLength(1);
    });

    it("describes each flag with names for organisers", async () => {
      const { db } = fakeReadDb(
        table(
          [
            hackathonCheckInFlags,
            [
              flagRow("f1", {
                teamId: "team-1",
                rule: "too_soon",
                method: "scan",
                attempts: 3,
              }),
            ],
          ],
          [hackathonEvents, events],
          [
            judgingEntries,
            [{ entryId: "e1", teamId: "team-1", submittedById: null }],
          ],
        ),
      );

      const result = await checkInFlagsForEntries(db, HACK, ["e1"]);

      expect(result.get("e1")).toEqual([
        {
          id: "f1",
          participantName: "Ada Lovelace",
          rule: "too_soon",
          eventName: "Full Sail Fireside",
          conflictEventName: "BNY Workshop",
          method: "scan",
          attempts: 3,
          createdAt: new Date("2027-02-06T18:00:00Z"),
          lastAttemptAt: new Date("2027-02-06T18:00:00Z"),
          dismissed: false,
        },
      ]);
    });

    it("still lists a flag whose event was deleted, under a stand-in name", async () => {
      const { db, calls } = fakeReadDb(
        table(
          [
            hackathonCheckInFlags,
            [flagRow("f1", { teamId: "team-1", eventId: null })],
          ],
          [hackathonEvents, events],
          [
            judgingEntries,
            [{ entryId: "e1", teamId: "team-1", submittedById: null }],
          ],
        ),
      );

      const [flag] = (await checkInFlagsForEntries(db, HACK, ["e1"])).get(
        "e1",
      )!;

      expect(flag).toMatchObject({
        id: "f1",
        eventName: "A deleted event",
        conflictEventName: "BNY Workshop",
      });
      // Only the events that still have an id are looked up.
      const lookup = render(
        calls.find((c) => c.table === hackathonEvents)!.where,
      );
      expect(lookup.params).toEqual(["event-1"]);
    });

    it("still lists a flag whose conflicting event was deleted", async () => {
      const { db } = fakeReadDb(
        table(
          [
            hackathonCheckInFlags,
            [flagRow("f1", { teamId: "team-1", conflictEventId: null })],
          ],
          [hackathonEvents, events],
          [
            judgingEntries,
            [{ entryId: "e1", teamId: "team-1", submittedById: null }],
          ],
        ),
      );

      const [flag] = (await checkInFlagsForEntries(db, HACK, ["e1"])).get(
        "e1",
      )!;

      expect(flag).toMatchObject({
        eventName: "Full Sail Fireside",
        conflictEventName: "A deleted event",
      });
    });

    it("still lists a flag when both events were deleted", async () => {
      const { db } = fakeReadDb(
        table(
          [
            hackathonCheckInFlags,
            [
              flagRow("f1", {
                teamId: "team-1",
                eventId: null,
                conflictEventId: null,
              }),
            ],
          ],
          [
            judgingEntries,
            [{ entryId: "e1", teamId: "team-1", submittedById: null }],
          ],
        ),
      );

      const [flag] = (await checkInFlagsForEntries(db, HACK, ["e1"])).get(
        "e1",
      )!;

      expect(flag).toMatchObject({
        eventName: "A deleted event",
        conflictEventName: "A deleted event",
        dismissed: false,
      });
    });

    it("falls back to the account name, then the email, when the registration has none", async () => {
      const { db } = fakeReadDb(
        table(
          [
            hackathonCheckInFlags,
            [
              flagRow("f1", { firstName: null, lastName: null }),
              flagRow("f2", {
                firstName: null,
                lastName: null,
                accountName: null,
              }),
            ],
          ],
          [hackathonEvents, events],
          [
            judgingEntryMembers,
            [
              { entryId: "e1", userId: "user-f1" },
              { entryId: "e1", userId: "user-f2" },
            ],
          ],
        ),
      );

      const flags = (await checkInFlagsForEntries(db, HACK, null)).get("e1")!;
      expect(flags.map((f) => f.participantName).sort()).toEqual([
        "ada l",
        "ada@example.com",
      ]);
    });

    it("lists open flags before cleared ones, newest attempt first", async () => {
      const t = (minute: number) => new Date(Date.UTC(2027, 1, 6, 18, minute));
      const { db } = fakeReadDb(
        table(
          [
            hackathonCheckInFlags,
            [
              flagRow("old-open", { lastAttemptAt: t(1) }),
              flagRow("cleared", {
                lastAttemptAt: t(30),
                dismissedAt: t(40),
              }),
              flagRow("new-open", { lastAttemptAt: t(20) }),
            ],
          ],
          [hackathonEvents, events],
          [
            judgingEntryMembers,
            ["old-open", "cleared", "new-open"].map((id) => ({
              entryId: "e1",
              userId: `user-${id}`,
            })),
          ],
        ),
      );

      const flags = (await checkInFlagsForEntries(db, HACK, ["e1"])).get("e1")!;
      expect(flags.map((f) => [f.id, f.dismissed])).toEqual([
        ["new-open", false],
        ["old-open", false],
        ["cleared", true],
      ]);
    });

    it("keeps to the entries asked for, and to every entry when asked for null", async () => {
      const rows = table(
        [hackathonCheckInFlags, [flagRow("f1", { teamId: "team-1" })]],
        [hackathonEvents, events],
        [
          judgingEntries,
          [
            { entryId: "e1", teamId: "team-1", submittedById: null },
            { entryId: "e2", teamId: "team-1", submittedById: null },
          ],
        ],
      );

      const some = await checkInFlagsForEntries(fakeReadDb(rows).db, HACK, [
        "e2",
        "e-unflagged",
      ]);
      expect([...some.keys()]).toEqual(["e2"]);

      const all = await checkInFlagsForEntries(fakeReadDb(rows).db, HACK, null);
      expect([...all.keys()].sort()).toEqual(["e1", "e2"]);
      // One flag, one description, wherever it shows.
      expect(all.get("e1")![0]).toBe(all.get("e2")![0]);
    });

    it("leaves out a flag whose hacker is on no entry", async () => {
      const { db } = fakeReadDb(
        table(
          [hackathonCheckInFlags, [flagRow("f1")]],
          [hackathonEvents, events],
        ),
      );
      const result = await checkInFlagsForEntries(db, HACK, null);
      expect(result.size).toBe(0);
    });

    it("reads in four batched queries however many flags there are", async () => {
      const many = Array.from({ length: 40 }, (_, i) =>
        flagRow(`f${i}`, { teamId: `team-${i}` }),
      );
      const { db, calls } = fakeReadDb(
        table([hackathonCheckInFlags, many], [hackathonEvents, events]),
      );

      await checkInFlagsForEntries(db, HACK, null);

      expect(calls.map((c) => c.table)).toEqual([
        hackathonCheckInFlags,
        hackathonEvents,
        judgingEntries,
        judgingEntryMembers,
      ]);
    });

    it("looks for live entries of this edition only", async () => {
      const { db, calls } = fakeReadDb(
        table(
          [hackathonCheckInFlags, [flagRow("f1", { teamId: "team-1" })]],
          [hackathonEvents, events],
        ),
      );
      await checkInFlagsForEntries(db, HACK, null);

      const portal = render(
        calls.find((c) => c.table === judgingEntries)!.where,
      );
      const members = render(
        calls.find((c) => c.table === judgingEntryMembers)!.where,
      );
      for (const query of [portal, members]) {
        expect(query.sql).toContain('"deleted_at" is null');
        expect(query.params).toContain(HACK);
      }
      expect(portal.params).toContain("portal");
      expect(portal.params).toContain("team-1");
      expect(members.params).toContain("user-f1");
    });
  });

  describe("flaggedEntryIds", () => {
    const target = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      participantId: `part-${id}`,
      teamId: null,
      userId: `user-${id}`,
      ...over,
    });

    it("asks nothing for an empty list of entries", async () => {
      const { db, calls } = fakeReadDb(table());
      expect(await flaggedEntryIds(db, HACK, [])).toEqual(new Set());
      expect(calls).toEqual([]);
    });

    it("returns only the asked-for entries that carry a flag", async () => {
      const { db } = fakeReadDb(
        table(
          [hackathonCheckInFlags, [target("f1", { teamId: "team-1" })]],
          [
            judgingEntries,
            [
              { entryId: "e1", teamId: "team-1", submittedById: null },
              { entryId: "e-not-asked", teamId: "team-1", submittedById: null },
            ],
          ],
        ),
      );
      const flagged = await flaggedEntryIds(db, HACK, ["e1", "e2"]);
      expect(flagged).toEqual(new Set(["e1"]));
    });

    it("reads open flags only, and never who or why", async () => {
      const { db, calls } = fakeReadDb(table());
      await flaggedEntryIds(db, HACK, ["e1"]);

      const flags = calls.find((c) => c.table === hackathonCheckInFlags)!;
      const where = render(flags.where);
      expect(where.sql).toContain('"dismissed_at" is null');
      expect(where.params).toContain(HACK);
      // Ids to find the team by, and nothing a judge could read.
      expect(Object.keys(flags.fields).sort()).toEqual([
        "id",
        "participantId",
        "teamId",
        "userId",
      ]);
    });
  });

  describe("openCheckInFlagCount", () => {
    it("is zero without reading entries when nothing is open", async () => {
      const { db, calls } = fakeReadDb(table());
      expect(await openCheckInFlagCount(db, HACK)).toBe(0);
      expect(calls).toHaveLength(1);
    });

    it("counts each open flag that sits on an entry once, and skips the rest", async () => {
      const { db } = fakeReadDb(
        table(
          [
            hackathonCheckInFlags,
            [
              { id: "f1", participantId: "p1", teamId: "team-1", userId: "u1" },
              { id: "f2", participantId: "p2", teamId: null, userId: "u2" },
              { id: "f3", participantId: "p3", teamId: null, userId: "u3" },
            ],
          ],
          [
            judgingEntries,
            [
              { entryId: "e1", teamId: "team-1", submittedById: null },
              { entryId: "e2", teamId: "team-1", submittedById: null },
            ],
          ],
          [judgingEntryMembers, [{ entryId: "e3", userId: "u2" }]],
        ),
      );
      // f1 is on two entries and counts once, f2 reaches one through its
      // account, f3 is on nobody's.
      expect(await openCheckInFlagCount(db, HACK)).toBe(2);
    });

    it("reads open flags of this edition only", async () => {
      const { db, calls } = fakeReadDb(table());
      await openCheckInFlagCount(db, HACK);
      const where = render(calls[0]!.where);
      expect(where.sql).toContain('"dismissed_at" is null');
      expect(where.params).toContain(HACK);
    });
  });
});
