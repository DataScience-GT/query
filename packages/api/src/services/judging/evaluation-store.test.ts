import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingJudges,
  judgingRubricItems,
} from "@query/db";
import {
  claimGrading,
  evaluatedChallenge,
  guestScope,
  inJudgeScope,
  reconcileDueDrafts,
} from "./evaluation-store";
import type { ChallengeRow, Seat } from "./evaluation-store";
import { GRADING_HOLD_MS } from "./grading-hold";
import type { Judge } from "./principal";
import type { DrizzleDB } from "@query/db";

// General (scheduled)
// Sponsor prize (scheduled)
// MLH Challenges (unscheduled group)
//   ├── Best Use of MongoDB
//   └── Best Domain Name
const row = (id: string, over: Partial<ChallengeRow> = {}): ChallengeRow => ({
  id,
  parentId: null,
  mode: "scheduled",
  label: id,
  isGeneral: false,
  isGroup: false,
  ...over,
});
const challenges: ChallengeRow[] = [
  row("sponsor"),
  row("general", { isGeneral: true }),
  row("mlh", { isGroup: true, mode: "unscheduled" }),
  row("mongo", { parentId: "mlh" }),
  row("domain", { parentId: "mlh" }),
];

const member: Judge = {
  kind: "member",
  hackathonId: "h",
  userId: "u",
  judgeId: "j",
  displayName: "Ada",
};
const guest: Judge = {
  kind: "guest",
  hackathonId: "h",
  sessionId: "s",
  linkId: "l",
  roomId: "r",
  roomChallengeId: "mlh",
  judgeId: "g",
  displayName: "Grace",
};
const seat = (challengeId: string): Seat => ({
  roomId: "room",
  roomName: "Room",
  challengeId,
});

describe("guest scope", () => {
  it("is the room's challenge and everything below it", () => {
    expect([...guestScope(challenges, "mlh")].sort()).toEqual([
      "domain",
      "mlh",
      "mongo",
    ]);
  });

  it("lets members see every challenge, guests only their room's", () => {
    expect(inJudgeScope(member, challenges, "sponsor")).toBe(true);
    expect(inJudgeScope(member, challenges, "missing")).toBe(false);
    expect(inJudgeScope(guest, challenges, "mongo")).toBe(true);
    expect(inJudgeScope(guest, challenges, "general")).toBe(false);
  });
});

