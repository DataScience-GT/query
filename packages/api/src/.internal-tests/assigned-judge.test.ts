/**
 * A presentation assigned to a judge at the judge desk: the assigned judge
 * has it to themselves until TAKEOVER_AFTER_MS after it starts, then any judge
 * who may grade it there can take it unless the assigned judge has started.
 * Also what the lists and the sheet say about it, the next project a judge is
 * sent to, the judge's itinerary, giving a hold back (releaseGrading), and the
 * scores the desk shows.
 *
 * The router runs for real against a stand-in database that answers each select
 * by the tables it reads and keeps every statement in order (see
 * graded-once.test.ts, whose stand-in this follows).
 */
import { describe, it, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  judgingAppointments,
  judgingBuildings,
  judgingChallenges,
  judgingConfigs,
  judgingEntries,
  judgingEntryChallenges,
  judgingEntryMembers,
  judgingEvaluationDrafts,
  judgingEvaluationRatings,
  judgingEvaluations,
  judgingJudges,
  judges,
  judgingPresence,
  judgingRooms,
  judgingRubricItems,
  judgingSchedules,
} from "@query/db";
import { judgingDeskRouter } from "../routers/judging/desk";
import { GRADING_HOLD_MS } from "../services/judging/grading-hold";
import { TAKEOVER_AFTER_MS } from "../services/judging/timing";

const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const GENERAL = "0c4a8e10-2b3d-4c5e-9f60-7a8b9c0d1e2f";
const SPONSOR = "0c4a8e11-2b3d-4c5e-9f60-7a8b9c0d1e2f";
const ME = "1d5b9f21-3c4e-4d6f-8a70-8b9c0d1e2f3a";
const OTHER = "1d5b9f22-3c4e-4d6f-8a70-8b9c0d1e2f3a";
const ROOM = "2e6ca032-4d5f-4e70-9b81-9c0d1e2f3a4b";
const ELSEWHERE = "2e6ca033-4d5f-4e70-9b81-9c0d1e2f3a4b";
const RATING = "3f7db143-5e60-4f81-8c92-0d1e2f3a4b5c";
const RATING_2 = "3f7db144-5e60-4f81-8c92-0d1e2f3a4b5c";

