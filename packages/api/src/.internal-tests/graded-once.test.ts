/**
 * Each project is graded once per challenge, by one judge, at the judge desk:
 * the refusals on a draft save and a submit, what the project list and sheet
 * report, the next project a judge is sent to (its queue window and skips),
 * opening a project to hold it, and who may grade which challenge.
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
  hackathons,
  judgingAppointments,
  judgingBuildings,
  judgingChallenges,
  judgingConfigs,
  judgingDeliberationEntries,
  judgingDeliberationSections,
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
import { QUEUE_WINDOW, queueOrder } from "../services/judging/queue";

const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const GENERAL = "0c4a8e10-2b3d-4c5e-9f60-7a8b9c0d1e2f";
const SPONSOR = "0c4a8e11-2b3d-4c5e-9f60-7a8b9c0d1e2f";
const ME = "1d5b9f21-3c4e-4d6f-8a70-8b9c0d1e2f3a";
const OTHER = "1d5b9f22-3c4e-4d6f-8a70-8b9c0d1e2f3a";
const ROOM = "2e6ca032-4d5f-4e70-9b81-9c0d1e2f3a4b";
const RATING = "3f7db143-5e60-4f81-8c92-0d1e2f3a4b5c";
const SECTION = "5a9fd365-7082-41a3-8eb4-2f3a4b5c6d01";

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
  values?: Record<string, unknown>;
  /** What a select asked for. */
  fields?: Record<string, unknown>;
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

  const select = (fields?: Record<string, unknown>) => {
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
        events.push({ kind: "select", table: key, where, fields });
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
      values: (values: Record<string, unknown>) => {
        events.push({ kind: "insert", table: via(table), values });
        const done = Promise.resolve([{ id: "new" }]);
        return Object.assign(done, { returning: () => done });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => {
          events.push({ kind: "update", table: via(table), where, values });
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

// A new user for each context: the desk's flood guard counts calls per user,
// and this file makes more than one user's worth.
let callers = 0;
const memberCtx = (db: unknown) => {
  const userId = `judge-user-${(callers += 1)}`;
  return {
    db,
    session: { user: { id: userId, name: "Grace Hopper" } },
    userId,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as never;
};

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

const sponsorRefusal =
  "Sponsor judges grade Best Use of AI. Sit in its room to grade it.";
const queueRefusal =
  "Grade the projects your queue offers so every judge sees a random mix. Use Grade next project.";

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
        { entryId: E_MINE, judgeId: ME, revision: 1, counted: true },
        { entryId: E_GRADED, judgeId: OTHER, revision: 1, counted: true },
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

  it("does not call a project the judge only opened a saved draft", async () => {
    const mine = (entryId: string, revision: number) => ({
      entryId,
      judgeId: ME,
      updatedAt: minutesAgo(1),
      deadlineAt: null,
      revision,
    });
    const result = await list(
      memberWorld({
        [via(judgingEntries, judgingEntryChallenges)]: [
          entry(E_OPEN, "Alpha"),
          entry(E_HELD, "Bravo"),
        ],
        [drafts]: [mine(E_OPEN, 0), mine(E_HELD, 2)],
      }),
    );

    const hasDraft = Object.fromEntries(
      result.projects.map((p) => [p.id, p.hasDraft]),
    );
    expect(hasDraft).toEqual({ [E_OPEN]: false, [E_HELD]: true });
    expect(result.projects.map((p) => p.grading)).toEqual(["mine", "mine"]);
  });

  it("never says which other judge", async () => {
    const result = await list(crowded());

    expect(JSON.stringify(result)).not.toContain(OTHER);
  });

  it("tells a guest the same, for their own room", async () => {
    const result = await list(
      guestWorld({
        [evaluations]: [
          { entryId: E_OPEN, judgeId: OTHER, revision: 1, counted: true },
        ],
      }),
      guestCtx,
    );

    expect(result.challenge.id).toBe(SPONSOR);
    expect(result.projects.map((p) => p.grading)).toEqual(["graded"]);
    expect(JSON.stringify(result)).not.toContain(OTHER);
  });

  it("calls a project judged once its evaluation counts, as placings do", async () => {
    const answers = memberWorld({
      [via(judgingEntries, judgingEntryChallenges)]: [
        entry(E_MINE, "Alpha"),
        entry(E_OPEN, "Bravo"),
      ],
      // Alpha holds every rating, a written response left empty when time
      // ran out. Bravo lacks a rating.
      [evaluations]: [
        { entryId: E_MINE, judgeId: ME, revision: 1, counted: true },
        { entryId: E_OPEN, judgeId: ME, revision: 1, counted: false },
      ],
    });
    const { db, events } = fakeDb(answers);
    const shown = await judgingDeskRouter.createCaller(memberCtx(db)).projects({
      hackathonId: HACK,
      inMyRoomOnly: false,
      hideJudged: false,
    });

    expect(shown.judgedCount).toBe(1);
    expect(
      Object.fromEntries(
        shown.projects.map((p) => [p.id, p.myEvaluation?.counted]),
      ),
    ).toEqual({ [E_MINE]: true, [E_OPEN]: false });
    // The database applies scoring.hasEveryRating's rule, not the judge's
    // "answered everything" flag.
    const read = events.find(
      (e) => e.table === evaluations && e.fields && "counted" in e.fields,
    );
    expect(read?.fields).not.toHaveProperty("isComplete");
    expect(
      new PgDialect().sqlToQuery(read?.fields?.counted as SQL).sql,
    ).toContain('"judging_evaluation_rating"');

    const hidden = await judgingDeskRouter
      .createCaller(memberCtx(fakeDb(answers).db))
      .projects({ hackathonId: HACK, inMyRoomOnly: false, hideJudged: true });
    expect(hidden.projects.map((p) => p.id)).toEqual([E_OPEN]);
  });
});

describe("desk.deliberation.add: what can go on a shortlist", () => {
  it("takes a project once the judge's evaluation counts, as placings do", async () => {
    const { db, events } = fakeDb(
      memberWorld({ [via(judgingDeliberationSections)]: [{ id: SECTION }] }),
    );

    await expect(
      judgingDeskRouter.createCaller(memberCtx(db)).deliberation.add({
        hackathonId: HACK,
        sectionId: SECTION,
        entryId: E_OPEN,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const read = events.find(
      (e) => e.table === via(judgingEvaluations, judgingEntries),
    );
    const clause = new PgDialect().sqlToQuery(read?.where as SQL).sql;
    expect(clause).toContain('"judging_evaluation_rating"');
    expect(clause).not.toContain("is_complete");
    expect(wrote(events, judgingDeliberationEntries)).toBe(false);
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

    // A table judge can only reach a scheduled challenge that is General's:
    // a sponsor's is refused before the room matters (see "who may grade
    // which challenge").
    const timedGeneral = { ...general, mode: "scheduled" as const };

    it("asks a judge seated elsewhere to join the room first", async () => {
      const { result, events } = await next(
        scheduled({ [via(judgingChallenges)]: [timedGeneral, sponsor] }),
        { challengeId: GENERAL },
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
        scheduled({
          [via(judgingChallenges)]: [timedGeneral, sponsor],
          [via(judgingPresence, judgingRooms)]: [],
        }),
        { challengeId: GENERAL },
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
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: sponsorRefusal });
      expect(wrote(events, judgingEvaluationDrafts)).toBe(false);

      await expect(
        judgingDeskRouter
          .createCaller(memberCtx(fakeDb(sheet(GENERAL)).db))
          .submit({ ...save, challengeId: SPONSOR, expectedRevision: 0 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("still needs the room for a scheduled General", async () => {
      const world = memberWorld({
        ...sheet(SPONSOR),
        [via(judgingChallenges)]: [{ ...general, mode: "scheduled" }, sponsor],
      });
      const { db, events } = fakeDb(world);

      await expect(
        judgingDeskRouter
          .createCaller(memberCtx(db))
          .saveDraft({ ...save, challengeId: GENERAL, revision: 0 }),
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message:
          "Join the room or table that judges this challenge to evaluate this project.",
      });
      expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
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

/** More projects than the queue window, with ids the desk accepts as input. */
const eid = (n: number) =>
  `40e8c254-6f71-4092-9da3-1e2f3a4b5c${String(n).padStart(2, "0")}`;
const POOL = Array.from({ length: 8 }, (_, i) => eid(i + 10));

const entriesKey = via(judgingEntries, judgingEntryChallenges);
const presenceKey = via(judgingPresence, judgingRooms);
const seatAt = (challengeId: string) => [
  { roomId: ROOM, roomName: "Table 4", challengeId },
];

describe("sponsor challenges belong to sponsor judges", () => {
  const MLH = "0c4a8e12-2b3d-4c5e-9f60-7a8b9c0d1e2f";
  const MONGO = "0c4a8e13-2b3d-4c5e-9f60-7a8b9c0d1e2f";
  const mlh = {
    ...challenge(MLH, "MLH Challenges", "unscheduled"),
    isGroup: true,
  };
  const mongo = {
    ...challenge(MONGO, "Best Use of MongoDB", "unscheduled"),
    parentId: MLH,
  };

  const world = (seatedAt: string | null, over: Answers = {}) =>
    memberWorld({
      [via(judgingChallenges)]: [general, sponsor, mlh, mongo],
      [presenceKey]: seatedAt ? seatAt(seatedAt) : [],
      ...over,
    });

  it("refuses a table judge who is not seated in the sponsor's room, on every call that picks or writes", async () => {
    for (const seatedAt of [null, GENERAL, MLH]) {
      const { db, events } = fakeDb(world(seatedAt));
      const caller = judgingDeskRouter.createCaller(memberCtx(db));
      const refused = { code: "FORBIDDEN", message: sponsorRefusal };

      await expect(
        caller.projects({ hackathonId: HACK, challengeId: SPONSOR }),
      ).rejects.toMatchObject(refused);
      await expect(
        caller.project({
          hackathonId: HACK,
          entryId: E_OPEN,
          challengeId: SPONSOR,
        }),
      ).rejects.toMatchObject(refused);
      await expect(
        caller.nextProject({ hackathonId: HACK, challengeId: SPONSOR }),
      ).rejects.toMatchObject(refused);
      await expect(
        caller.saveDraft({ ...save, challengeId: SPONSOR, revision: 0 }),
      ).rejects.toMatchObject(refused);
      await expect(
        caller.submit({ ...save, challengeId: SPONSOR, expectedRevision: 0 }),
      ).rejects.toMatchObject(refused);
      await expect(
        caller.startGrading({
          hackathonId: HACK,
          entryId: E_OPEN,
          challengeId: SPONSOR,
        }),
      ).rejects.toMatchObject(refused);

      expect(kinds(events)).not.toContain("execute");
      expect(kinds(events)).not.toContain("insert");
    }
  });

  it("names the group when the judge asked for a prize inside it", async () => {
    const { db } = fakeDb(world(GENERAL));

    await expect(
      judgingDeskRouter
        .createCaller(memberCtx(db))
        .projects({ hackathonId: HACK, challengeId: MONGO }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "Sponsor judges grade MLH Challenges. Sit in its room to grade it.",
    });
  });

  it("lets a table judge in once they are seated in the room that serves it", async () => {
    const { db, events } = fakeDb(world(SPONSOR));
    const caller = judgingDeskRouter.createCaller(memberCtx(db));

    const listed = await caller.projects({
      hackathonId: HACK,
      challengeId: SPONSOR,
      inMyRoomOnly: false,
    });
    expect(listed.challenge.id).toBe(SPONSOR);
    await expect(
      caller.nextProject({ hackathonId: HACK, challengeId: SPONSOR }),
    ).resolves.toMatchObject({ entryId: E_OPEN });
    await expect(
      caller.saveDraft({ ...save, challengeId: SPONSOR, revision: 0 }),
    ).resolves.toMatchObject({ revision: 1 });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
  });

  it("lets a table judge grade a prize inside a group from a seat at the group's room", async () => {
    const { db } = fakeDb(world(MLH));

    const listed = await judgingDeskRouter
      .createCaller(memberCtx(db))
      .projects({ hackathonId: HACK, challengeId: MONGO });
    expect(listed.challenge.id).toBe(MLH);
  });

  it("keeps General open to a table judge wherever they sit", async () => {
    for (const seatedAt of [null, GENERAL, SPONSOR]) {
      const { db } = fakeDb(world(seatedAt));
      const listed = await judgingDeskRouter
        .createCaller(memberCtx(db))
        .projects({ hackathonId: HACK, challengeId: GENERAL });
      expect(listed.challenge.id).toBe(GENERAL);
    }
  });

  it("defaults an unseated table judge to General", async () => {
    const { db } = fakeDb(world(null));

    const listed = await judgingDeskRouter
      .createCaller(memberCtx(db))
      .projects({ hackathonId: HACK });

    expect(listed.challenge.id).toBe(GENERAL);
  });

  describe("the challenges the desk offers", () => {
    const offered = async (answers: Answers, ctx = memberCtx) => {
      const { db } = fakeDb({
        [via(hackathons)]: [{ id: HACK, name: "Hacklytics" }],
        ...answers,
      });
      const context = await judgingDeskRouter
        .createCaller(ctx(db))
        .context({ hackathonId: HACK });
      return context.challenges.map((c) => c.id);
    };

    it("is General alone for a table judge with no seat or another's", async () => {
      expect(await offered(world(null))).toEqual([GENERAL]);
      expect(await offered(world(GENERAL))).toEqual([GENERAL]);
    });

    it("adds the sponsor's challenge, and what is below it, from its room", async () => {
      expect(await offered(world(SPONSOR))).toEqual([GENERAL, SPONSOR]);
      expect(await offered(world(MLH))).toEqual([GENERAL, MLH, MONGO]);
    });

    it("is still only the room's challenge for a guest", async () => {
      expect(await offered(guestWorld(), guestCtx)).toEqual([SPONSOR]);
    });
  });
});

describe("a judge's first claim is limited to their queue window", () => {
  const order = queueOrder(ME, GENERAL, POOL);
  const world = (over: Answers = {}) =>
    memberWorld({
      [entriesKey]: POOL.map((id) => entry(id, "Project")),
      ...over,
    });
  const firstSave = (entryId: string) => ({ ...save, entryId, revision: 0 });
  const desk = (answers: Answers) => {
    const fake = fakeDb(answers);
    return {
      ...fake,
      caller: judgingDeskRouter.createCaller(memberCtx(fake.db)),
    };
  };

  it("saves a draft of any of the first projects the queue offers", async () => {
    for (const entryId of order.slice(0, QUEUE_WINDOW)) {
      const { caller, events } = desk(world());

      await expect(caller.saveDraft(firstSave(entryId))).resolves.toMatchObject(
        { revision: 1 },
      );
      expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
    }
  });

  it("refuses a first save of a project further down, after the grading lock and before any write", async () => {
    const { caller, events } = desk(world());

    await expect(
      caller.saveDraft(firstSave(order[QUEUE_WINDOW])),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: queueRefusal,
    });
    expect(kinds(events)).toContain("execute");
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
  });

  it("refuses a first submission of a project further down", async () => {
    const { caller, events } = desk(world());

    await expect(
      caller.submit({ ...firstSave(order[QUEUE_WINDOW]), expectedRevision: 0 }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: queueRefusal,
    });
    expect(wrote(events, judgingEvaluations)).toBe(false);
  });

  it("lets a judge submit a project in the window without ever saving a draft", async () => {
    const { caller } = desk(world());

    await expect(
      caller.submit({ ...firstSave(order[0]), expectedRevision: 0 }),
    ).resolves.toMatchObject({ isComplete: true });
  });

  it("slides the window past projects that are graded or held", async () => {
    const held = (entryId: string, minutes: number) => ({
      entryId,
      judgeId: OTHER,
      updatedAt: minutesAgo(minutes),
      deadlineAt: null,
    });
    const { caller } = desk(
      world({
        [evaluations]: byCall([], [], [{ entryId: order[0], judgeId: OTHER }]),
        [drafts]: byCall([], [], [held(order[1], 1), held(order[2], 2)]),
      }),
    );

    await expect(
      caller.saveDraft(firstSave(order[QUEUE_WINDOW])),
    ).resolves.toMatchObject({ revision: 1 });
  });

  it("leaves a project the judge already holds alone, however far down", async () => {
    const { caller } = desk(
      world({
        [drafts]: byCall([{ id: "mine", revision: 0, deadlineAt: null }]),
      }),
    );

    await expect(caller.saveDraft(firstSave(order[7]))).resolves.toMatchObject({
      revision: 1,
    });
  });

  it("leaves a project the judge already graded alone, however far down", async () => {
    const { caller, events } = desk(
      world({ [evaluations]: byCall([{ appointmentId: null }]) }),
    );

    await expect(caller.saveDraft(firstSave(order[7]))).resolves.toMatchObject({
      revision: 1,
    });
    expect(kinds(events)).not.toContain("execute");
  });

  it("asks nothing of a scheduled challenge: the schedule decides", async () => {
    const { caller, events } = desk(
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
        [presenceKey]: seatAt(SPONSOR),
        [entriesKey]: POOL.map((id) => entry(id, "Project")),
      }),
    );

    await expect(
      caller.saveDraft({
        ...firstSave(queueOrder(ME, SPONSOR, POOL)[7]),
        challengeId: SPONSOR,
      }),
    ).resolves.toMatchObject({ revision: 1 });
    // Only the check that the project is entered read the projects.
    expect(events.filter((e) => e.table === entriesKey)).toHaveLength(1);
  });
});

describe("desk.nextProject: the queue window and skips", () => {
  const order = queueOrder(ME, GENERAL, POOL);
  const next = async (
    input: { challengeId?: string; skip?: string[] } = {},
    over: Answers = {},
  ) => {
    const { db } = fakeDb(
      memberWorld({ [entriesKey]: POOL.map((id) => ({ id })), ...over }),
    );
    return judgingDeskRouter
      .createCaller(memberCtx(db))
      .nextProject({ hackathonId: HACK, ...input });
  };

  it("offers the first project of the judge's queue", async () => {
    const result = await next();

    expect(result.entryId).toBe(order[0]);
    expect(result.allSkipped).toBe(false);
  });

  it("passes over skipped projects, one at a time, within the window", async () => {
    expect((await next({ skip: [order[0]] })).entryId).toBe(order[1]);
    expect((await next({ skip: [order[0], order[1]] })).entryId).toBe(order[2]);
  });

  it("says everything is skipped once the whole window is, and never reaches past it", async () => {
    const result = await next({ skip: order.slice(0, QUEUE_WINDOW) });

    expect(result.entryId).toBeNull();
    expect(result.allSkipped).toBe(true);
    expect(result.needsRoom).toBe(false);
  });

  it("ignores a skip outside the window", async () => {
    expect((await next({ skip: [order[6]] })).entryId).toBe(order[0]);
  });

  it("does not call a challenge with nothing open skipped", async () => {
    const held = POOL.map((entryId) => ({
      entryId,
      judgeId: OTHER,
      updatedAt: minutesAgo(1),
      deadlineAt: null,
    }));

    const result = await next({ skip: [order[0]] }, { [drafts]: held });

    expect(result.entryId).toBeNull();
    expect(result.allSkipped).toBe(false);
  });

  it("slides the window as other judges grade projects", async () => {
    const result = await next(
      { skip: order.slice(0, QUEUE_WINDOW - 1) },
      { [evaluations]: [{ entryId: order[0], judgeId: OTHER }] },
    );

    // order[0] is graded, so the window is order[1..3]; skipping order[0]
    // and order[1] leaves order[2].
    expect(result.entryId).toBe(order[2]);
    const all = await next(
      { skip: order.slice(1, QUEUE_WINDOW + 1) },
      { [evaluations]: [{ entryId: order[0], judgeId: OTHER }] },
    );
    expect(all.entryId).toBeNull();
    expect(all.allSkipped).toBe(true);
  });

  it("keeps a project the judge opened and skipped inside the window", async () => {
    // Opening a project holds it for the judge (an empty draft); skipping it
    // must not let them reach past the window.
    const opened = order.slice(0, QUEUE_WINDOW).map((entryId) => ({
      entryId,
      judgeId: ME,
      updatedAt: minutesAgo(1),
      deadlineAt: null,
      revision: 0,
    }));

    expect((await next({}, { [drafts]: opened.slice(0, 1) })).entryId).toBe(
      order[0],
    );
    expect(
      (await next({ skip: [order[0]] }, { [drafts]: opened.slice(0, 1) }))
        .entryId,
    ).toBe(order[1]);
    const all = await next(
      { skip: order.slice(0, QUEUE_WINDOW) },
      { [drafts]: opened },
    );
    expect(all.entryId).toBeNull();
    expect(all.allSkipped).toBe(true);
  });

  it("takes at most 20 skips, and only project ids", async () => {
    const many = Array.from({ length: 21 }, (_, i) => eid(i + 30));
    await expect(next({ skip: many })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(next({ skip: ["not-an-id"] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(next({ skip: many.slice(0, 20) })).resolves.toMatchObject({
      entryId: order[0],
    });
  });

  it("offers every running presentation at a scheduled challenge, not just a window", async () => {
    const ids = POOL.slice(0, 5);
    const sponsorOrder = queueOrder(ME, SPONSOR, ids);
    const running = ids.map((entryId) => ({
      id: `slot-${entryId}`,
      entryId,
      startsAt: minutesAgo(5),
      deadlineAt: minutesAhead(5),
    }));
    const result = await next(
      { challengeId: SPONSOR, skip: sponsorOrder.slice(0, 4) },
      {
        [via(judgingChallenges)]: [general, sponsor],
        [via(judgingSchedules)]: [{ id: "schedule" }],
        [presenceKey]: seatAt(SPONSOR),
        [entriesKey]: ids.map((id) => ({ id })),
        [via(judgingAppointments)]: running,
      },
    );

    expect(result.entryId).toBe(sponsorOrder[4]);
  });
});

describe("desk.projects: open projects in the judge's queue order", () => {
  const titled = [
    ["Alpha", eid(40)],
    ["Bravo", eid(41)],
    ["Charlie", eid(42)],
    ["Delta", eid(43)],
    ["Echo", eid(44)],
    ["Foxtrot", eid(45)],
    ["Golf", eid(46)],
    ["Hotel", eid(47)],
  ].map(([title, id]) => entry(id, title));
  // Alpha is the judge's own, Bravo is held by another judge, Charlie was
  // graded by another judge, and the rest are open.
  const [MINE, HELD, GRADED, ...OPEN] = titled.map((e) => e.id);

  const list = async (
    over: Answers = {},
    input: { sort?: "scheduled" | "title"; challengeId?: string } = {},
  ) => {
    const { db } = fakeDb(
      memberWorld({
        [entriesKey]: titled,
        [drafts]: [
          {
            entryId: MINE,
            judgeId: ME,
            updatedAt: minutesAgo(1),
            deadlineAt: null,
          },
          {
            entryId: HELD,
            judgeId: OTHER,
            updatedAt: minutesAgo(1),
            deadlineAt: null,
          },
        ],
        [evaluations]: [
          { entryId: GRADED, judgeId: OTHER, revision: 1, counted: true },
        ],
        ...over,
      }),
    );
    return judgingDeskRouter.createCaller(memberCtx(db)).projects({
      hackathonId: HACK,
      inMyRoomOnly: false,
      hideJudged: false,
      ...input,
    });
  };

  it("lists the judge's own first, then open projects in their queue order", async () => {
    const result = await list();
    const queue = queueOrder(ME, GENERAL, OPEN);
    // The test only means something if the queue is not the title order.
    expect(queue).not.toEqual(OPEN);

    expect(result.projects.map((p) => p.id)).toEqual([
      MINE,
      ...queue,
      HELD,
      GRADED,
    ]);
    expect(result.projects.map((p) => p.grading)).toEqual([
      "mine",
      ...queue.map(() => "open"),
      "in_progress",
      "graded",
    ]);
  });

  it("puts first the open project that Grade next project goes to", async () => {
    const result = await list();
    const { db } = fakeDb(
      memberWorld({
        [entriesKey]: titled.map((e) => ({ id: e.id })),
        [drafts]: [
          {
            entryId: MINE,
            judgeId: ME,
            updatedAt: minutesAgo(1),
            deadlineAt: null,
          },
          {
            entryId: HELD,
            judgeId: OTHER,
            updatedAt: minutesAgo(1),
            deadlineAt: null,
          },
        ],
        [evaluations]: [{ entryId: GRADED, judgeId: OTHER }],
      }),
    );
    const next = await judgingDeskRouter
      .createCaller(memberCtx(db))
      .nextProject({ hackathonId: HACK });

    expect(result.projects.find((p) => p.grading === "open")?.id).toBe(
      next.entryId,
    );
  });

  it("keeps title order when the judge asks for it", async () => {
    const result = await list({}, { sort: "title" });

    expect(
      result.projects.filter((p) => p.grading === "open").map((p) => p.title),
    ).toEqual(["Delta", "Echo", "Foxtrot", "Golf", "Hotel"]);
  });

  it("keeps presentation order at a scheduled challenge", async () => {
    const slot = (entryId: string, minutes: number) => ({
      id: `slot-${entryId}`,
      entryId,
      roomId: ROOM,
      roomName: "Table 4",
      buildingName: null,
      startsAt: minutesAhead(minutes),
      deadlineAt: minutesAhead(minutes + 10),
      endsAt: minutesAhead(minutes + 12),
    });
    const [delta, echo, foxtrot] = OPEN;
    const result = await list(
      {
        [via(judgingChallenges)]: [general, sponsor],
        [via(judgingSchedules)]: [{ id: "schedule" }],
        [presenceKey]: seatAt(SPONSOR),
        [via(judgingAppointments, judgingRooms, judgingBuildings)]: [
          slot(foxtrot, 10),
          slot(echo, 20),
          slot(delta, 30),
        ],
      },
      { challengeId: SPONSOR },
    );

    expect(result.projects.map((p) => p.title)).toEqual([
      "Foxtrot",
      "Echo",
      "Delta",
      "Alpha",
      "Golf",
      "Hotel",
      "Bravo",
      "Charlie",
    ]);
  });
});

describe("desk.startGrading: the hold starts when a project is opened", () => {
  const start = (entryId = E_OPEN, challengeId = GENERAL) => ({
    hackathonId: HACK,
    entryId,
    challengeId,
  });
  const desk = (answers: Answers, ctx = memberCtx) => {
    const fake = fakeDb(answers);
    return {
      ...fake,
      caller: judgingDeskRouter.createCaller(ctx(fake.db)),
    };
  };
  const insertedDraft = (events: Event[]) =>
    events.find((e) => e.kind === "insert" && e.table === drafts)?.values;

  it("creates an empty draft after taking the grading lock", async () => {
    const { caller, events } = desk(memberWorld());

    const result = await caller.startGrading(start());

    expect(result).toEqual({ held: true, revision: 0, deadlineAt: null });
    expect(insertedDraft(events)).toMatchObject({
      hackathonId: HACK,
      judgeId: ME,
      entryId: E_OPEN,
      challengeId: GENERAL,
      ratings: {},
      responses: {},
      revision: 0,
      appointmentId: null,
      deadlineAt: null,
    });
    expect(kinds(events).indexOf("execute")).toBeGreaterThan(-1);
    expect(kinds(events).indexOf("execute")).toBeLessThan(
      kinds(events).indexOf("insert"),
    );
  });

  it("picks the challenge a table judge sits at when none is named", async () => {
    const { caller, events } = desk(
      memberWorld({
        [via(judgingChallenges)]: [general, sponsor],
        [presenceKey]: seatAt(SPONSOR),
      }),
    );

    await caller.startGrading({ hackathonId: HACK, entryId: E_OPEN });

    expect(insertedDraft(events)).toMatchObject({ challengeId: SPONSOR });
  });

  it("touches a draft the judge already has, keeping its answers and revision", async () => {
    const { caller, events } = desk(
      memberWorld({
        [drafts]: byCall([{ id: "mine", revision: 3, deadlineAt: null }]),
      }),
    );

    const result = await caller.startGrading(start());

    expect(result).toEqual({ held: true, revision: 3, deadlineAt: null });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
    const touched = events.find(
      (e) => e.kind === "update" && e.table === drafts,
    );
    expect(touched?.values).toHaveProperty("updatedAt");
    expect(touched?.values).not.toHaveProperty("revision");
    expect(touched?.values).not.toHaveProperty("ratings");
    expect(touched?.values).not.toHaveProperty("responses");
    // A draft they hold needs no queue check.
    expect(events.filter((e) => e.table === entriesKey)).toHaveLength(1);
  });

  it("does not make the editor's first save stale", async () => {
    // The sheet opened with no draft and sends revision 0; the empty draft
    // holds revision 0, so that save goes through as an update of it.
    const { caller, events } = desk(
      memberWorld({
        [drafts]: byCall([{ id: "new", revision: 0, deadlineAt: null }]),
      }),
    );

    await expect(
      caller.saveDraft({ ...save, revision: 0 }),
    ).resolves.toMatchObject({ revision: 1 });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
    expect(events.some((e) => e.kind === "update" && e.table === drafts)).toBe(
      true,
    );
  });

  it("refuses a project another judge already graded", async () => {
    const { caller, events } = desk(
      memberWorld({ [evaluations]: byCall([], [{ judgeId: OTHER }]) }),
    );

    await expect(caller.startGrading(start())).rejects.toMatchObject({
      code: "CONFLICT",
      message: gradedElsewhere,
    });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
  });

  it("refuses a project another judge is grading right now", async () => {
    const { caller, events } = desk(
      memberWorld({
        [drafts]: byCall(
          [],
          [{ judgeId: OTHER, updatedAt: minutesAgo(1), deadlineAt: null }],
        ),
      }),
    );

    await expect(caller.startGrading(start())).rejects.toMatchObject({
      code: "CONFLICT",
      message: beingGraded,
    });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
  });

  it("refuses a project outside the judge's queue window", async () => {
    const order = queueOrder(ME, GENERAL, POOL);
    const { caller, events } = desk(
      memberWorld({ [entriesKey]: POOL.map((id) => entry(id, "Project")) }),
    );

    await expect(
      caller.startGrading(start(order[QUEUE_WINDOW])),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: queueRefusal,
    });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);

    await expect(
      desk(
        memberWorld({ [entriesKey]: POOL.map((id) => entry(id, "Project")) }),
      ).caller.startGrading(start(order[0])),
    ).resolves.toMatchObject({ held: true });
  });

  it("leaves the judge's own graded project alone", async () => {
    const { caller, events } = desk(
      memberWorld({ [evaluations]: byCall([{ id: "mine" }]) }),
    );

    await expect(caller.startGrading(start())).resolves.toMatchObject({
      held: false,
    });
    expect(kinds(events)).not.toContain("execute");
    expect(kinds(events)).not.toContain("insert");
    expect(kinds(events)).not.toContain("update");
  });

  it("is refused while judging is not open", async () => {
    const { caller, events } = desk(
      memberWorld({
        [via(judgingConfigs)]: [
          { state: "draft", showAllScores: false, closedAt: null },
        ],
      }),
    );

    await expect(caller.startGrading(start())).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
  });

  it("holds a guest's own room's project the same way", async () => {
    const { caller, events } = desk(guestWorld(), guestCtx);

    await caller.startGrading({ hackathonId: HACK, entryId: E_OPEN });

    expect(insertedDraft(events)).toMatchObject({
      challengeId: SPONSOR,
      ratings: {},
      revision: 0,
    });
  });

  describe("for a scheduled presentation", () => {
    const presenting = (startsAt: Date, deadlineAt: Date) =>
      memberWorld({
        [via(judgingChallenges)]: [general, sponsor],
        [via(judgingSchedules)]: [{ id: "schedule" }],
        [via(judgingAppointments)]: [
          {
            id: "slot",
            roomId: ROOM,
            startsAt,
            deadlineAt,
            endsAt: minutesAhead(10),
          },
        ],
        [presenceKey]: seatAt(SPONSOR),
      });

    it("stamps the draft with the presentation and its deadline, as a save does", async () => {
      const deadline = minutesAhead(5);
      const { caller, events } = desk(presenting(minutesAgo(5), deadline));

      const result = await caller.startGrading(start(E_OPEN, SPONSOR));

      expect(result.deadlineAt).toEqual(deadline);
      expect(insertedDraft(events)).toMatchObject({
        challengeId: SPONSOR,
        appointmentId: "slot",
        deadlineAt: deadline,
        revision: 0,
      });
    });

    it("keeps the draft's own deadline once the slot's has just passed", async () => {
      const kept = minutesAhead(2);
      // Within the grace a write still gets, the slot gives no new deadline.
      const { caller, events } = desk({
        ...presenting(minutesAgo(10), new Date(Date.now() - 5_000)),
        [drafts]: byCall([{ id: "mine", revision: 2, deadlineAt: kept }]),
      });

      const result = await caller.startGrading(start(E_OPEN, SPONSOR));

      expect(result).toEqual({ held: true, revision: 2, deadlineAt: kept });
      const touched = events.find(
        (e) => e.kind === "update" && e.table === drafts,
      );
      expect(touched?.values).toMatchObject({ deadlineAt: kept });
    });

    it("does not start before the presentation does", async () => {
      const { caller, events } = desk(
        presenting(minutesAhead(10), minutesAhead(20)),
      );

      await expect(
        caller.startGrading(start(E_OPEN, SPONSOR)),
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message:
          "This project has not presented yet. You can judge it once its presentation starts.",
      });
      expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
    });
  });

  describe("a second judge after the first opens a project", () => {
    const secondJudge = (held: Event["values"]) =>
      memberWorld({
        [via(judgingJudges)]: [{ id: OTHER, displayName: "Alan Turing" }],
        [via(judgingEntryMembers)]: [{ name: "Ada Lovelace" }],
        [drafts]: [
          {
            entryId: held?.entryId,
            judgeId: held?.judgeId,
            updatedAt: held?.updatedAt,
            deadlineAt: held?.deadlineAt,
          },
        ],
      });

    it("sees the project in progress, read-only, and cannot take it", async () => {
      const first = desk(memberWorld());
      await first.caller.startGrading(start());
      const held = insertedDraft(first.events);
      expect(held).toBeDefined();

      const { db } = fakeDb(secondJudge(held));
      const caller = judgingDeskRouter.createCaller(memberCtx(db));

      const listed = await caller.projects({
        hackathonId: HACK,
        inMyRoomOnly: false,
      });
      expect(listed.projects.map((p) => p.grading)).toEqual(["in_progress"]);

      const sheet = await caller.project({
        hackathonId: HACK,
        entryId: E_OPEN,
        challengeId: GENERAL,
      });
      expect(sheet.grading).toBe("in_progress");
      expect(sheet.access).toMatchObject({
        canEdit: false,
        reason: beingGraded,
        gradedElsewhere: true,
      });

      const { db: db2, events } = fakeDb(secondJudge(held));
      const second = judgingDeskRouter.createCaller(memberCtx(db2));
      await expect(second.startGrading(start())).rejects.toMatchObject({
        code: "CONFLICT",
        message: beingGraded,
      });
      await expect(
        second.saveDraft({ ...save, revision: 0 }),
      ).rejects.toMatchObject({ code: "CONFLICT", message: beingGraded });
      expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
    });
  });
});