describe("evaluatedChallenge", () => {
  it("evaluates a child challenge under its root", () => {
    expect(evaluatedChallenge(member, challenges, "mongo", null).id).toBe(
      "mlh",
    );
  });

  it("defaults a member to their room's challenge, then General", () => {
    expect(
      evaluatedChallenge(member, challenges, undefined, seat("sponsor")).id,
    ).toBe("sponsor");
    expect(evaluatedChallenge(member, challenges, undefined, null).id).toBe(
      "general",
    );
  });

  it("falls back to the first root when there is no General", () => {
    const noGeneral = challenges.filter((c) => c.id !== "general");
    expect(evaluatedChallenge(member, noGeneral, undefined, null).id).toBe(
      "sponsor",
    );
  });

  it("keeps a guest on their room's challenge", () => {
    expect(evaluatedChallenge(guest, challenges, undefined, null).id).toBe(
      "mlh",
    );
    expect(evaluatedChallenge(guest, challenges, "domain", null).id).toBe(
      "mlh",
    );
  });

  it("refuses a guest a challenge outside their room", () => {
    expect(() =>
      evaluatedChallenge(guest, challenges, "general", null),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("refuses a member an unknown challenge", () => {
    expect(() =>
      evaluatedChallenge(member, challenges, "missing", null),
    ).toThrowError(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("explains an edition with no challenges yet", () => {
    expect(() => evaluatedChallenge(member, [], undefined, null)).toThrowError(
      expect.objectContaining({ code: "PRECONDITION_FAILED" }),
    );
  });
});

describe("reconcileDueDrafts", () => {
  it("opens no transaction when nothing is due", async () => {
    let transactions = 0;
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where"]) {
      builder[method] = () => builder;
    }
    builder.limit = () => Promise.resolve([]);
    const db = {
      select: () => builder,
      transaction: () => {
        transactions += 1;
        return Promise.resolve();
      },
    } as unknown as DrizzleDB;

    await reconcileDueDrafts(db, "h");
    expect(transactions).toBe(0);
  });
});

type Rows = unknown[] | ((call: number) => unknown[]);
type Event = {
  kind: "select" | "execute" | "insert" | "update" | "delete";
  table?: string;
  where?: SQL;
  query?: SQL;
};

/**
 * A database whose selects answer by the tables they read (and join), that
 * keeps every statement in order. `answers` may be a function of how many times
 * that key was read, for a table read more than once in a run.
 */
function fakeDb(answers: Record<string, Rows>) {
  const events: Event[] = [];
  const reads = new Map<string, number>();
  const via = (...tables: unknown[]) =>
    tables.map((table) => getTableName(table as never)).join(">");
  const rowsFor = (key: string) => {
    const call = reads.get(key) ?? 0;
    reads.set(key, call + 1);
    const answer = answers[key] ?? [];
    return typeof answer === "function" ? answer(call) : answer;
  };

  const select = () => {
    const joined: unknown[] = [];
    let from: unknown;
    let where: SQL | undefined;
    const chain: Record<string, unknown> = {
      from: (table: unknown) => {
        from = table;
        return chain;
      },
      where: (clause: SQL) => {
        where = clause;
        return chain;
      },
      then: (
        ok: (rows: unknown[]) => unknown,
        fail: (e: unknown) => unknown,
      ) => {
        const key = via(from, ...joined);
        events.push({ kind: "select", table: key, where });
        return Promise.resolve(rowsFor(key)).then(ok, fail);
      },
    };
    for (const join of ["innerJoin", "leftJoin"]) {
      chain[join] = (table: unknown) => {
        joined.push(table);
        return chain;
      };
    }
    for (const method of ["orderBy", "limit", "for"])
      chain[method] = () => chain;
    return chain;
  };

  const db = {
    select,
    execute: (query: SQL) => {
      events.push({ kind: "execute", query });
      return Promise.resolve();
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        events.push({ kind: "insert", table: via(table) });
        const done = Promise.resolve([{ id: "new", values }]);
        return Object.assign(done, { returning: () => done });
      },
    }),
    update: (table: unknown) => ({
      set: () => ({
        where: (where: SQL) => {
          events.push({ kind: "update", table: via(table), where });
          return Promise.resolve();
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        events.push({ kind: "delete", table: via(table), where });
        return Promise.resolve();
      },
    }),
    transaction: (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { db: db as never, events, via };
}

const dialect = new PgDialect();
const textOf = (clause: SQL) => dialect.sqlToQuery(clause).sql;
const lockKeys = (events: Event[]) =>
  events
    .filter((event) => event.kind === "execute")
    .map((event) => dialect.sqlToQuery(event.query as SQL).params[0]);

const RATING = "10000000-0000-4000-8000-000000000001";
const due = (
  id: string,
  judgeId: string,
  entryId: string,
  challengeId = "c1",
) => ({
  id,
  judgeId,
  entryId,
  challengeId,
  appointmentId: "a1",
  ratings: { [RATING]: 4 },
  responses: {},
  deadlineAt: new Date("2026-04-18T15:00:00Z"),
});

describe("reconcileDueDrafts and graded once", () => {
  const dueKey = `${getTableName(judgingEvaluationDrafts)}>${getTableName(judgingConfigs)}`;
  const answersFor = (
    drafts: ReturnType<typeof due>[],
    evaluations: Rows = [],
  ): Record<string, Rows> => {
    const name = (table: unknown) => getTableName(table as never);
    return {
      [dueKey]: drafts,
      [name(judgingRubricItems)]: [
        {
          id: RATING,
          kind: "rating",
          label: "Impact",
          description: "",
          required: true,
          guestVisibility: null,
        },
      ],
      [name(judgingJudges)]: [
        ...new Set(drafts.map((draft) => draft.judgeId)),
      ].map((id) => ({ id, kind: "member" })),
      [`${name(judgingEntries)}>${name(judgingEntryChallenges)}`]: [
        { id: "entry" },
      ],
      [name(judgingEvaluations)]: evaluations,
    };
  };
  const evaluationReads = (events: Event[]) =>
    events.filter(
      (e) =>
        e.kind === "select" && e.table === getTableName(judgingEvaluations),
    );
  const written = (events: Event[], table: unknown) =>
    events.filter(
      (e) => e.kind === "insert" && e.table === getTableName(table as never),
    );

  it("submits a due draft for a project nobody has graded", async () => {
    const { db, events } = fakeDb(answersFor([due("d1", "j1", "e1")]));

    await reconcileDueDrafts(db, "h", new Date("2026-04-18T15:05:00Z"));

    expect(written(events, judgingEvaluations)).toHaveLength(1);
    expect(events.some((e) => e.kind === "delete")).toBe(true);
  });

  it("keeps a draft when another judge already graded the project", async () => {
    const { db, events } = fakeDb(
      answersFor([due("d1", "j1", "e1")], [{ id: "theirs" }]),
    );

    await reconcileDueDrafts(db, "h", new Date("2026-04-18T15:05:00Z"));

    expect(written(events, judgingEvaluations)).toHaveLength(0);
    // The answers stay; only the deadline goes.
    expect(events.some((e) => e.kind === "delete")).toBe(false);
    expect(events.some((e) => e.kind === "update")).toBe(true);
  });

  it("looks for a grade from any judge, not just the draft's", async () => {
    const { db, events } = fakeDb(answersFor([due("d1", "j1", "e1")]));

    await reconcileDueDrafts(db, "h", new Date("2026-04-18T15:05:00Z"));

    const [read] = evaluationReads(events);
    const where = textOf(read.where as SQL);
    expect(where).toContain('"entry_id"');
    expect(where).toContain('"challenge_id"');
    expect(where).not.toContain('"judge_id"');
  });

  it("submits only the first of two drafts for one project", async () => {
    // The second draft sees the evaluation the first just wrote.
    const { db, events } = fakeDb(
      answersFor([due("d1", "j1", "e1"), due("d2", "j2", "e1")], (call) =>
        call === 0 ? [] : [{ id: "new" }],
      ),
    );

    await reconcileDueDrafts(db, "h", new Date("2026-04-18T15:05:00Z"));

    expect(written(events, judgingEvaluations)).toHaveLength(1);
    expect(events.filter((e) => e.kind === "delete")).toHaveLength(1);
  });

  it("locks each project once, in key order, before it writes anything", async () => {
    const { db, events } = fakeDb(
      answersFor([
        due("d1", "j1", "e9"),
        due("d2", "j2", "e1"),
        due("d3", "j3", "e9"),
      ]),
    );

    await reconcileDueDrafts(db, "h", new Date("2026-04-18T15:05:00Z"));

    expect(lockKeys(events)).toEqual(["grading:e1:c1", "grading:e9:c1"]);
    const firstWrite = events.findIndex((e) =>
      ["insert", "update", "delete"].includes(e.kind),
    );
    const lastLock = events.map((e) => e.kind).lastIndexOf("execute");
    expect(lastLock).toBeLessThan(firstWrite);
  });
});

describe("claimGrading", () => {
  const judge = "me";
  const challenge: ChallengeRow = row("general", {
    label: "General",
    isGeneral: true,
  });
  const NOW = new Date("2026-04-18T15:00:00Z");
  const evaluationsKey = getTableName(judgingEvaluations);
  const draftsKey = getTableName(judgingEvaluationDrafts);
  const claim = (answers: Record<string, Rows>) => {
    const fake = fakeDb(answers);
    return {
      ...fake,
      run: () =>
        claimGrading(
          fake.db,
          { judgeId: judge, entryId: "e1", challenge },
          NOW,
        ),
    };
  };

  it("lets a judge take a project nobody has", async () => {
    const { run, events } = claim({});
    await expect(run()).resolves.toBeUndefined();
    expect(lockKeys(events)).toEqual(["grading:e1:general"]);
  });

  it("takes the lock before it reads", async () => {
    const { run, events } = claim({});
    await run();
    expect(events[0].kind).toBe("execute");
    expect(events.slice(1).every((e) => e.kind === "select")).toBe(true);
  });

  it("refuses a project another judge already graded", async () => {
    const { run } = claim({ [evaluationsKey]: [{ judgeId: "them" }] });
    await expect(run()).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "Another judge has already graded this project for General. Each project is graded once.",
    });
  });

  it("refuses a project another judge is grading", async () => {
    const { run } = claim({
      [draftsKey]: [
        {
          judgeId: "them",
          updatedAt: new Date(NOW.getTime() - 60_000),
          deadlineAt: null,
        },
      ],
    });
    await expect(run()).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "Another judge is grading this project right now. Pick another one.",
    });
  });

  it("refuses while a presentation's draft is before its deadline", async () => {
    const { run } = claim({
      [draftsKey]: [
        {
          judgeId: "them",
          updatedAt: new Date(NOW.getTime() - GRADING_HOLD_MS * 3),
          deadlineAt: new Date(NOW.getTime() + 60_000),
        },
      ],
    });
    await expect(run()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets a judge take over a draft left alone past the hold", async () => {
    const { run } = claim({
      [draftsKey]: [
        {
          judgeId: "them",
          updatedAt: new Date(NOW.getTime() - GRADING_HOLD_MS - 1),
          deadlineAt: null,
        },
      ],
    });
    await expect(run()).resolves.toBeUndefined();
  });

  it("only looks at other judges' rows", async () => {
    const { run, events } = claim({});
    await run();
    const reads = events.filter((e) => e.kind === "select");
    expect(reads).toHaveLength(2);
    for (const read of reads) {
      const where = textOf(read.where as SQL);
      expect(where).toContain('"judge_id" <> $');
      expect(where).toContain('"entry_id" = $');
      expect(where).toContain('"challenge_id" = $');
    }
  });
});
