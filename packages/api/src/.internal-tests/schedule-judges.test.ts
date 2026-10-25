/**
 * Judges on the saved schedule: saving gives every presentation a judge as far
 * as there are judges, the board shows who grades what and where judges run
 * short, "assign judges" picks again for what has not started, and an
 * organiser can set one appointment's judge by hand until it starts.
 *
 * The schema is the real one and so is the scheduling code; only the database
 * handle is a stand-in, handed to the router through the context the way
 * check-in-flags-organizer.test.ts does. It keeps the rows of the tables the
 * router reads and records what it writes. The CP-SAT runner is a stub, so a
 * test decides what the script "printed" and sees exactly what it was asked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  auditLogs,
  hackathons,
  judgingAppointments,
  judgingChallenges,
  judgingConfigs,
  judgingEntryChallenges,
  judgingEvaluationDrafts,
  judgingEvaluations,
  judgingGuestSessions,
  judgingJudges,
  judgingPresence,
  judgingRooms,
  judgingSchedules,
} from "@query/db";
import { appRouter } from "../root";
import { rebalanceIfDue, rebalanceThrottle } from "../routers/judging/schedule";
import { cache } from "../middleware/cache";
import { assignJudges } from "../services/judging/schedule/judges";
import type * as Store from "../services/judging/evaluation-store";
import type * as Runner from "../services/judging/schedule/cpsat-runner";

const mockAvailable = vi.fn();
const mockRun = vi.fn();

// Nothing is due on any board read here, so there is nothing to reconcile.
vi.mock("../services/judging/evaluation-store", async (importActual) => ({
  ...(await importActual<typeof Store>()),
  reconcileDueDrafts: async () => undefined,
}));
vi.mock("../services/judging/schedule/cpsat-runner", async (importActual) => ({
  ...(await importActual<typeof Runner>()),
  cpsatAvailable: () => mockAvailable(),
  runCpsat: (...args: unknown[]) => mockRun(...args),
}));

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HACK = id(1);
const GENERAL = id(10);
const ACME = id(11);
const G1 = id(20);
const G2 = id(21);
const A1 = id(22);
const A2 = id(23);
const E1 = id(30);
const E2 = id(31);
const E3 = id(32);
const APPT = [id(40), id(41), id(42), id(43)] as const;
const [P1, P2, P3, P4] = APPT;
const M1 = id(50);
const M2 = id(51);
const GS = id(52);
const NOROOM = id(53);
const SCHEDULE = id(60);

// Slots are 10 minutes from 14:00. It is 15:00, so P1 (14:00) is over and the
// rest (15:30 and 16:00) are still to come.
const NOW = new Date("2027-02-06T15:00:00Z");
const at = (time: string) => new Date(`2027-02-06T${time}:00Z`);

const dialect = new PgDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as never);

type Row = Record<string, any>;
type Write = { table: unknown; values: Row | Row[]; where?: unknown };

const camel = (name: string) =>
  name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const TERM = /"[a-z_]+"\."([a-z_]+)" = \$(\d+)/g;

/** A row filter from a where of `column = value` terms, or null for anything else. */
function matcher(where: unknown) {
  const { sql: text, params } = render(where);
  const terms = [...text.matchAll(TERM)].map(
    (match) => [camel(match[1]!), params[Number(match[2]) - 1]] as const,
  );
  if (text.replace(TERM, "").replace(/[()\s]|and/g, "")) return null;
  return (row: Row) => terms.every(([key, value]) => row[key] === value);
}

let adminRow: Row | undefined;
const store = new Map<unknown, Row[]>();
const inserts: Write[] = [];
const updates: Write[] = [];
// Counts reads of a table, so a test can change what a later read returns.
const reads = new Map<unknown, number>();
let onRead: ((table: unknown, count: number) => Row[] | undefined) | null =
  null;