const E_ONE = "40e8c254-6f71-4092-9da3-1e2f3a4b5c01";
const E_TWO = "40e8c254-6f71-4092-9da3-1e2f3a4b5c02";
const E_THREE = "40e8c254-6f71-4092-9da3-1e2f3a4b5c03";

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
  /** A select that takes row locks. */
  locking?: boolean;
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
    const event: Event = { kind: "select" };
    const chain: Record<string, unknown> = {
      from: (table: unknown) => {
        from = table;
        return chain;
      },
      where: (clause: SQL) => {
        where = clause;
        return chain;
      },
      for: () => {
        event.locking = true;
        return chain;
      },
      then: (
        ok: (rows: unknown[]) => unknown,
        fail: (error: unknown) => unknown,
      ) => {
        const key = via(from, ...joined);
        events.push({ ...event, table: key, where });
        return Promise.resolve(rowsFor(key)).then(ok, fail);
      },
    };
    for (const join of ["innerJoin", "leftJoin"]) {
      chain[join] = (table: unknown) => {
        joined.push(table);
        return chain;
      };
    }
    for (const method of ["orderBy", "limit"]) {
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

const evaluations = name(judgingEvaluations);
const drafts = name(judgingEvaluationDrafts);
const entriesKey = via(judgingEntries, judgingEntryChallenges);
const presenceKey = via(judgingPresence, judgingRooms);
const slotsKey = via(judgingAppointments);
const listedSlotsKey = via(judgingAppointments, judgingRooms, judgingBuildings);

const seatAt = (challengeId: string, roomId = ROOM) => [
  { roomId, roomName: "Table 4", challengeId },
];

/** A table judge seated at the sponsor's room, with a schedule saved. */
const world = (over: Answers = {}): Answers => ({
  [via(judges)]: [{ name: "Grace Hopper" }],
  [via(judgingJudges)]: [{ id: ME, displayName: "Grace Hopper" }],
  [via(judgingChallenges)]: [general, sponsor],
  [via(judgingConfigs)]: [
    { state: "open", showAllScores: false, closedAt: null },
  ],
  [via(judgingRubricItems)]: [rating],
  [entriesKey]: [entry(E_ONE, "Tidewater")],
  [via(judgingSchedules)]: [{ id: "schedule" }],
  [presenceKey]: seatAt(SPONSOR),
  ...over,
});

// A new user for each context: the desk's flood guard counts calls per user.
let callers = 0;
const memberCtx = (db: unknown) => {
  const userId = `assigned-user-${(callers += 1)}`;
  return {
    db,
    session: { user: { id: userId, name: "Grace Hopper" } },
    userId,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as never;
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const minutesAhead = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000);
const takeoverMinutes = TAKEOVER_AFTER_MS / 60_000;

/** A presentation for E_ONE that started `startedMinutesAgo` minutes ago. */
const slot = (
  assignedJudgeId: string | null,
  startedMinutesAgo: number,
  over: Record<string, unknown> = {},
) => ({
  id: "slot-1",
  entryId: E_ONE,
  roomId: ROOM,
  startsAt: minutesAgo(startedMinutesAgo),
  deadlineAt: minutesAhead(10 - startedMinutesAgo),
  endsAt: minutesAhead(12 - startedMinutesAgo),
  assignedJudgeId,
  ...over,
});

const reservedRefusal =
  "Another judge is assigned to this presentation. If they have not started 5 minutes in, you can take it.";
const beingGraded =
  "Another judge is grading this project right now. Pick another one.";
const gradedElsewhere =
  "Another judge has already graded this project for Best Use of AI. Each project is graded once.";

const wrote = (events: Event[], table: unknown) =>
  events.some((e) => e.kind === "insert" && e.table === name(table));

const save = {
  hackathonId: HACK,
  entryId: E_ONE,
  challengeId: SPONSOR,
  ratings: { [RATING]: 4 },
  responses: {},
};

const grade = (answers: Answers) => {
  const fake = fakeDb(answers);
  const caller = judgingDeskRouter.createCaller(memberCtx(fake.db));
  return {
    ...fake,
    caller,
    save: () => caller.saveDraft({ ...save, revision: 0 }),
    start: () =>
      caller.startGrading({
        hackathonId: HACK,
        entryId: E_ONE,
        challengeId: SPONSOR,
      }),
    submit: () => caller.submit({ ...save, expectedRevision: 0 }),
  };
};

describe("claiming a presentation assigned to a judge", () => {
  it("lets the assigned judge claim it as it starts", async () => {
    const { save: go, events } = grade(world({ [slotsKey]: [slot(ME, 0)] }));

    await expect(go()).resolves.toMatchObject({ revision: 1 });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
  });

  it("keeps another judge off until the takeover time, on every way in", async () => {
    const answers = world({ [slotsKey]: [slot(OTHER, takeoverMinutes - 1)] });
    const refused = {
      code: "PRECONDITION_FAILED",
      message: reservedRefusal,
    };

    for (const way of ["save", "start", "submit"] as const) {
      const attempt = grade(answers);
      await expect(attempt[way]()).rejects.toMatchObject(refused);
      expect(wrote(attempt.events, judgingEvaluationDrafts)).toBe(false);
      expect(wrote(attempt.events, judgingEvaluations)).toBe(false);
    }
  });

  it("refuses another judge from the very start of the presentation", async () => {
    const { save: go } = grade(world({ [slotsKey]: [slot(OTHER, 0)] }));

    await expect(go()).rejects.toMatchObject({ message: reservedRefusal });
  });

  it("reads the assignment under the grading lock, after the judge's own draft", async () => {
    // Two judges reaching for it at the takeover time queue on the lock, and
    // the second then sees the first one's draft.
    for (const way of ["save", "start", "submit"] as const) {
      const attempt = grade(world({ [slotsKey]: [slot(OTHER, 1)] }));
      await expect(attempt[way]()).rejects.toMatchObject({
        message: reservedRefusal,
      });

      const at = (match: (e: Event) => boolean) =>
        attempt.events.findIndex(match);
      const ownDraft = at(
        (e) => e.kind === "select" && e.table === drafts && !!e.locking,
      );
      const lock = at((e) => e.kind === "execute");
      const assignment = at((e) => e.table === slotsKey);
      expect(ownDraft).toBeGreaterThan(-1);
      expect(lock).toBeGreaterThan(ownDraft);
      expect(assignment).toBeGreaterThan(lock);
    }
  });

  it("lets another judge take it once the takeover time has passed", async () => {
    const answers = world({ [slotsKey]: [slot(OTHER, takeoverMinutes + 1)] });

    for (const way of ["save", "start", "submit"] as const) {
      const attempt = grade(answers);
      await expect(attempt[way]()).resolves.toBeDefined();
    }
    const { save: go, events } = grade(answers);
    await go();
    expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
  });

  it("refuses a takeover when the assigned judge already holds a draft", async () => {
    const answers = (draft: Record<string, unknown>) =>
      world({
        [slotsKey]: [slot(OTHER, takeoverMinutes + 1)],
        [drafts]: byCall([], [{ judgeId: OTHER, ...draft }]),
      });
    // Opened with nothing saved holds until the deadline, as a saved one does.
    const held = [
      { updatedAt: minutesAgo(takeoverMinutes), deadlineAt: minutesAhead(4) },
      { updatedAt: minutesAgo(1), deadlineAt: null },
    ];

    for (const draft of held) {
      for (const way of ["save", "start", "submit"] as const) {
        const attempt = grade(answers(draft));
        await expect(attempt[way]()).rejects.toMatchObject({
          code: "CONFLICT",
          message: beingGraded,
        });
        expect(wrote(attempt.events, judgingEvaluationDrafts)).toBe(false);
      }
    }
  });

  it("refuses a takeover when the assigned judge already graded it", async () => {
    const { save: go, events } = grade(
      world({
        [slotsKey]: [slot(OTHER, takeoverMinutes + 1)],
        [evaluations]: byCall([], [{ judgeId: OTHER }]),
      }),
    );

    await expect(go()).rejects.toMatchObject({
      code: "CONFLICT",
      message: gradedElsewhere,
    });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(false);
  });

  it("leaves a presentation nobody is assigned to open from the start", async () => {
    const { save: go, events } = grade(world({ [slotsKey]: [slot(null, 1)] }));

    await expect(go()).resolves.toMatchObject({ revision: 1 });
    expect(wrote(events, judgingEvaluationDrafts)).toBe(true);
  });

  it("leaves a judge editing their own evaluation alone, whoever was assigned", async () => {
    const { save: go } = grade(
      world({
        [slotsKey]: [slot(OTHER, 1)],
        [evaluations]: byCall([{ appointmentId: "slot-1" }]),
      }),
    );

    await expect(go()).resolves.toMatchObject({ revision: 1 });
  });

  it("does not care who is assigned at a challenge that is not timed", async () => {
    const { save: go } = grade(
      world({
        [via(judgingChallenges)]: [
          general,
          { ...sponsor, mode: "unscheduled" },
        ],
        [slotsKey]: [slot(OTHER, 1)],
      }),
    );

    await expect(go()).resolves.toMatchObject({ revision: 1 });
  });
});

describe("desk.project for a presentation assigned to a judge", () => {
  const open = async (answers: Answers) => {
    const { db } = fakeDb({
      [via(judgingEntryMembers)]: [{ name: "Ada Lovelace" }],
      ...answers,
    });
    return judgingDeskRouter.createCaller(memberCtx(db)).project({
      hackathonId: HACK,
      entryId: E_ONE,
      challengeId: SPONSOR,
    });
  };

  it("is reserved for another judge, with when it opens and no name", async () => {
    const startsAt = minutesAgo(2);
    const sheet = await open(
      world({ [slotsKey]: [slot(OTHER, 2, { startsAt })] }),
    );

    expect(sheet.grading).toBe("reserved");
    expect(sheet.access).toMatchObject({
      canEdit: false,
      reason: reservedRefusal,
      gradedElsewhere: false,
      needsRoom: false,
      ended: false,
      deadlineAt: null,
    });
    expect(sheet.access.opensAt).toEqual(
      new Date(startsAt.getTime() + TAKEOVER_AFTER_MS),
    );
    // Still there to read.
    expect(sheet.entry.title).toBe("Tidewater");
    expect(JSON.stringify(sheet)).not.toContain(OTHER);
  });

  it("is open once the takeover time has passed", async () => {
    const sheet = await open(
      world({ [slotsKey]: [slot(OTHER, takeoverMinutes + 1)] }),
    );

    expect(sheet.grading).toBe("open");
    expect(sheet.access).toMatchObject({ canEdit: true, reason: null });
    expect(JSON.stringify(sheet)).not.toContain(OTHER);
  });

  it("is being graded, not reserved, once the assigned judge has started", async () => {
    const sheet = await open(
      world({
        [slotsKey]: [slot(OTHER, 2)],
        [drafts]: byCall(
          [],
          [{ judgeId: OTHER, updatedAt: minutesAgo(1), deadlineAt: null }],
        ),
      }),
    );

    expect(sheet.grading).toBe("in_progress");
    expect(sheet.access).toMatchObject({
      canEdit: false,
      reason: beingGraded,
      gradedElsewhere: true,
    });
    expect(JSON.stringify(sheet)).not.toContain(OTHER);
  });

  it("shows the assigned judge nothing new: it is theirs to write", async () => {
    const sheet = await open(world({ [slotsKey]: [slot(ME, 2)] }));

    expect(sheet.grading).toBe("open");
    expect(sheet.access).toMatchObject({
      canEdit: true,
      reason: null,
      opensAt: null,
      gradedElsewhere: false,
    });
  });

  it("is open as before where nobody is assigned", async () => {
    const sheet = await open(world({ [slotsKey]: [slot(null, 2)] }));

    expect(sheet.grading).toBe("open");
    expect(sheet.access.canEdit).toBe(true);
  });
});

describe("desk.projects with assigned presentations", () => {
  const list = async (answers: Answers, over = {}) => {
    const { db } = fakeDb(answers);
    return judgingDeskRouter.createCaller(memberCtx(db)).projects({
      hackathonId: HACK,
      challengeId: SPONSOR,
      ...over,
    });
  };
  const listed = (
    entryId: string,
    assignedJudgeId: string | null,
    startsAt: Date,
  ) => ({
    id: `slot-${entryId}`,
    entryId,
    roomId: ROOM,
    roomName: "Table 4",
    buildingName: null,
    startsAt,
    deadlineAt: new Date(startsAt.getTime() + 10 * 60_000),
    endsAt: new Date(startsAt.getTime() + 12 * 60_000),
    assignedJudgeId,
  });
  const crowded = (over: Answers = {}) =>
    world({
      [entriesKey]: [
        entry(E_ONE, "Alpha"),
        entry(E_TWO, "Bravo"),
        entry(E_THREE, "Charlie"),
      ],
      [listedSlotsKey]: [
        listed(E_ONE, null, minutesAhead(10)),
        listed(E_TWO, ME, minutesAhead(40)),
        listed(E_THREE, ME, minutesAhead(20)),
      ],
      ...over,
    });

  it("puts the judge's assigned presentations first, in start order, marked", async () => {
    const result = await list(crowded());

    expect(result.projects.map((p) => p.id)).toEqual([E_THREE, E_TWO, E_ONE]);
    expect(result.projects.map((p) => p.assignedToYou)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("lists the rest in start order as before", async () => {
    const result = await list(
      crowded({
        [listedSlotsKey]: [
          listed(E_ONE, null, minutesAhead(30)),
          listed(E_TWO, null, minutesAhead(10)),
          listed(E_THREE, null, minutesAhead(20)),
        ],
      }),
    );

    expect(result.projects.map((p) => p.id)).toEqual([E_TWO, E_THREE, E_ONE]);
    expect(result.projects.some((p) => p.assignedToYou)).toBe(false);
  });

  it("shows a presentation kept for another judge as reserved, after the open ones", async () => {
    const started = minutesAgo(2);
    const result = await list(
      crowded({
        [listedSlotsKey]: [
          listed(E_ONE, OTHER, started),
          listed(E_TWO, null, minutesAhead(40)),
          listed(E_THREE, ME, minutesAhead(20)),
        ],
      }),
    );

    expect(
      result.projects.map((p) => [p.id, p.grading, p.assignedToYou]),
    ).toEqual([
      [E_THREE, "open", true],
      [E_TWO, "open", false],
      [E_ONE, "reserved", false],
    ]);
    const reserved = result.projects.find((p) => p.id === E_ONE);
    expect(reserved?.reservedUntil).toEqual(
      new Date(started.getTime() + TAKEOVER_AFTER_MS),
    );
    expect(
      result.projects.find((p) => p.id === E_TWO)?.reservedUntil,
    ).toBeNull();
  });

  it("opens it to the judge once the takeover time has passed", async () => {
    const result = await list(
      crowded({
        [listedSlotsKey]: [
          listed(E_ONE, OTHER, minutesAgo(takeoverMinutes + 1)),
          listed(E_TWO, ME, minutesAhead(40)),
          listed(E_THREE, ME, minutesAhead(20)),
        ],
      }),
    );

    expect(result.projects.find((p) => p.id === E_ONE)).toMatchObject({
      grading: "open",
      reservedUntil: null,
      assignedToYou: false,
    });
  });

  it("never says which judge", async () => {
    const result = await list(
      crowded({
        [listedSlotsKey]: [
          listed(E_ONE, OTHER, minutesAgo(2)),
          listed(E_TWO, OTHER, minutesAgo(takeoverMinutes + 1)),
          listed(E_THREE, ME, minutesAhead(20)),
        ],
      }),
    );

    expect(JSON.stringify(result)).not.toContain(OTHER);
  });
});

describe("desk.nextProject with assigned presentations", () => {
  const POOL = [E_ONE, E_TWO, E_THREE];
  const next = async (answers: Answers) => {
    const { db } = fakeDb(answers);
    return judgingDeskRouter
      .createCaller(memberCtx(db))
      .nextProject({ hackathonId: HACK, challengeId: SPONSOR });
  };
  const running = (
    entryId: string,
    assignedJudgeId: string | null,
    startedMinutesAgo: number,
  ) => slot(assignedJudgeId, startedMinutesAgo, { id: entryId, entryId });
  const crowded = (slots: unknown[]) =>
    world({
      [entriesKey]: POOL.map((id) => ({ id })),
      [slotsKey]: slots,
    });

  it("sends the judge to their own assigned presentation first", async () => {
    // Whatever place the queue would give each, the assigned one leads.
    for (const mine of POOL) {
      const result = await next(
        crowded(POOL.map((id) => running(id, id === mine ? ME : null, 2))),
      );
      expect(result.entryId).toBe(mine);
    }
  });

  it("then offers one open for takeover, never one still reserved", async () => {
    const result = await next(
      crowded([
        running(E_ONE, OTHER, 2),
        running(E_TWO, OTHER, takeoverMinutes + 1),
        running(E_THREE, OTHER, 1),
      ]),
    );

    expect(result.entryId).toBe(E_TWO);
  });

  it("is nothing when every running presentation is reserved for others", async () => {
    const result = await next(
      crowded([running(E_ONE, OTHER, 2), running(E_TWO, OTHER, 1)]),
    );

    expect(result.entryId).toBeNull();
    expect(result.needsRoom).toBe(false);
  });

  it("passes over an assigned presentation the judge skipped", async () => {
    const { db } = fakeDb(
      crowded([
        running(E_ONE, ME, 2),
        running(E_TWO, null, 2),
        running(E_THREE, OTHER, 1),
      ]),
    );

    const result = await judgingDeskRouter
      .createCaller(memberCtx(db))
      .nextProject({ hackathonId: HACK, challengeId: SPONSOR, skip: [E_ONE] });

    expect(result.entryId).toBe(E_TWO);
  });

  it("leaves an untimed challenge to its queue window", async () => {
    const result = await next(
      world({
        [via(judgingChallenges)]: [
          general,
          { ...sponsor, mode: "unscheduled" },
        ],
        [entriesKey]: POOL.map((id) => ({ id })),
        // Assignments mean nothing where nothing is timed.
        [slotsKey]: POOL.map((id) => running(id, OTHER, 1)),
      }),
    );

    expect(POOL).toContain(result.entryId);
  });
});

describe("desk.itinerary", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "slot-1",
    entryId: E_ONE,
    challengeId: SPONSOR,
    title: "Tidewater",
    roomId: ROOM,
    roomName: "Table 4",
    roomKind: "table",
    buildingName: "Klaus",
    startsAt: minutesAhead(10),
    deadlineAt: minutesAhead(20),
    ...over,
  });
  const itineraryKey = via(
    judgingAppointments,
    judgingEntries,
    judgingRooms,
    judgingBuildings,
  );
  const itinerary = async (answers: Answers) => {
    const fake = fakeDb(world(answers));
    const result = await judgingDeskRouter
      .createCaller(memberCtx(fake.db))
      .itinerary({ hackathonId: HACK });
    return { result, ...fake };
  };

  it("lists the judge's own presentations with where, when and what challenge", async () => {
    const { result } = await itinerary({
      [itineraryKey]: [
        row(),
        row({
          id: "slot-2",
          entryId: E_TWO,
          title: "Undertow",
          challengeId: GENERAL,
          roomId: ELSEWHERE,
          roomName: "1116",
          roomKind: "room",
          buildingName: null,
        }),
      ],
    });

    expect(result.presentations).toHaveLength(2);
    expect(result.presentations[0]).toMatchObject({
      entryId: E_ONE,
      title: "Tidewater",
      roomId: ROOM,
      roomName: "Table 4",
      roomKind: "table",
      buildingName: "Klaus",
      challengeId: SPONSOR,
      challengeLabel: "Best Use of AI",
      graded: false,
      takenOver: false,
      inRoom: true,
    });
    expect(result.presentations[0]?.startsAt).toBeInstanceOf(Date);
    expect(result.presentations[0]?.deadlineAt).toBeInstanceOf(Date);
    // Seated at the sponsor's table: the other is in a room the judge is not in.
    expect(result.presentations[1]).toMatchObject({
      challengeLabel: "General",
      inRoom: false,
    });
  });

  it("asks only for the judge's own presentations that have not ended", async () => {
    const { events } = await itinerary({ [itineraryKey]: [row()] });

    const read = events.find((e) => e.table === itineraryKey);
    const { sql, params } = new PgDialect().sqlToQuery(read?.where as SQL);
    expect(sql).toContain('"assigned_judge_id" = $');
    expect(params).toContain(ME);
    expect(sql).toContain('"deadline_at" > $');
    expect(sql).toContain('"deleted_at" is null');
  });

  it("says a presentation is graded, or that another judge has taken it, without who", async () => {
    const { result } = await itinerary({
      [itineraryKey]: [
        row({ id: "a", entryId: E_ONE }),
        row({ id: "b", entryId: E_TWO }),
        row({ id: "c", entryId: E_THREE }),
      ],
      [evaluations]: [{ entryId: E_ONE, challengeId: SPONSOR, judgeId: OTHER }],
      [drafts]: [
        {
          entryId: E_TWO,
          challengeId: SPONSOR,
          judgeId: OTHER,
          updatedAt: minutesAgo(1),
          deadlineAt: minutesAhead(5),
        },
        // A stale draft holds nothing.
        {
          entryId: E_THREE,
          challengeId: SPONSOR,
          judgeId: OTHER,
          updatedAt: new Date(Date.now() - GRADING_HOLD_MS - 60_000),
          deadlineAt: null,
        },
      ],
    });

    expect(
      result.presentations.map((p) => [p.entryId, p.graded, p.takenOver]),
    ).toEqual([
      [E_ONE, true, false],
      [E_TWO, false, true],
      [E_THREE, false, false],
    ]);
    expect(JSON.stringify(result)).not.toContain(OTHER);
  });

  it("is empty when the judge has nothing assigned, and before a schedule is saved", async () => {
    const none = await itinerary({ [itineraryKey]: [] });
    expect(none.result.presentations).toEqual([]);

    const unscheduled = await itinerary({
      [via(judgingSchedules)]: [],
      [itineraryKey]: [row()],
    });
    expect(unscheduled.result.presentations).toEqual([]);
  });
});

describe("desk.releaseGrading", () => {
  const release = async (answers: Answers, input = {}) => {
    const fake = fakeDb(world(answers));
    const result = await judgingDeskRouter
      .createCaller(memberCtx(fake.db))
      .releaseGrading({
        hackathonId: HACK,
        entryId: E_ONE,
        challengeId: SPONSOR,
        ...input,
      });
    return { result, ...fake };
  };
  const opened = { id: "draft-1", revision: 0 };
  const deleted = (events: Event[]) =>
    events.some((e) => e.kind === "delete" && e.table === drafts);

  it("deletes a draft the judge opened and never saved, locking it first", async () => {
    const { result, events } = await release({ [drafts]: [opened] });

    expect(result).toEqual({ released: true });
    expect(deleted(events)).toBe(true);
    const read = events.findIndex(
      (e) => e.kind === "select" && e.table === drafts,
    );
    expect(events[read]?.locking).toBe(true);
    expect(read).toBeLessThan(events.findIndex((e) => e.kind === "delete"));
  });

  it("only touches the judge's own draft", async () => {
    const { events } = await release({ [drafts]: [opened] });

    const read = events.find((e) => e.kind === "select" && e.table === drafts);
    const { params } = new PgDialect().sqlToQuery(read?.where as SQL);
    expect(params).toContain(ME);
    expect(params).toContain(E_ONE);
    expect(params).toContain(SPONSOR);
    const gone = events.find((e) => e.kind === "delete");
    expect(new PgDialect().sqlToQuery(gone?.where as SQL).params).toEqual([
      "draft-1",
    ]);
  });

  it("keeps a draft the judge has saved to", async () => {
    const { result, events } = await release({
      [drafts]: [{ id: "draft-1", revision: 1 }],
    });

    expect(result).toEqual({ released: false });
    expect(deleted(events)).toBe(false);
  });

  it("keeps a draft of a project the judge has graded", async () => {
    const { result, events } = await release({
      [drafts]: [opened],
      [evaluations]: [{ id: "evaluation-1" }],
    });

    expect(result).toEqual({ released: false });
    expect(deleted(events)).toBe(false);
  });

  it("is nothing when the judge holds no draft", async () => {
    const { result, events } = await release({});

    expect(result).toEqual({ released: false });
    expect(deleted(events)).toBe(false);
  });

  it("gives back a sponsor's project from a judge who has left its room", async () => {
    const { result } = await release({
      [drafts]: [opened],
      [presenceKey]: [],
    });

    expect(result).toEqual({ released: true });
  });

  it("finds the challenge by the judge's seat when none is passed", async () => {
    const { result } = await release(
      { [drafts]: [opened] },
      { challengeId: undefined },
    );

    expect(result).toEqual({ released: true });
  });

  it("leaves a challenge of another edition alone", async () => {
    const { result, events } = await release(
      { [drafts]: [opened] },
      { challengeId: "0c4a8e99-2b3d-4c5e-9f60-7a8b9c0d1e2f" },
    );

    expect(result).toEqual({ released: false });
    expect(deleted(events)).toBe(false);
  });

  it("takes only the draft's row lock, never the grading lock", async () => {
    // A save racing it waits on the same row: one that lands first leaves a
    // saved draft this keeps, and one that lands after starts a new draft.
    // With no grading lock, it cannot deadlock with a judge's claim.
    const { events } = await release({ [drafts]: [opened] });

    expect(events.some((e) => e.kind === "execute")).toBe(false);
    expect(
      events
        .filter((e) => e.kind === "select" && e.locking)
        .map((e) => e.table),
    ).toEqual([drafts]);
  });
});

describe("the scores the desk shows count what placings count", () => {
  const MINE = "evaluation-mine";
  const two = [rating, { ...rating, id: RATING_2, label: "Polish" }];
  const own = (isComplete: boolean) => ({
    id: MINE,
    revision: 1,
    isComplete,
    appointmentId: null,
    submittedAt: minutesAgo(30),
    autoSubmittedAt: minutesAgo(30),
    updatedAt: minutesAgo(30),
  });
  const rated = (...items: string[]) =>
    items.map((itemId) => ({ evaluationId: MINE, itemId, value: 4 }));

  const sheet = async (answers: Answers) => {
    const { db } = fakeDb(
      world({
        [via(judgingChallenges)]: [general],
        [via(judgingEntryMembers)]: [{ name: "Ada Lovelace" }],
        [slotsKey]: [],
        [via(judgingSchedules)]: [],
        ...answers,
      }),
    );
    return judgingDeskRouter.createCaller(memberCtx(db)).project({
      hackathonId: HACK,
      entryId: E_ONE,
      challengeId: GENERAL,
    });
  };
  const withEvaluation = (
    isComplete: boolean,
    items: string[],
    rubric = two,
  ) => ({
    [via(judgingRubricItems)]: rubric,
    [evaluations]: byCall(
      [own(isComplete)],
      [{ judgeId: ME }],
      [{ id: MINE, challengeId: GENERAL }],
    ),
    [via(judgingEvaluationRatings)]: rated(...items),
  });

  it("scores an evaluation that rated every item though a response was left empty", async () => {
    const result = await sheet(withEvaluation(false, [RATING, RATING_2]));

    expect(result.evaluation).toMatchObject({ isComplete: false, score: 4 });
    expect(result.scores?.challenge).toEqual({ score: 4, count: 1 });
    expect(result.scores?.overall).toEqual({ score: 4, count: 1 });
  });

  it("leaves out an evaluation that is missing a rating", async () => {
    const result = await sheet(withEvaluation(false, [RATING]));

    expect(result.evaluation?.score).toBeNull();
    expect(result.scores?.challenge).toEqual({ score: null, count: 0 });
  });

  it("scores a whole evaluation as before", async () => {
    const result = await sheet(withEvaluation(true, [RATING], [rating]));

    expect(result.evaluation?.score).toBe(4);
    expect(result.scores?.challenge).toEqual({ score: 4, count: 1 });
  });

  it("scores the same in the judge's submitted list", async () => {
    const mine = async (items: string[]) => {
      const { db } = fakeDb(
        world({
          [via(judgingRubricItems)]: two,
          [via(judgingEvaluations, judgingEntries)]: [],
          [via(judgingEvaluations, judgingEntries, judgingChallenges)]: [
            {
              id: MINE,
              entryId: E_ONE,
              challengeId: GENERAL,
              challengeLabel: "General",
              title: "Tidewater",
              deletedAt: null,
              revision: 1,
              isComplete: false,
              submittedAt: minutesAgo(30),
              autoSubmittedAt: minutesAgo(30),
              updatedAt: minutesAgo(30),
            },
          ],
          [via(judgingEvaluationRatings)]: rated(...items),
        }),
      );
      return judgingDeskRouter
        .createCaller(memberCtx(db))
        .myEvaluations({ hackathonId: HACK });
    };

    expect((await mine([RATING, RATING_2]))[0]?.score).toBe(4);
    expect((await mine([RATING]))[0]?.score).toBeNull();
  });
});
