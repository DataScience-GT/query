/**
 * Each project is graded once per challenge, by one judge, at the judge desk:
 * the refusals on a draft save and a submit, what the project list and sheet
 * report, the next project a judge is sent to, and who may grade which
 * challenge.
 *
 * The router runs for real against a stand-in database that answers each select
 * by the tables it reads and keeps every statement in order, which is how the
 * tests see the grading lock being taken before a write.
 */
import { describe, it, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  judgingAppointments,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingGuestSessions,
  judgingJudges,
  judges,
  judgingPresence,
  judgingRoomLinks,
  judgingRooms,
  judgingRubricItems,
  judgingSchedules,
} from "@query/db";
import { judgingDeskRouter } from "../routers/judging/desk";
import { GRADING_HOLD_MS } from "../services/judging/grading-hold";
import { queueOrder } from "../services/judging/queue";

const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const GENERAL = "0c4a8e10-2b3d-4c5e-9f60-7a8b9c0d1e2f";
const SPONSOR = "0c4a8e11-2b3d-4c5e-9f60-7a8b9c0d1e2f";
const ME = "1d5b9f21-3c4e-4d6f-8a70-8b9c0d1e2f3a";
const OTHER = "1d5b9f22-3c4e-4d6f-8a70-8b9c0d1e2f3a";
const ROOM = "2e6ca032-4d5f-4e70-9b81-9c0d1e2f3a4b";
const RATING = "3f7db143-5e60-4f81-8c92-0d1e2f3a4b5c";

const E_OPEN = "40e8c254-6f71-4092-9da3-1e2f3a4b5c01";
const E_MINE = "40e8c254-6f71-4092-9da3-1e2f3a4b5c02";
const E_GRADED = "40e8c254-6f71-4092-9da3-1e2f3a4b5c03";
const E_HELD = "40e8c254-6f71-4092-9da3-1e2f3a4b5c04";
const E_STALE = "40e8c254-6f71-4092-9da3-1e2f3a4b5c05";

const challenge = (
  id: string,
  label: string,
  mode: "scheduled" | "unscheduled" | "remote",
) => ({
  id,
  parentId: null,
  mode,
  label,
  isGeneral: id === GENERAL,
  isGroup: false,
});
const general = challenge(GENERAL, "General", "unscheduled");
const sponsor = challenge(SPONSOR, "Best Use of AI", "scheduled");

const entry = (id: string, title: string) => ({
  id,
  title,
  description: "",
  submissionUrl: null,
  demoLinks: [],
  videoUrl: null,
  technologies: [],
  participantCount: 2,
});

const name = (table: unknown) => getTableName(table as never);
const via = (...tables: unknown[]) => tables.map(name).join(">");

type Rows = unknown[] | ((call: number) => unknown[]);
type Answers = Record<string, Rows>;
type Event = {
  kind: "select" | "execute" | "insert" | "update" | "delete";
  table?: string;
  where?: SQL;
};

/** The nth read of a table gets the nth list. */
const byCall =
  (...lists: unknown[][]) =>
  (call: number) =>
    lists[call] ?? [];