const fakeDb: any = {
  query: { admins: { findFirst: async () => adminRow } },
  select: () => {
    let table: unknown = null;
    let where: unknown = null;
    const chain: any = {
      then: (ok: any, err: any) => {
        const count = (reads.get(table) ?? 0) + 1;
        reads.set(table, count);
        const rows = onRead?.(table, count) ?? store.get(table) ?? [];
        const keep = where ? matcher(where) : null;
        return Promise.resolve(keep ? rows.filter(keep) : [...rows]).then(
          ok,
          err,
        );
      },
    };
    chain.from = (from: unknown) => {
      table = from;
      return chain;
    };
    chain.where = (condition: unknown) => {
      where = condition;
      return chain;
    };
    for (const method of ["innerJoin", "leftJoin", "orderBy", "limit", "for"]) {
      chain[method] = () => chain;
    }
    return chain;
  },
  insert: (table: unknown) => ({
    values: (values: Row | Row[]) => {
      inserts.push({ table, values });
      return Object.assign(Promise.resolve(undefined), {
        onConflictDoNothing: () => ({ returning: async () => [] }),
        returning: async () => [values],
      });
    },
  }),
  update: (table: unknown) => ({
    set: (values: Row) => ({
      where: (where: unknown) => {
        const keep = matcher(where);
        const hit = keep ? (store.get(table) ?? []).filter(keep) : [];
        for (const row of hit) Object.assign(row, values);
        updates.push({ table, values, where });
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
  inserts
    .filter((write) => write.table === auditLogs)
    .map((write) => write.values as Row);

/** The appointments an update touched, by the ids in its where. */
const touched = (write: Write) =>
  render(write.where).params.filter((p) => APPT.includes(p as never));

/** Which judge each appointment was left with by the judge updates. */
function judgeAfter() {
  const result = new Map<string, string | null>();
  for (const write of updates) {
    if (write.table !== judgingAppointments) continue;
    if (!("assignedJudgeId" in (write.values as Row))) continue;
    for (const apptId of touched(write)) {
      result.set(apptId as string, (write.values as Row).assignedJudgeId);
    }
  }
  return result;
}

const appointment = (apptId: string, over: Row): Row => ({
  id: apptId,
  scheduleId: SCHEDULE,
  hackathonId: HACK,
  revision: 0,
  assignedJudgeId: null,
  entryDeletedAt: null,
  deadlineAt: null,
  ...over,
});
const times = (start: string) => ({
  startsAt: at(start),
  deadlineAt: at(start),
  endsAt: new Date(at(start).getTime() + 10 * 60_000),
});

// Over (P1), then P2 and P3 at once, then P4 for the sponsor.
const appointments = (): Row[] => [
  appointment(P1, {
    entryId: E1,
    challengeId: GENERAL,
    roomId: G1,
    entryTitle: "Project 1",
    ...times("14:00"),
  }),
  appointment(P2, {
    entryId: E2,
    challengeId: GENERAL,
    roomId: G1,
    entryTitle: "Project 2",
    ...times("15:30"),
  }),
  appointment(P3, {
    entryId: E3,
    challengeId: GENERAL,
    roomId: G2,
    entryTitle: "Project 3",
    ...times("15:30"),
  }),
  appointment(P4, {
    entryId: E1,
    challengeId: ACME,
    roomId: A1,
    entryTitle: "Project 1",
    ...times("16:00"),
  }),
];

const judge = (judgeId: string, kind: string, displayName: string) => ({
  id: judgeId,
  kind,
  userId: kind === "member" ? `user-${displayName}` : null,
  displayName,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  cache.clear();
  inserts.length = 0;
  updates.length = 0;
  reads.clear();
  onRead = null;
  mockAvailable.mockReturnValue(false);
  adminRow = { userId: "admin_user", isActive: true, role: "admin" };

  store.clear();
  // Every table the router reads by edition holds that edition's rows.
  const set = store.set.bind(store);
  store.set = (table, rows) =>
    set(
      table,
      table === hackathons ||
        table === judgingSchedules ||
        table === judgingConfigs
        ? rows
        : rows.map((row) => ({ hackathonId: HACK, ...row })),
    );
  store.set(hackathons, [
    { id: HACK, name: "Hacklytics 2027", startDate: null, endDate: null },
  ]);
  store.set(judgingConfigs, [{ hackathonId: HACK, state: "open" }]);
  store.set(judgingSchedules, [
    {
      id: SCHEDULE,
      hackathonId: HACK,
      windowStart: at("14:00"),
      windowEnd: at("17:00"),
      setupMinutes: 2,
      judgingMinutes: 6,
      teardownMinutes: 2,
      sameBuildingBreakMinutes: 10,
      crossBuildingBreakMinutes: 20,
      reducedBreaksAcknowledgedAt: null,
      firstResultAt: null,
      createdById: "admin_user",
      createdAt: NOW,
    },
  ]);
  const challenge = (cid: string, label: string, general: boolean) => ({
    id: cid,
    label,
    parentId: null,
    mode: "scheduled",
    isGeneral: general,
    isGroup: false,
  });
  store.set(judgingChallenges, [
    challenge(GENERAL, "General", true),
    challenge(ACME, "Acme", false),
  ]);
  const room = (
    rid: string,
    name: string,
    challengeId: string,
    building: string,
  ) => ({
    id: rid,
    name,
    kind: "table",
    challengeId,
    buildingId: building,
    buildingName: building,
    archivedAt: null,
  });
  store.set(judgingRooms, [
    room(G1, "Table G1", GENERAL, "ENG"),
    room(G2, "Table G2", GENERAL, "ENG"),
    room(A1, "Acme 1", ACME, "HEC"),
    room(A2, "Acme 2", ACME, "HEC"),
  ]);
  store.set(judgingEntryChallenges, [
    { entryId: E1, challengeId: GENERAL, title: "Project 1" },
    { entryId: E2, challengeId: GENERAL, title: "Project 2" },
    { entryId: E3, challengeId: GENERAL, title: "Project 3" },
    { entryId: E1, challengeId: ACME, title: "Project 1" },
  ]);
  store.set(judgingAppointments, appointments());
  store.set(judgingEvaluations, []);
  store.set(judgingEvaluationDrafts, []);
  store.set(judgingPresence, []);
  store.set(judgingJudges, [
    judge(M1, "member", "Ada"),
    judge(M2, "member", "Bea"),
    judge(GS, "guest", "Grace"),
    judge(NOROOM, "guest", "Nobody"),
  ]);
  store.set(judgingGuestSessions, [
    {
      judgeId: GS,
      roomId: A1,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 8 * 3600_000),
    },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Gives an appointment a judge in the stored rows. */
const give = (apptId: string, judgeId: string) => {
  store
    .get(judgingAppointments)!
    .find((a) => a.id === apptId)!.assignedJudgeId = judgeId;
};

// ---------------------------------------------------------------------------
describe("judging.schedule.get", () => {
  it("shows each appointment's judge, each judge's load and where judges run short", async () => {
    // Only Ada and Grace have joined: two general presentations at 15:30 need two.
    store.set(judgingJudges, [
      judge(M1, "member", "Ada"),
      judge(GS, "guest", "Grace"),
    ]);
    give(P2, M1);
    give(P4, GS);

    const board = await admin().judging.schedule.get({ hackathonId: HACK });

    expect(
      board.appointments.map((a) => [
        a.id,
        a.assignedJudgeName,
        a.canAssignJudge,
      ]),
    ).toEqual([
      [P1, null, false],
      [P2, "Ada", true],
      [P3, null, true],
      [P4, "Grace", true],
    ]);
    expect(board.judging).toMatchObject({
      judges: 2,
      assigned: 2,
      unassigned: 1,
      loads: [
        { judgeId: M1, name: "Ada", kind: "member", load: 1, available: true },
        {
          judgeId: GS,
          name: "Grace",
          kind: "guest",
          roomName: "Acme 1",
          load: 1,
        },
      ],
      warnings: [
        {
          slot: 9,
          challengeId: GENERAL,
          challengeLabel: "General",
          presentations: 2,
          judgesFree: 1,
          message: "Slot 10: 2 presentations in General, only 1 judge free",
        },
      ],
    });
    expect(board.judging!.warnings[0]!.startsAt).toEqual(at("15:30"));
  });

  it("lists a judge who holds appointments but can no longer take any", async () => {
    store.set(judgingJudges, [
      judge(M1, "member", "Ada"),
      judge(GS, "guest", "Grace"),
    ]);
    // Grace's session was revoked: she has no room, but P4 is still hers.
    store.set(judgingGuestSessions, []);
    give(P4, GS);

    const board = await admin().judging.schedule.get({ hackathonId: HACK });
    expect(board.judging!.loads).toEqual([
      expect.objectContaining({ judgeId: M1, load: 0, available: true }),
      expect.objectContaining({
        judgeId: GS,
        name: "Grace",
        load: 1,
        available: false,
      }),
    ]);
  });

  it("says nothing of judges before a schedule is saved", async () => {
    store.set(judgingSchedules, []);
    const board = await admin().judging.schedule.get({ hackathonId: HACK });
    expect(board.judging).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("judging.schedule.get: where each assigned judge has got", () => {
  const evaluation = (
    judgeId: string,
    entryId: string,
    challengeId: string,
    appointmentId: string | null,
    ratingsComplete = true,
  ) => ({ judgeId, entryId, challengeId, appointmentId, ratingsComplete });
  const draft = (
    judgeId: string,
    entryId: string,
    challengeId: string,
    appointmentId: string | null,
    updatedAt = NOW,
  ) => ({ judgeId, entryId, challengeId, appointmentId, updatedAt });

  // The clock stays at 15:00: the rate limiter reads it, and a clock that
  // runs backwards between tests starves its bucket. Presentations start
  // earlier instead.
  const startAt = (apptId: string, time: string) => {
    store.get(judgingAppointments)!.find((a) => a.id === apptId)!.startsAt =
      at(time);
  };

  const progress = async () => {
    const board = await admin().judging.schedule.get({ hackathonId: HACK });
    return Object.fromEntries(
      board.appointments.map((a) => [a.id, a.judgeProgress]),
    );
  };

  it("tells graded, grading, taken over and not started apart, and leaves the rest blank", async () => {
    // It is 15:00: P1 is over, P2 and P3 began long enough ago for the
    // takeover time to have passed and P4 is still to come.
    startAt(P2, "14:10");
    startAt(P3, "14:20");
    give(P1, M1);
    give(P2, M1);
    give(P3, M2);
    give(P4, GS);
    store.set(judgingEvaluations, [
      // Ada graded P1.
      evaluation(M1, E1, GENERAL, P1),
      // Bea graded P2, which was Ada's.
      evaluation(M2, E2, GENERAL, P2),
    ]);

    await expect(progress()).resolves.toEqual({
      [P1]: "graded",
      [P2]: "taken_over",
      // Nobody has begun it and Bea had 5 minutes.
      [P3]: "not_started",
      // Not started yet.
      [P4]: null,
    });

    // A draft is a start.
    store.set(judgingEvaluations, []);
    store.set(judgingEvaluationDrafts, [
      draft(M2, E3, GENERAL, P3),
      draft(M2, E2, GENERAL, P2),
    ]);
    await expect(progress()).resolves.toMatchObject({
      [P1]: "not_started",
      // Ada's, with Bea's draft on it.
      [P2]: "taken_over",
      // Bea's own.
      [P3]: "grading",
    });
  });

  it("gives the assigned judge five minutes from the start before it flags them", async () => {
    give(P2, M1);
    startAt(P2, "14:56");
    await expect(progress()).resolves.toMatchObject({ [P2]: null });
    startAt(P2, "14:55");
    await expect(progress()).resolves.toMatchObject({ [P2]: "not_started" });
  });

  it("does not count a draft left without its deadline once the presentation is over", async () => {
    // P1's deadline was 14:00. Ada only opened it, so her empty draft was
    // kept without its deadline and will never be submitted.
    give(P1, M1);
    store.set(judgingEvaluationDrafts, [
      { ...draft(M1, E1, GENERAL, P1, at("13:58")), deadlineAt: null },
    ]);
    await expect(progress()).resolves.toMatchObject({ [P1]: "not_started" });

    // Still carrying it: due, and about to be submitted for her.
    store.set(judgingEvaluationDrafts, [
      { ...draft(M1, E1, GENERAL, P1, at("13:58")), deadlineAt: at("14:00") },
    ]);
    await expect(progress()).resolves.toMatchObject({ [P1]: "grading" });
  });

  it("matches evaluations and drafts to the presentation the way the board does", async () => {
    startAt(P2, "14:10");
    startAt(P3, "14:20");
    give(P2, M1);
    give(P3, M1);
    store.set(judgingEvaluations, [
      // Names P2, whatever its challenge.
      evaluation(M1, E2, ACME, P2),
      // Names no slot: the project and a challenge under P3's root.
      evaluation(M1, E3, GENERAL, null),
    ]);
    // Another project's evaluation, and a slot P3 was moved from.
    store.set(judgingEvaluationDrafts, [
      draft(M2, E2, GENERAL, P3),
      draft(M2, E1, GENERAL, null),
    ]);

    await expect(progress()).resolves.toMatchObject({
      [P2]: "graded",
      [P3]: "graded",
    });
  });

  it("leaves a presentation with no judge, or whose project is gone, blank", async () => {
    startAt(P2, "14:10");
    startAt(P3, "14:20");
    give(P2, M1);
    store.get(judgingAppointments)!.find((a) => a.id === P2)!.entryDeletedAt =
      NOW;
    store.set(judgingEvaluations, [evaluation(M2, E1, GENERAL, P1)]);

    const board = await admin().judging.schedule.get({ hackathonId: HACK });
    expect(
      board.appointments.map((a) => [a.id, a.removed, a.judgeProgress]),
    ).toEqual([
      // Graded by someone, but nobody was assigned.
      [P1, false, null],
      [P2, true, null],
      [P3, false, null],
      [P4, false, null],
    ]);
  });

  it("reads a presentation's status from evaluations that hold every rating", async () => {
    store.set(judgingEvaluations, [evaluation(M1, E1, GENERAL, P1, false)]);
    const short = await admin().judging.schedule.get({ hackathonId: HACK });
    expect(short.appointments[0]).toMatchObject({
      id: P1,
      status: "incomplete",
      evaluationCount: 1,
    });

    store.set(judgingEvaluations, [evaluation(M1, E1, GENERAL, P1, true)]);
    const whole = await admin().judging.schedule.get({ hackathonId: HACK });
    expect(whole.appointments[0]).toMatchObject({ id: P1, status: "complete" });
  });
});

// ---------------------------------------------------------------------------
describe("judging.schedule.assignJudges", () => {
  const run = () =>
    admin().judging.schedule.assignJudges({ hackathonId: HACK });

  it("gives every appointment that has not started a judge who may grade it", async () => {
    const result = await run();

    expect(result).toMatchObject({
      solver: "in-app",
      changed: 3,
      assigned: 3,
      unassigned: 0,
      warnings: [],
    });
    const after = judgeAfter();
    // The sponsor presentation goes to the sponsor's own judge.
    expect(after.get(P4)).toBe(GS);
    // The two at 15:30 are in different rooms at once: two judges.
    expect(new Set([after.get(P2), after.get(P3)])).toEqual(new Set([M1, M2]));
    // The one that is over is left as it is.
    expect(after.has(P1)).toBe(false);
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "judging.schedule.assignJudges",
        resourceId: HACK,
        metadata: expect.objectContaining({
          solver: "in-app",
          changed: 3,
          unassigned: 0,
        }),
      }),
    ]);
  });

  it("hands nothing to a judge who has left, once judging is under way", async () => {
    const seen = (judgeId: string, gone: boolean) => ({
      judgeId,
      roomId: G1,
      joinedAt: new Date(NOW.getTime() - 60 * 60_000),
      lastSeenAt: new Date(NOW.getTime() - (gone ? 7 : 0.5) * 60_000),
      leftAt: gone ? new Date(NOW.getTime() - 6 * 60_000) : null,
    });
    store.set(judgingPresence, [seen(M1, true), seen(M2, false)]);

    await run();

    const after = judgeAfter();
    expect([...after.values()]).not.toContain(M1);
    expect([after.get(P2), after.get(P3)]).toContain(M2);
  });

  it("hands nothing to a member who never checked in, once judging is under way", async () => {
    // Ten minutes before P2 and P3: Ada never joined and holds nothing; Bea is here.
    vi.setSystemTime(new Date(NOW.getTime() + 20 * 60_000));
    store.set(judgingPresence, [
      {
        judgeId: M2,
        roomId: G1,
        joinedAt: new Date(Date.now() - 60 * 60_000),
        lastSeenAt: new Date(Date.now() - 30_000),
        leftAt: null,
      },
    ]);

    // Its own caller, so the flood guard on the shared admin is not spent.
    await callerAs("day_admin").judging.schedule.assignJudges({
      hackathonId: HACK,
    });

    const after = judgeAfter();
    expect([...after.values()]).not.toContain(M1);
    expect([after.get(P2), after.get(P3)]).toContain(M2);
  });

  it("keeps the judge of an appointment a judge has begun, and plans around it", async () => {
    give(P2, M1);
    // Ada has a draft on P2: it stays hers, so P3 goes to Bea.
    store.set(judgingEvaluationDrafts, [
      { entryId: E2, challengeId: GENERAL, appointmentId: null },
    ]);

    const result = await run();

    expect(result).toMatchObject({ kept: 1, changed: 2 });
    const after = judgeAfter();
    expect(after.has(P2)).toBe(false);
    expect(after.get(P3)).toBe(M2);
  });

  it("leaves appointments alone that already have the judge it would choose", async () => {
    await run();
    const first = judgeAfter();
    updates.length = 0;
    for (const [apptId, judgeId] of first) give(apptId, judgeId!);

    const again = await run();
    expect(again.changed).toBe(0);
    expect(updates.filter((u) => u.table === judgingAppointments)).toEqual([]);
  });

  it("runs CP-SAT when the server has it and takes its assignments", async () => {
    mockAvailable.mockReturnValue(true);
    mockRun.mockImplementation(async (problem: Row) => ({
      status: "solved",
      log: [],
      solution: JSON.stringify({
        format: "query-judging-schedule-solution",
        version: 1,
        fingerprint: problem.fingerprint,
        status: "optimal",
        relaxed: false,
        placements: problem.placements,
        // Bea at 15:30 in G1 and Ada in G2: the in-app order is the other way.
        assignments: [
          { entryId: E2, challengeId: GENERAL, judgeId: M2 },
          { entryId: E3, challengeId: GENERAL, judgeId: M1 },
          { entryId: E1, challengeId: ACME, judgeId: GS },
        ],
      }),
    }));

    const result = await admin().judging.schedule.assignJudges({
      hackathonId: HACK,
      seconds: 30,
    });

    expect(result.solver).toBe("cp-sat");
    expect(judgeAfter().get(P2)).toBe(M2);
    expect(judgeAfter().get(P3)).toBe(M1);
    // It was asked for the schedule as it stands, with the judges.
    const [problem, options] = mockRun.mock.calls[0]!;
    expect(options).toMatchObject({ seconds: 30 });
    expect(problem.placements).toHaveLength(3);
    expect(problem.judges.map((j: Row) => j.id)).toEqual([M1, M2, GS]);
  });

  it("falls back to the in-app assigner when CP-SAT fails or answers against the rules", async () => {
    mockAvailable.mockReturnValue(true);
    mockRun.mockResolvedValueOnce({
      status: "failed",
      reason: "no python",
      log: [],
    });
    expect((await run()).solver).toBe("in-app");

    // Ada in two rooms at once.
    mockRun.mockImplementationOnce(async (problem: Row) => ({
      status: "solved",
      log: [],
      solution: JSON.stringify({
        format: "query-judging-schedule-solution",
        version: 1,
        fingerprint: problem.fingerprint,
        status: "optimal",
        relaxed: false,
        placements: problem.placements,
        assignments: [
          { entryId: E2, challengeId: GENERAL, judgeId: M1 },
          { entryId: E3, challengeId: GENERAL, judgeId: M1 },
        ],
      }),
    }));
    expect((await run()).solver).toBe("in-app");
  });

  it("warns of each slot where judges run short", async () => {
    store.set(judgingJudges, [judge(M1, "member", "Ada")]);
    const result = await run();
    expect(result.unassigned).toBe(1);
    expect(result.warnings.map((w) => w.message)).toEqual([
      "Slot 10: 2 presentations in General, only 1 judge free",
    ]);
  });

  it("refuses when no judge can be assigned yet", async () => {
    store.set(judgingJudges, [judge(NOROOM, "guest", "Nobody")]);
    await expect(run()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("refuses without a saved schedule", async () => {
    store.set(judgingSchedules, []);
    await expect(run()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses anyone but an admin", async () => {
    adminRow = undefined;
    await expect(
      callerAs("a_hacker").judging.schedule.assignJudges({ hackathonId: HACK }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updates).toEqual([]);
  });

  it("refuses to write when the judges changed while it worked", async () => {
    // The first read of judges sees three; the read inside the transaction two.
    onRead = (table, count) =>
      table === judgingJudges && count > 1
        ? [judge(M1, "member", "Ada"), judge(GS, "guest", "Grace")]
        : undefined;
    await expect(run()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(updates.filter((u) => u.table === judgingAppointments)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("judging.schedule.setAssignedJudge", () => {
  const set = (appointmentId: string, judgeId: string | null) =>
    admin().judging.schedule.setAssignedJudge({
      hackathonId: HACK,
      appointmentId,
      judgeId,
    });

  it("sets the judge of an appointment that has not started, and audits it", async () => {
    const result = await set(P2, M1);

    expect(result).toEqual({
      appointmentId: P2,
      fromJudgeId: null,
      toJudgeId: M1,
    });
    expect(judgeAfter().get(P2)).toBe(M1);
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "judging.schedule.setJudge",
        resourceId: P2,
        metadata: expect.objectContaining({ toJudgeId: M1 }),
      }),
    ]);
  });

  it("clears a judge with null", async () => {
    give(P2, M1);
    await set(P2, null);
    expect(judgeAfter().get(P2)).toBeNull();
  });

  it("refuses a judge who may not grade it: a guest outside their room", async () => {
    await expect(set(P2, GS)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Grace cannot grade General at Table G1.",
    });
    // Their own room is fine.
    await expect(set(P4, GS)).resolves.toMatchObject({ toJudgeId: GS });
  });

  it("refuses a judge who is already grading something else then", async () => {
    give(P3, M1);
    await expect(set(P2, M1)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Ada is already grading Project 3 at that time.",
    });
    await expect(set(P2, M2)).resolves.toMatchObject({ toJudgeId: M2 });
  });

  it("refuses a judge who is not one of the edition's, or a guest with no room", async () => {
    await expect(set(P2, id(99))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(set(P2, NOROOM)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses once the presentation has started or a judge has begun on it", async () => {
    await expect(set(P1, M1)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    store.set(judgingEvaluationDrafts, [
      { entryId: E2, challengeId: GENERAL, appointmentId: P2 },
    ]);
    await expect(set(P2, M1)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(judgeAfter().size).toBe(0);
  });

  it("refuses an appointment that does not exist", async () => {
    await expect(set(id(98), M1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses anyone but an admin", async () => {
    adminRow = undefined;
    await expect(
      callerAs("a_hacker").judging.schedule.setAssignedJudge({
        hackathonId: HACK,
        appointmentId: P2,
        judgeId: M1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(updates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("judging.schedule.judgeChoices", () => {
  it("lists the judges who may grade it, free ones first, with those booked marked", async () => {
    give(P3, M1);
    give(P4, M2);

    const result = await admin().judging.schedule.judgeChoices({
      hackathonId: HACK,
      appointmentId: P2,
    });

    expect(result.appointment).toMatchObject({
      id: P2,
      challengeLabel: "General",
      roomName: "Table G1",
      canAssignJudge: true,
    });
    expect(result.choices).toEqual([
      expect.objectContaining({
        judgeId: M2,
        name: "Bea",
        load: 1,
        booked: false,
      }),
      expect.objectContaining({
        judgeId: M1,
        name: "Ada",
        load: 1,
        booked: true,
        bookedWith: "Project 3",
      }),
    ]);
  });

  it("offers a sponsor presentation to the sponsor's judge and the members", async () => {
    const result = await admin().judging.schedule.judgeChoices({
      hackathonId: HACK,
      appointmentId: P4,
    });
    expect(result.choices.map((c) => c.judgeId).sort()).toEqual(
      [GS, M1, M2].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
describe("judging.schedule.move", () => {
  const staffed = () =>
    store.set(
      judgingPresence,
      [G1, G2, A1, A2].map((roomId) => ({
        judgeId: M1,
        roomId,
        joinedAt: at("14:00"),
        lastSeenAt: NOW,
        leftAt: null,
      })),
    );
  const move = (appointmentId: string, roomId: string, startsAt: Date) =>
    admin().judging.schedule.move({
      hackathonId: HACK,
      appointmentId,
      revision: 0,
      roomId,
      startsAt,
    });
  const written = () => updates.filter((u) => u.table === judgingAppointments);

  it("clears a guest's assignment when the presentation moves to another room", async () => {
    staffed();
    give(P4, GS);

    const moved = await move(P4, A2, at("16:00"));

    expect(moved.clearedJudgeId).toBe(GS);
    expect(written()[0]!.values).toMatchObject({
      roomId: A2,
      assignedJudgeId: null,
    });
  });

  it("clears a member's assignment when they would be in two places at the new time", async () => {
    staffed();
    give(P2, M1);
    give(P4, M1);

    // P4 is at 16:00; moving P2 there puts Ada in two rooms at once.
    const moved = await move(P2, G2, at("16:00"));

    expect(moved.clearedJudgeId).toBe(M1);
    expect(written()[0]!.values).toMatchObject({ assignedJudgeId: null });
  });

  it("keeps the judge when they can still grade it at the new time", async () => {
    staffed();
    give(P2, M1);

    const moved = await move(P2, G2, at("15:40"));

    expect(moved.clearedJudgeId).toBeNull();
    expect("assignedJudgeId" in (written()[0]!.values as Row)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("saving a schedule", () => {
  const timing = {
    windowStart: at("16:00"),
    windowEnd: at("19:00"),
    setupMinutes: 2,
    judgingMinutes: 6,
    teardownMinutes: 2,
    sameBuildingBreakMinutes: 10,
    crossBuildingBreakMinutes: 20,
  };
  const rowsWritten = () =>
    inserts
      .filter((write) => write.table === judgingAppointments)
      .flatMap((write) => write.values as Row[]);

  beforeEach(() => {
    // Nothing saved yet.
    store.set(judgingSchedules, []);
    store.set(judgingAppointments, []);
  });

  it("gives every presentation a judge as far as there are judges", async () => {
    const preview = await admin().judging.schedule.preview({
      hackathonId: HACK,
      timing,
    });
    if (!preview.ok) throw new Error("the inventory fits the window");

    const saved = await admin().judging.schedule.save({
      hackathonId: HACK,
      timing,
      candidateKey: preview.candidateKey,
    });

    expect(saved).toMatchObject({ appointments: 4, judged: 4 });
    const rows = rowsWritten();
    expect(rows).toHaveLength(4);
    // Grace judges Acme's presentation; the three general ones are Ada's and Bea's.
    const judgeOf = (challengeId: string) =>
      rows
        .filter((r) => r.challengeId === challengeId)
        .map((r) => r.assignedJudgeId);
    expect(judgeOf(ACME)).toEqual([GS]);
    expect(judgeOf(GENERAL).every((j) => j === M1 || j === M2)).toBe(true);
    expect(audits()[0]).toMatchObject({
      action: "judging.schedule.save",
      metadata: expect.objectContaining({ judged: 4 }),
    });
  });

  it("still saves when no judge has joined: the presentations have none yet", async () => {
    store.set(judgingJudges, []);
    const preview = await admin().judging.schedule.preview({
      hackathonId: HACK,
      timing,
    });
    if (!preview.ok) throw new Error("the inventory fits the window");

    const saved = await admin().judging.schedule.save({
      hackathonId: HACK,
      timing,
      candidateKey: preview.candidateKey,
    });

    expect(saved).toMatchObject({ appointments: 4, judged: 0 });
    expect(rowsWritten().every((r) => r.assignedJudgeId === null)).toBe(true);
  });

  it("puts the judges in the CP-SAT problem, and saves the assignments CP-SAT chose", async () => {
    const problem = await admin().judging.schedule.cpsatProblem({
      hackathonId: HACK,
      timing,
    });
    const file = JSON.parse(problem.contents);
    expect(problem.judges).toBe(3);
    expect(file.judges.map((j: Row) => j.id)).toEqual([M1, M2, GS]);
    expect(file.judges.find((j: Row) => j.id === GS)).toMatchObject({
      kind: "guest",
      roomId: A1,
      challengeIds: [ACME],
    });

    // The in-app schedule with its judges, the two general judges swapped.
    const preview = await admin().judging.schedule.preview({
      hackathonId: HACK,
      timing,
    });
    if (!preview.ok) throw new Error("the inventory fits the window");
    const placements = preview.appointments.map((a) => ({
      entryId: a.entryId,
      challengeId: a.challengeId,
      roomId: a.roomId,
      slot: (a.startsAt.getTime() - timing.windowStart.getTime()) / 600_000,
    }));
    const inputs = {
      rooms: file.rooms,
      tasks: file.tasks,
      slots: file.slotCount,
      sameGap: file.sameGap,
      crossGap: file.crossGap,
    };
    const inApp = assignJudges(inputs, placements, file.judges).assignment;
    const swapped = inApp.map((a) => ({
      ...a,
      judgeId: a.judgeId === M1 ? M2 : a.judgeId === M2 ? M1 : a.judgeId,
    }));
    const solution = JSON.stringify({
      format: "query-judging-schedule-solution",
      version: 1,
      fingerprint: file.fingerprint,
      status: "feasible",
      relaxed: false,
      placements,
      assignments: swapped,
    });

    const checked = await admin().judging.schedule.previewCpsat({
      hackathonId: HACK,
      timing,
      solution,
    });
    expect(checked.judging).toEqual({
      judges: 3,
      presentations: 4,
      unassigned: 0,
      source: "cp-sat",
    });

    await admin().judging.schedule.saveCpsat({
      hackathonId: HACK,
      timing,
      solution,
      candidateKey: checked.candidateKey,
    });
    const chosen = new Map(
      swapped.map((a) => [`${a.entryId}:${a.challengeId}`, a.judgeId]),
    );
    for (const row of rowsWritten()) {
      expect(row.assignedJudgeId).toBe(
        chosen.get(`${row.entryId}:${row.challengeId}`),
      );
    }
    expect(audits()[0]).toMatchObject({
      metadata: expect.objectContaining({ solver: "cp-sat", judges: "cp-sat" }),
    });
  });
});

// Another organiser, so these calls draw on their own rate-limit tokens
// rather than what the tests above have used up.
const organiser = () => callerAs("organiser_user");

// ---------------------------------------------------------------------------
describe("judging.schedule.preview: advice", () => {
  const timing = {
    windowStart: at("16:00"),
    windowEnd: at("19:00"),
    setupMinutes: 2,
    judgingMinutes: 6,
    teardownMinutes: 2,
    sameBuildingBreakMinutes: 10,
    crossBuildingBreakMinutes: 20,
  };

  beforeEach(() => {
    store.set(judgingSchedules, []);
    store.set(judgingAppointments, []);
  });

  it("comes back with a plan that fits", async () => {
    const preview = await organiser().judging.schedule.preview({
      hackathonId: HACK,
      timing,
    });
    expect(preview.ok).toBe(true);
    expect(Array.isArray(preview.advice)).toBe(true);
  });

  it("says how long a window must be when the presentations do not fit", async () => {
    // One 10-minute slot: Project 1 presents twice and needs a break between.
    const preview = await organiser().judging.schedule.preview({
      hackathonId: HACK,
      timing: { ...timing, windowEnd: at("16:10") },
    });
    expect(preview.ok).toBe(false);
    expect(preview.advice[0]).toEqual({
      kind: "window",
      message:
        "The window holds 1 presentation slot per room, and this needs at least 3. Make the window at least 30 minutes long.",
    });
  });

  it("offers to archive tables the table judges cannot staff", async () => {
    // One table judge seats one of the two general tables at a time.
    store.set(judgingJudges, [judge(M1, "member", "Ada")]);
    store.set(
      judgingRooms,
      store.get(judgingRooms)!.concat([
        {
          id: id(54),
          name: "Table G3",
          kind: "table",
          challengeId: GENERAL,
          buildingId: "ENG",
          buildingName: "ENG",
          archivedAt: null,
        },
      ]),
    );
    const preview = await organiser().judging.schedule.preview({
      hackathonId: HACK,
      timing,
    });
    const unused = preview.advice.find((a) => a.kind === "unusedTables");
    expect(unused?.action).toEqual({
      type: "archiveTables",
      roomIds: expect.arrayContaining([id(54)]),
    });
    expect(unused?.message).toContain("won't be used with 1 table judge");
  });
});

// ---------------------------------------------------------------------------
describe("judging.schedule.suggestTiming", () => {
  beforeEach(() => {
    store.set(judgingSchedules, []);
    store.set(judgingAppointments, []);
  });

  it("starts at the next quarter hour at least 15 minutes away, with the usual minutes", async () => {
    // The clock moves on, so a user of its own: rate limits refill by it.
    vi.setSystemTime(new Date("2027-02-06T15:01:00Z"));
    const suggestion = await callerAs("late_user").judging.schedule.suggestTiming({
      hackathonId: HACK,
    });
    expect(suggestion!.timing).toMatchObject({
      windowStart: at("15:30"),
      setupMinutes: 2,
      judgingMinutes: 6,
      teardownMinutes: 2,
      sameBuildingBreakMinutes: 10,
      crossBuildingBreakMinutes: 20,
    });
  });

  it("sizes the window to a plan that fits, and counts what it was based on", async () => {
    const suggestion = await organiser().judging.schedule.suggestTiming({
      hackathonId: HACK,
    });
    const { timing, basis, spareMinutes } = suggestion!;
    expect(basis).toEqual({
      projects: 3,
      presentations: 4,
      // Two table judges seat one of the two general tables at a time.
      rooms: 3,
      memberJudges: 2,
    });
    expect(spareMinutes).toBeGreaterThanOrEqual(0);

    // The window it suggests previews as a schedule.
    const preview = await organiser().judging.schedule.preview({
      hackathonId: HACK,
      timing,
    });
    expect(preview.ok).toBe(true);
    // The longest a project's own presentations take is 3 slots; a fifth more.
    expect(
      (timing.windowEnd.getTime() - timing.windowStart.getTime()) / 60_000,
    ).toBeGreaterThanOrEqual(30);
  });

  it("is null once a schedule is saved", async () => {
    store.set(judgingSchedules, [
      { id: SCHEDULE, hackathonId: HACK, windowStart: at("16:00") },
    ]);
    expect(
      await organiser().judging.schedule.suggestTiming({ hackathonId: HACK }),
    ).toBeNull();
  });

  it("is null when no project is entered", async () => {
    store.set(judgingEntryChallenges, []);
    expect(
      await organiser().judging.schedule.suggestTiming({ hackathonId: HACK }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("re-balancing judges on their own", () => {
  const M3 = id(54);
  const minutes = (n: number) => new Date(Date.now() - n * 60_000);
  const here = (judgeId: string, lastSeenMinutesAgo = 0.5) => ({
    judgeId,
    roomId: G1,
    joinedAt: minutes(60),
    lastSeenAt: minutes(lastSeenMinutesAgo),
    leftAt: null,
  });
  const left = (judgeId: string) => ({
    ...here(judgeId, 7),
    leftAt: minutes(6),
  });
  // Its own caller, so the file's earlier requests do not trip the flood guard.
  const organiser = () => callerAs("rebalance_admin");
  const get = () => organiser().judging.schedule.get({ hackathonId: HACK });
  const gives = (p: string) => judgeAfter().get(p);

  beforeEach(() => {
    rebalanceThrottle.clear();
    store.set(judgingConfigs, [
      { hackathonId: HACK, state: "open", autoRebalance: true },
    ]);
    store.set(judgingJudges, [
      judge(M1, "member", "Ada"),
      judge(M2, "member", "Bea"),
      judge(M3, "member", "Cy"),
      judge(GS, "guest", "Grace"),
    ]);
    // Ada, who left, holds P2; Bea is on P3 and Grace on P4; Cy is free.
    give(P2, M1);
    give(P3, M2);
    give(P4, GS);
    store.set(judgingPresence, [left(M1), here(M2), here(M3)]);
  });

  it("moves a judge's upcoming presentations to one who is here, and nobody else's", async () => {
    const board = await get();

    expect(gives(P2)).toBe(M3);
    expect(gives(P3)).toBeUndefined();
    expect(gives(P4)).toBeUndefined();
    expect(gives(P1)).toBeUndefined();
    expect(board.judging).toMatchObject({
      autoRebalance: true,
      lastRebalancedAt: NOW,
      lastRebalanceChanged: 1,
    });
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "judging.schedule.rebalance",
        userId: null,
        resourceId: HACK,
        metadata: expect.objectContaining({ changed: 1 }),
      }),
    ]);
  });

  it("gives a presentation with no judge to one who is here", async () => {
    give(P3, null as never);
    store.set(judgingPresence, [here(M1), here(M2), here(M3)]);

    await get();

    expect(gives(P3)).toBeDefined();
    expect(gives(P2)).toBeUndefined();
  });

  it("leaves alone a presentation that has started or has a draft", async () => {
    // Ada's P2 has a draft; her P1 started at 14:00 and is over.
    give(P1, M1);
    store.set(judgingEvaluationDrafts, [
      { entryId: E2, challengeId: GENERAL, appointmentId: null },
    ]);

    await get();

    expect(gives(P2)).toBeUndefined();
    expect(gives(P1)).toBeUndefined();
    expect(updates.filter((u) => u.table === judgingAppointments)).toEqual([]);
    expect(audits()).toEqual([]);
  });

  it("treats a judge quiet for 11 minutes as gone, one who just walked off as here, and one not yet due as here", async () => {
    store.set(judgingPresence, [here(M1, 9), here(M2), here(M3)]);
    await get();
    expect(updates.filter((u) => u.table === judgingAppointments)).toEqual([]);

    updates.length = 0;
    rebalanceThrottle.clear();
    store.set(judgingPresence, [here(M1, 11), here(M2), here(M3)]);
    await get();
    expect(gives(P2)).toBe(M3);

    // Never seen, but P2 is half an hour away: Ada keeps it.
    updates.length = 0;
    rebalanceThrottle.clear();
    give(P2, M1);
    store.set(judgingPresence, [here(M2), here(M3)]);
    await get();
    expect(updates.filter((u) => u.table === judgingAppointments)).toEqual([]);
  });

  it("gives freed work only to members who are here, not one who never arrived", async () => {
    // Cy never checked in and holds nothing near; Bea is here and now free.
    give(P3, null as never);
    store.set(judgingPresence, [left(M1), here(M2)]);

    await get();

    expect([gives(P2), gives(P3)]).toContain(M2);
    expect([gives(P2), gives(P3)]).not.toContain(M3);
  });

  it("leaves what a member who never arrived holds, and gives them nothing more", async () => {
    // Cy never checked in but holds P3, which is not due for half an hour.
    give(P3, M3);
    store.set(judgingPresence, [left(M1), here(M2)]);

    await get();

    expect(gives(P3)).toBeUndefined();
    expect(gives(P2)).toBe(M2);
  });

  it("frees what a guest holds once their session has lapsed, and gives them nothing", async () => {
    // Grace's 8 hours ran out a minute ago; a member takes the sponsor's presentation.
    store.set(judgingGuestSessions, [
      {
        judgeId: GS,
        roomId: A1,
        createdAt: new Date(NOW.getTime() - 8 * 3600_000 - 60_000),
        expiresAt: new Date(NOW.getTime() - 60_000),
      },
    ]);

    await get();

    expect(gives(P4)).toBeTruthy();
    expect(gives(P4)).not.toBe(GS);
    expect(gives(P2)).toBe(M3);
  });

  it("gives up quietly when presence changed under the lock", async () => {
    // Ada was gone on the first read and has heartbeated by the second.
    onRead = (table, count) =>
      table === judgingPresence && count > 1
        ? [here(M1), here(M2), here(M3)]
        : undefined;

    await get();

    expect(updates.filter((u) => u.table === judgingAppointments)).toEqual([]);
    expect(audits()).toEqual([]);
  });

  it("does nothing when the organiser turned it off, and says so", async () => {
    await organiser().judging.schedule.setAutoRebalance({
      hackathonId: HACK,
      enabled: false,
    });
    expect(audits()).toEqual([
      expect.objectContaining({
        action: "judging.schedule.setAutoRebalance",
        metadata: { enabled: false },
      }),
    ]);

    const board = await get();

    expect(updates.filter((u) => u.table === judgingAppointments)).toEqual([]);
    expect(board.judging).toMatchObject({ autoRebalance: false });
  });

  it("refuses anyone but an admin to switch it", async () => {
    adminRow = undefined;
    await expect(
      callerAs("someone").judging.schedule.setAutoRebalance({
        hackathonId: HACK,
        enabled: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("never fails the read it rides on", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onRead = (table) => {
      if (table === judgingPresence) throw new Error("db down");
      return undefined;
    };
    await expect(rebalanceIfDue(fakeDb, HACK, new Date())).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  // Last: it moves the clock on, and the rate limiter reads the clock.
  it("runs at most once every 30 seconds", async () => {
    await get();
    expect(gives(P2)).toBe(M3);

    // Cy leaves too and P2 is Cy's now.
    give(P2, M3);
    store.set(judgingPresence, [left(M1), here(M2), left(M3)]);
    updates.length = 0;
    vi.setSystemTime(new Date(NOW.getTime() + 10_000));
    await get();
    expect(updates).toEqual([]);

    updates.length = 0;
    vi.setSystemTime(new Date(NOW.getTime() + 31_000));
    await get();
    expect(updates.some((u) => u.table === judgingAppointments)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("a full event: 63 tables, 4 sponsors, 60 table judges", () => {
  const SPONSORS = [id(1001), id(1002), id(1003), id(1004)];
  // 18 slots of 10 minutes.
  const timing = {
    windowStart: at("16:00"),
    windowEnd: at("19:00"),
    setupMinutes: 2,
    judgingMinutes: 6,
    teardownMinutes: 2,
    sameBuildingBreakMinutes: 10,
    crossBuildingBreakMinutes: 20,
  };

  beforeEach(() => {
    store.set(judgingSchedules, []);
    store.set(judgingAppointments, []);
    store.set(judgingChallenges, [
      {
        id: GENERAL,
        label: "General",
        parentId: null,
        mode: "scheduled",
        isGeneral: true,
        isGroup: false,
      },
      ...SPONSORS.map((sponsor, i) => ({
        id: sponsor,
        label: `Sponsor ${i + 1}`,
        parentId: null,
        mode: "scheduled",
        isGeneral: false,
        isGroup: false,
      })),
    ]);
    const table = (rid: string, name: string, challengeId: string) => ({
      id: rid,
      name,
      kind: "table",
      challengeId,
      buildingId: "ENG",
      buildingName: "ENG",
      archivedAt: null,
    });
    store.set(judgingRooms, [
      ...Array.from({ length: 63 }, (_, i) =>
        table(id(2000 + i), `Table ${i + 1}`, GENERAL),
      ),
      ...SPONSORS.flatMap((sponsor, i) => [
        table(id(3000 + i * 2), `Sponsor ${i + 1} A`, sponsor),
        table(id(3001 + i * 2), `Sponsor ${i + 1} B`, sponsor),
      ]),
    ]);
    // 300 projects; the first 120 also present for a sponsor: 420 in all.
    store.set(
      judgingEntryChallenges,
      Array.from({ length: 300 }, (_, e) => [
        { entryId: id(5000 + e), challengeId: GENERAL, title: `Project ${e}` },
        ...(e < 120
          ? [
              {
                entryId: id(5000 + e),
                challengeId: SPONSORS[e % 4]!,
                title: `Project ${e}`,
              },
            ]
          : []),
      ]).flat(),
    );
    store.set(
      judgingJudges,
      Array.from({ length: 60 }, (_, i) =>
        judge(id(6000 + i), "member", `Judge ${i}`),
      ),
    );
    store.set(judgingGuestSessions, []);
  });

  it("leaves out enough tables that every presentation has a judge, and saves the same schedule", async () => {
    const preview = await callerAs("full_event").judging.schedule.preview({
      hackathonId: HACK,
      timing,
    });
    if (!preview.ok) throw new Error("the event fits the window");
    expect(preview.advice.map((a) => a.kind)).not.toContain("judges");
    expect(preview.roomsLeftOut).toBeGreaterThan(0);

    const saved = await callerAs("full_event").judging.schedule.save({
      hackathonId: HACK,
      timing,
      candidateKey: preview.candidateKey,
    });
    expect(saved).toMatchObject({ appointments: 420, judged: 420 });
  }, 120_000);
});