function fakeDb(answers: Answers) {
  const events: Event[] = [];
  const reads = new Map<string, number>();
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
        fail: (error: unknown) => unknown,
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
    for (const method of ["orderBy", "limit", "for"]) {
      chain[method] = () => chain;
    }
    return chain;
  };

  const db: Record<string, unknown> = {
    select,
    execute: () => {
      events.push({ kind: "execute" });
      return Promise.resolve();
    },
    insert: (table: unknown) => ({
      values: () => {
        events.push({ kind: "insert", table: via(table) });
        const done = Promise.resolve([{ id: "new" }]);
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
  return { db, events };
}

const rating = {
  id: RATING,
  kind: "rating",
  label: "Impact",
  description: "",
  required: true,
  guestVisibility: null,
};

/** What the desk reads for a member judge at an edition with one challenge. */
const memberWorld = (over: Answers = {}): Answers => ({
  [via(judges)]: [{ name: "Grace Hopper" }],
  [via(judgingJudges)]: [{ id: ME, displayName: "Grace Hopper" }],
  [via(judgingChallenges)]: [general],
  [via(judgingConfigs)]: [
    { state: "open", showAllScores: false, closedAt: null },
  ],
  [via(judgingRubricItems)]: [rating],
  [via(judgingEntries, judgingEntryChallenges)]: [entry(E_OPEN, "Tidewater")],
  ...over,
});

/** A guest judge whose room serves `roomChallengeId`. */
const guestWorld = (over: Answers = {}): Answers => ({
  [via(judgingGuestSessions, judgingRoomLinks, judgingRooms, judgingJudges)]: [
    {
      sessionId: "session-1",
      hackathonId: HACK,
      linkId: "link-1",
      roomId: ROOM,
      roomChallengeId: SPONSOR,
      judgeId: ME,
      displayName: "Guest Judge",
    },
  ],
  [via(judgingGuestSessions, judgingRoomLinks, judgingRooms)]: [{ id: "s" }],
  [via(judgingChallenges)]: [general, sponsor],
  [via(judgingConfigs)]: [
    { state: "open", showAllScores: false, closedAt: null },
  ],
  [via(judgingRubricItems)]: [rating],
  [via(judgingEntries, judgingEntryChallenges)]: [entry(E_OPEN, "Tidewater")],
  ...over,
});

const memberCtx = (db: unknown) =>
  ({
    db,
    session: { user: { id: "judge-user", name: "Grace Hopper" } },
    userId: "judge-user",
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  }) as never;

const guestCtx = (db: unknown) =>
  ({
    db,
    session: null,
    userId: undefined,
    clientIp: "127.0.0.2",
    req: {
      headers: {
        get: (header: string) =>
          header.toLowerCase() === "cookie"
            ? "query_judging_guest=guest-token"
            : null,
      },
    },
  }) as never;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const minutesAhead = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000);

const evaluations = name(judgingEvaluations);
const drafts = name(judgingEvaluationDrafts);

const kinds = (events: Event[]) => events.map((e) => e.kind);
const wrote = (events: Event[], table: unknown) =>
  events.some((e) => e.kind === "insert" && e.table === name(table));
const firstRead = (events: Event[], table: string) =>
  events.findIndex((e) => e.kind === "select" && e.table === table);

const gradedElsewhere =
  "Another judge has already graded this project for General. Each project is graded once.";
const beingGraded =
  "Another judge is grading this project right now. Pick another one.";

const save = {
  hackathonId: HACK,
  entryId: E_OPEN,
  challengeId: GENERAL,
  ratings: { [RATING]: 4 },
  responses: {},
};

describe("saveDraft: a project is graded once", () => {
  const run = (answers: Answers) => {
    const fake = fakeDb(answers);
    return {
      ...fake,
      save: () =>
        judgingDeskRouter
          .createCaller(memberCtx(fake.db))
          .saveDraft({ ...save, revision: 0 }),
    };
  };

  it("saves a draft of a project nobody has, after taking the grading lock", async () => {
    const { save: go, events } = run(memberWorld());

    await expect(go()).resolves.toMatchObject({ revision: 1 });

    expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
    expect(kinds(events).indexOf("execute")).toBeGreaterThan(-1);
    expect(kinds(events).indexOf("execute")).toBeLessThan(
      kinds(events).indexOf("insert"),
    );
    // The judge's own draft is locked first, so the locks cannot deadlock
    // with a deadline submission.
    expect(firstRead(events, drafts)).toBeLessThan(
      kinds(events).indexOf("execute"),
    );
  });

  it("refuses a project another judge already graded", async () => {
    const { save: go, events } = run(
      memberWorld({ [evaluations]: byCall([], [{ judgeId: OTHER }]) }),
    );

    await expect(go()).rejects.toMatchObject({
      code: "CONFLICT",
      message: gradedElsewhere,
    });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
  });

  it("refuses a project another judge is grading right now", async () => {
    const { save: go, events } = run(
      memberWorld({
        [drafts]: byCall(
          [],
          [{ judgeId: OTHER, updatedAt: minutesAgo(1), deadlineAt: null }],
        ),
      }),
    );

    await expect(go()).rejects.toMatchObject({
      code: "CONFLICT",
      message: beingGraded,
    });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
  });

  it("refuses while another judge's presentation draft is before its deadline", async () => {
    const { save: go } = run(
      memberWorld({
        [drafts]: byCall(
          [],
          [
            {
              judgeId: OTHER,
              updatedAt: minutesAgo(60),
              deadlineAt: minutesAhead(3),
            },
          ],
        ),
      }),
    );

    await expect(go()).rejects.toMatchObject({ message: beingGraded });
  });

  it("takes over a draft the other judge left alone past the hold", async () => {
    const { save: go, events } = run(
      memberWorld({
        [drafts]: byCall(
          [],
          [
            {
              judgeId: OTHER,
              updatedAt: new Date(Date.now() - GRADING_HOLD_MS - 60_000),
              deadlineAt: null,
            },
          ],
        ),
      }),
    );

    await expect(go()).resolves.toMatchObject({ revision: 1 });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
  });

  it("leaves a judge editing their own evaluation alone", async () => {
    // Old duplicates: another judge graded it too. The judge's own is theirs.
    const { save: go, events } = run(
      memberWorld({
        [evaluations]: byCall([{ appointmentId: null }], [{ judgeId: OTHER }]),
      }),
    );

    await expect(go()).resolves.toMatchObject({ revision: 1 });
    expect(kinds(events)).not.toContain("execute");
    expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
  });
});

describe("submit: a project is graded once", () => {
  const run = (answers: Answers) => {
    const fake = fakeDb(answers);
    return {
      ...fake,
      submit: () =>
        judgingDeskRouter
          .createCaller(memberCtx(fake.db))
          .submit({ ...save, expectedRevision: 0 }),
    };
  };

  it("submits a project nobody has graded, after taking the grading lock", async () => {
    const { submit, events } = run(memberWorld());

    await expect(submit()).resolves.toMatchObject({ isComplete: true });

    expect(wrote(events, judgingEvaluations)).toBe(true);
    expect(kinds(events).indexOf("execute")).toBeGreaterThan(-1);
    expect(kinds(events).indexOf("execute")).toBeLessThan(
      kinds(events).indexOf("insert"),
    );
    // The judge's own draft and evaluation are locked first.
    expect(firstRead(events, drafts)).toBeLessThan(
      kinds(events).indexOf("execute"),
    );
    expect(firstRead(events, evaluations)).toBeLessThan(
      kinds(events).indexOf("execute"),
    );
  });

  it("refuses a project another judge already graded", async () => {
    const { submit, events } = run(
      memberWorld({ [evaluations]: byCall([], [{ judgeId: OTHER }]) }),
    );

    await expect(submit()).rejects.toMatchObject({
      code: "CONFLICT",
      message: gradedElsewhere,
    });
    expect(wrote(events, judgingEvaluations)).toBe(false);
  });

  it("refuses a project another judge is grading right now", async () => {
    const { submit, events } = run(
      memberWorld({
        [drafts]: byCall(
          [],
          [{ judgeId: OTHER, updatedAt: minutesAgo(2), deadlineAt: null }],
        ),
      }),
    );

    await expect(submit()).rejects.toMatchObject({ message: beingGraded });
    expect(wrote(events, judgingEvaluations)).toBe(false);
  });

  it("lets a judge update their own evaluation", async () => {
    const { db, events } = fakeDb(
      memberWorld({
        [evaluations]: byCall(
          [
            {
              id: "mine",
              revision: 1,
              appointmentId: null,
              autoSubmittedAt: null,
            },
          ],
          [{ judgeId: OTHER }],
        ),
      }),
    );

    await expect(
      judgingDeskRouter
        .createCaller(memberCtx(db))
        .submit({ ...save, expectedRevision: 1 }),
    ).resolves.toMatchObject({ isComplete: true });
    expect(kinds(events)).not.toContain("execute");
  });
});

describe("desk.projects: each project's grading state", () => {
  const list = async (answers: Answers, ctx = memberCtx) => {
    const { db } = fakeDb(answers);
    return judgingDeskRouter.createCaller(ctx(db)).projects({
      hackathonId: HACK,
      inMyRoomOnly: false,
      hideJudged: false,
    });
  };

  const crowded = () =>
    memberWorld({
      [via(judgingEntries, judgingEntryChallenges)]: [
        entry(E_GRADED, "Alpha"),
        entry(E_HELD, "Bravo"),
        entry(E_MINE, "Charlie"),
        entry(E_STALE, "Delta"),
        entry(E_OPEN, "Echo"),
      ],
      [evaluations]: [
        { entryId: E_MINE, judgeId: ME, revision: 1, isComplete: true },
        { entryId: E_GRADED, judgeId: OTHER, revision: 1, isComplete: true },
      ],
      [drafts]: [
        {
          entryId: E_HELD,
          judgeId: OTHER,
          updatedAt: minutesAgo(1),
          deadlineAt: null,
        },
        {
          entryId: E_STALE,
          judgeId: OTHER,
          updatedAt: minutesAgo(60),
          deadlineAt: null,
        },
      ],
    });

  it("reports mine, graded, in progress and open", async () => {
    const result = await list(crowded());

    expect(
      Object.fromEntries(result.projects.map((p) => [p.id, p.grading])),
    ).toEqual({
      [E_MINE]: "mine",
      [E_GRADED]: "graded",
      [E_HELD]: "in_progress",
      [E_STALE]: "open",
      [E_OPEN]: "open",
    });
  });

  it("lists open projects first, then those being graded, then graded ones", async () => {
    const result = await list(crowded());

    expect(result.projects.map((p) => p.grading)).toEqual([
      "mine",
      "open",
      "open",
      "in_progress",
      "graded",
    ]);
  });

  it("keeps a judge's own draft and evaluation to themselves", async () => {
    const result = await list(crowded());

    const held = result.projects.find((p) => p.id === E_HELD);
    expect(held?.hasDraft).toBe(false);
    expect(held?.myEvaluation).toBeNull();
    const graded = result.projects.find((p) => p.id === E_GRADED);
    expect(graded?.myEvaluation).toBeNull();
    expect(result.judgedCount).toBe(1);
  });

  it("never says which other judge", async () => {
    const result = await list(crowded());

    expect(JSON.stringify(result)).not.toContain(OTHER);
  });

  it("tells a guest the same, for their own room", async () => {
    const result = await list(
      guestWorld({
        [evaluations]: [
          { entryId: E_OPEN, judgeId: OTHER, revision: 1, isComplete: true },
        ],
      }),
      guestCtx,
    );

    expect(result.challenge.id).toBe(SPONSOR);
    expect(result.projects.map((p) => p.grading)).toEqual(["graded"]);
    expect(JSON.stringify(result)).not.toContain(OTHER);
  });
});

describe("desk.project: whether the judge may write", () => {
  const open = async (
    entryId: string,
    over: Answers,
    ctx = memberCtx,
    challengeId: string | undefined = undefined,
  ) => {
    const { db } = fakeDb(
      memberWorld({
        [via(judgingEntries, judgingEntryChallenges)]: [
          entry(entryId, "Tidewater"),
        ],
        [via(judgingEntryMembers)]: [{ name: "Ada Lovelace" }],
        ...over,
      }),
    );
    return judgingDeskRouter
      .createCaller(ctx(db))
      .project({ hackathonId: HACK, entryId, challengeId });
  };

  it("is open to write on a project nobody has", async () => {
    const sheet = await open(E_OPEN, {});

    expect(sheet.grading).toBe("open");
    expect(sheet.access).toMatchObject({
      canEdit: true,
      reason: null,
      gradedElsewhere: false,
    });
  });

  it("is read-only on a project another judge graded", async () => {
    const sheet = await open(E_GRADED, {
      [evaluations]: byCall([], [{ judgeId: OTHER }]),
    });

    expect(sheet.grading).toBe("graded");
    expect(sheet.access).toMatchObject({
      canEdit: false,
      reason: gradedElsewhere,
      gradedElsewhere: true,
      needsRoom: false,
      ended: false,
      opensAt: null,
      deadlineAt: null,
    });
    // Still there to read.
    expect(sheet.entry.title).toBe("Tidewater");
    expect(sheet.rubric).toHaveLength(1);
    expect(sheet.evaluation).toBeNull();
    expect(JSON.stringify(sheet)).not.toContain(OTHER);
  });

  it("is read-only on a project another judge is grading", async () => {
    const sheet = await open(E_HELD, {
      [drafts]: byCall(
        [],
        [{ judgeId: OTHER, updatedAt: minutesAgo(1), deadlineAt: null }],
      ),
    });

    expect(sheet.grading).toBe("in_progress");
    expect(sheet.access).toMatchObject({
      canEdit: false,
      reason: beingGraded,
      gradedElsewhere: true,
      needsRoom: false,
    });
    expect(sheet.draft).toBeNull();
    expect(JSON.stringify(sheet)).not.toContain(OTHER);
  });

  it("stays the judge's own project when another judge also graded it", async () => {
    const sheet = await open(E_MINE, {
      [evaluations]: byCall(
        [
          {
            id: "mine",
            revision: 1,
            isComplete: true,
            appointmentId: null,
            submittedAt: minutesAgo(30),
            autoSubmittedAt: null,
            updatedAt: minutesAgo(30),
          },
        ],
        [{ judgeId: OTHER }, { judgeId: ME }],
      ),
    });

    expect(sheet.grading).toBe("mine");
    expect(sheet.access.canEdit).toBe(true);
  });

  it("does not hide that judging is closed behind the grading", async () => {
    const sheet = await open(E_GRADED, {
      [via(judgingConfigs)]: [
        { state: "closed", showAllScores: false, closedAt: new Date() },
      ],
      [evaluations]: byCall([], [{ judgeId: OTHER }]),
    });

    expect(sheet.access.canEdit).toBe(false);
    expect(sheet.access.reason).toBe(
      "Judging is closed. Your submitted evaluations are read-only.",
    );
  });
});

describe("desk.nextProject", () => {
  const next = async (
    answers: Answers,
    input: { challengeId?: string } = {},
    ctx = memberCtx,
  ) => {
    const fake = fakeDb(answers);
    const result = await judgingDeskRouter
      .createCaller(ctx(fake.db))
      .nextProject({ hackathonId: HACK, ...input });
    return { result, ...fake };
  };

  const pool = [E_OPEN, E_MINE, E_GRADED, E_HELD, E_STALE];
  const crowded = (over: Answers = {}) =>
    memberWorld({
      [via(judgingEntries, judgingEntryChallenges)]: pool.map((id) => ({
        id,
      })),
      [evaluations]: [
        { entryId: E_MINE, judgeId: ME },
        { entryId: E_GRADED, judgeId: OTHER },
      ],
      [drafts]: [
        {
          entryId: E_HELD,
          judgeId: OTHER,
          updatedAt: minutesAgo(1),
          deadlineAt: null,
        },
        {
          entryId: E_STALE,
          judgeId: OTHER,
          updatedAt: minutesAgo(60),
          deadlineAt: null,
        },
      ],
      ...over,
    });

  it("sends the judge to the first open project in their own order", async () => {
    const { result } = await next(crowded());

    const open = [E_OPEN, E_STALE];
    expect(result.entryId).toBe(queueOrder(ME, GENERAL, open)[0]);
    expect(result.challenge).toMatchObject({ id: GENERAL, label: "General" });
    expect(result.needsRoom).toBe(false);
  });

  it("sends the same judge to the same project each time", async () => {
    const first = await next(crowded());
    const again = await next(crowded());

    expect(again.result.entryId).toBe(first.result.entryId);
  });

  it("is nothing when every project is graded or held", async () => {
    const { result } = await next(
      crowded({
        [via(judgingEntries, judgingEntryChallenges)]: [
          { id: E_MINE },
          { id: E_GRADED },
          { id: E_HELD },
        ],
      }),
    );

    expect(result.entryId).toBeNull();
    expect(result.needsRoom).toBe(false);
  });

  it("is nothing when the challenge has no projects", async () => {
    const { result } = await next(
      memberWorld({ [via(judgingEntries, judgingEntryChallenges)]: [] }),
    );

    expect(result.entryId).toBeNull();
  });

  it("leaves out withdrawn projects, and still grades prize-ineligible ones", async () => {
    const { events } = await next(crowded());

    const read = events.find(
      (e) => e.table === via(judgingEntries, judgingEntryChallenges),
    );
    const clause = new PgDialect().sqlToQuery(read?.where as SQL).sql;
    expect(clause).toContain('"deleted_at" is null');
    expect(clause).not.toContain("prize_ineligible");
  });

  describe("at a scheduled challenge", () => {
    const seat = (challengeId: string) => [
      { roomId: ROOM, roomName: "Table 4", challengeId },
    ];
    const scheduled = (over: Answers = {}) =>
      memberWorld({
        [via(judgingChallenges)]: [general, sponsor],
        [via(judgingSchedules)]: [{ id: "schedule" }],
        [via(judgingPresence, judgingRooms)]: seat(SPONSOR),
        ...over,
      });
    const slot = (entryId: string, startsAt: Date, deadlineAt: Date) => ({
      id: `slot-${entryId}`,
      entryId,
      startsAt,
      deadlineAt,
    });

    it("sends the judge to a presentation running in their room", async () => {
      const { result, events } = await next(
        scheduled({
          [via(judgingEntries, judgingEntryChallenges)]: [
            { id: E_OPEN },
            { id: E_STALE },
            { id: E_HELD },
          ],
          [via(judgingAppointments)]: [
            slot(E_OPEN, minutesAgo(30), minutesAgo(20)),
            slot(E_STALE, minutesAgo(5), minutesAhead(5)),
            slot(E_HELD, minutesAhead(20), minutesAhead(30)),
          ],
        }),
        { challengeId: SPONSOR },
      );

      // Over, running, and not started: only the running one is on now.
      expect(result.entryId).toBe(E_STALE);
      const read = events.find((e) => e.table === name(judgingAppointments));
      const clause = new PgDialect().sqlToQuery(read?.where as SQL).sql;
      expect(clause).toContain('"room_id" = $');
    });

    it("is nothing when no presentation in the room is running", async () => {
      const { result } = await next(
        scheduled({
          [via(judgingEntries, judgingEntryChallenges)]: [{ id: E_OPEN }],
          [via(judgingAppointments)]: [
            slot(E_OPEN, minutesAhead(10), minutesAhead(20)),
          ],
        }),
        { challengeId: SPONSOR },
      );

      expect(result.entryId).toBeNull();
      expect(result.needsRoom).toBe(false);
    });

    it("skips a running presentation another judge already graded", async () => {
      const { result } = await next(
        scheduled({
          [via(judgingEntries, judgingEntryChallenges)]: [
            { id: E_OPEN },
            { id: E_STALE },
          ],
          [via(judgingAppointments)]: [
            slot(E_OPEN, minutesAgo(5), minutesAhead(5)),
            slot(E_STALE, minutesAgo(5), minutesAhead(5)),
          ],
          [evaluations]: [{ entryId: E_OPEN, judgeId: OTHER }],
        }),
        { challengeId: SPONSOR },
      );

      expect(result.entryId).toBe(E_STALE);
    });

    it("asks a judge seated elsewhere to join the room first", async () => {
      const { result, events } = await next(
        scheduled({ [via(judgingPresence, judgingRooms)]: seat(GENERAL) }),
        { challengeId: SPONSOR },
      );

      expect(result.entryId).toBeNull();
      expect(result.needsRoom).toBe(true);
      expect(
        events.some(
          (e) => e.table === via(judgingEntries, judgingEntryChallenges),
        ),
      ).toBe(false);
    });

    it("asks a judge with no seat to join the room first", async () => {
      const { result } = await next(
        scheduled({ [via(judgingPresence, judgingRooms)]: [] }),
        { challengeId: SPONSOR },
      );

      expect(result.needsRoom).toBe(true);
    });
  });
});

describe("who may grade which challenge", () => {
  it("keeps a sponsor's guest judge on their room's challenge when saving", async () => {
    const { db, events } = fakeDb(guestWorld());

    await expect(
      judgingDeskRouter
        .createCaller(guestCtx(db))
        .saveDraft({ ...save, challengeId: GENERAL, revision: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
    expect(kinds(events)).not.toContain("execute");
  });

  it("keeps a sponsor's guest judge on their room's challenge when submitting", async () => {
    const { db, events } = fakeDb(guestWorld());

    await expect(
      judgingDeskRouter
        .createCaller(guestCtx(db))
        .submit({ ...save, challengeId: GENERAL, expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(wrote(events, judgingEvaluations)).toBe(false);
  });

  it("keeps a guest from opening or queueing another challenge", async () => {
    const { db } = fakeDb(guestWorld());
    const caller = judgingDeskRouter.createCaller(guestCtx(db));

    await expect(
      caller.project({
        hackathonId: HACK,
        entryId: E_OPEN,
        challengeId: GENERAL,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.nextProject({ hackathonId: HACK, challengeId: GENERAL }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.projects({ hackathonId: HACK, challengeId: GENERAL }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("queues a guest in their room's challenge without being told which", async () => {
    const { db } = fakeDb(guestWorld());

    const result = await judgingDeskRouter
      .createCaller(guestCtx(db))
      .nextProject({ hackathonId: HACK });

    expect(result.challenge.id).toBe(SPONSOR);
    expect(result.entryId).toBe(E_OPEN);
  });

  it("lets a guest grade their own room's challenge", async () => {
    const { db, events } = fakeDb(guestWorld());

    await expect(
      judgingDeskRouter
        .createCaller(guestCtx(db))
        .saveDraft({ ...save, challengeId: SPONSOR, revision: 0 }),
    ).resolves.toMatchObject({ revision: 1 });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
  });

  describe("a table judge and a scheduled sponsor challenge", () => {
    const sheet = (seatedAt: string) =>
      memberWorld({
        [via(judgingChallenges)]: [general, sponsor],
        [via(judgingSchedules)]: [{ id: "schedule" }],
        [via(judgingAppointments)]: [
          {
            id: "slot",
            roomId: ROOM,
            startsAt: minutesAgo(5),
            deadlineAt: minutesAhead(5),
            endsAt: minutesAhead(10),
          },
        ],
        [via(judgingPresence, judgingRooms)]: [
          { roomId: ROOM, roomName: "Table 4", challengeId: seatedAt },
        ],
      });

    it("cannot grade it from a table that judges another challenge", async () => {
      const { db, events } = fakeDb(sheet(GENERAL));

      await expect(
        judgingDeskRouter
          .createCaller(memberCtx(db))
          .saveDraft({ ...save, challengeId: SPONSOR, revision: 0 }),
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message:
          "Join the room or table that judges this challenge to evaluate this project.",
      });
      expect(wrote(events, judgingEvaluationDrafts)).toBe(false);

      await expect(
        judgingDeskRouter
          .createCaller(memberCtx(fakeDb(sheet(GENERAL)).db))
          .submit({ ...save, challengeId: SPONSOR, expectedRevision: 0 }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("can grade it when seated at the room that judges it", async () => {
      const { db, events } = fakeDb(sheet(SPONSOR));

      await expect(
        judgingDeskRouter
          .createCaller(memberCtx(db))
          .saveDraft({ ...save, challengeId: SPONSOR, revision: 0 }),
      ).resolves.toMatchObject({ revision: 1 });
      expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
    });
  });
});
