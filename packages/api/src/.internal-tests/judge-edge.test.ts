/**
 * Judge-side edge cases: queue ownership, vote/queue consistency, the judging
 * window, reassignment on force-skip, bulk assignment coverage and admin
 * cleanup paths.
 *
 * Tests marked `it.skip` are written against the behaviour the product SHOULD
 * have. Each one currently fails against the shipped handler; the comment
 * above it names the file and lines responsible. They are deliberately left in
 * place — unskipping one is the acceptance criterion for its fix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db } from "@query/db";

// Fully mock the DB at the file level, mirroring hackathon-flow.test.ts.
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();

vi.mock("@query/db", () => {
  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: (...args: any[]) => mockFindMany(name, ...args),
  });

  // A lazily-resolved builder chain. Every builder method records itself and
  // returns the same object; awaiting it calls mockSelect exactly once, so a
  // test can drive successive aggregate queries with mockReturnValueOnce.
  const selectChain = () => {
    const trace: [string, any[]][] = [];
    const chain: any = {
      then: (onOk: any, onErr: any) =>
        Promise.resolve(mockSelect(trace)).then(onOk, onErr),
    };
    for (const m of [
      "from",
      "where",
      "innerJoin",
      "leftJoin",
      "groupBy",
      "orderBy",
      "limit",
      "offset",
      "for",
    ]) {
      chain[m] = (...a: any[]) => {
        trace.push([m, a]);
        return chain;
      };
    }
    return chain;
  };

  return {
    db: {
      transaction: vi.fn().mockImplementation((callback) => callback(db)),
      query: {
        admins: table("admins"),
        users: table("users"),
        userProfiles: table("userProfiles"),
        hackathons: table("hackathons"),
        hackathonParticipants: table("hackathonParticipants"),
        hackathonTeams: table("hackathonTeams"),
        hackathonProjects: table("hackathonProjects"),
        hackathonEvents: table("hackathonEvents"),
        hackathonEventAttendees: table("hackathonEventAttendees"),
        members: table("members"),
        events: table("events"),
        eventCheckIns: table("eventCheckIns"),
        judges: table("judges"),
        judgeAssignments: table("judgeAssignments"),
        judgingProjects: table("judgingProjects"),
        judgeVotes: table("judgeVotes"),
        judgeQueue: table("judgeQueue"),
        hackathonResults: table("hackathonResults"),
        stripePayments: table("stripePayments"),
        userAccountLinks: table("userAccountLinks"),
        auditLogs: table("auditLogs"),
      },
      insert: (...insertArgs: any[]) => ({
        values: (...valArgs: any[]) => {
          const val = mockInsert("insert", insertArgs, valArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
            onConflictDoUpdate: vi.fn().mockImplementation(() => ({
              returning: vi.fn().mockResolvedValue(val),
            })),
          });
        },
      }),
      update: (...updateArgs: any[]) => ({
        set: (...setArgs: any[]) => ({
          where: (...wArgs: any[]) => {
            const val = mockUpdate("update", updateArgs, setArgs, wArgs);
            return Object.assign(Promise.resolve(val), {
              returning: vi.fn().mockResolvedValue(val),
            });
          },
        }),
      }),
      delete: (...deleteArgs: any[]) => ({
        where: (...wArgs: any[]) => {
          const val = mockDelete("delete", deleteArgs, wArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
          });
        },
      }),
      select: (..._args: any[]) => selectChain(),
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", email: "email" },
    userProfiles: { userId: "user_id" },
    hackathons: {
      id: "id",
      name: "name",
      status: "status",
      isPublic: "is_public",
      startDate: "start_date",
      endDate: "end_date",
      judgingActive: "judging_active",
      tracks: "tracks",
      currentParticipants: "current_participants",
      maxParticipants: "max_participants",
    },
    hackathonParticipants: {
      id: "id",
      hackathonId: "hackathon_id",
      userId: "user_id",
      registrationStatus: "registration_status",
    },
    hackathonTeams: { id: "id", hackathonId: "hackathon_id", name: "name" },
    hackathonProjects: {
      id: "id",
      hackathonId: "hackathon_id",
      status: "status",
      submittedAt: "submitted_at",
    },
    hackathonEvents: { id: "id", hackathonId: "hackathon_id", name: "name" },
    hackathonEventAttendees: {
      eventId: "event_id",
      participantId: "participant_id",
    },
    members: { id: "id", userId: "user_id", hackathonId: "hackathon_id" },
    membershipHistory: { id: "id", memberId: "member_id" },
    events: {
      id: "id",
      title: "title",
      qrCode: "qr_code",
      checkInEnabled: "check_in_enabled",
      eventDate: "event_date",
      currentCheckIns: "current_check_ins",
    },
    eventCheckIns: { id: "id", eventId: "event_id", userId: "user_id" },
    judges: {
      id: "id",
      userId: "user_id",
      hackathonId: "hackathon_id",
      isActive: "is_active",
      name: "name",
    },
    judgeAssignments: {
      id: "id",
      judgeId: "judge_id",
      hackathonId: "hackathon_id",
      track: "track",
      status: "status",
    },
    judgingProjects: {
      id: "id",
      hackathonId: "hackathon_id",
      sourceProjectId: "source_project_id",
      tableNumber: "table_number",
      tracks: "tracks",
      challenges: "challenges",
      isCreateX: "is_create_x",
    },
    judgeVotes: {
      id: "id",
      judgeId: "judge_id",
      projectId: "project_id",
      score: "score",
      durationSeconds: "duration_seconds",
    },
    hackathonResults: {
      id: "id",
      hackathonId: "hackathon_id",
      projectId: "project_id",
      track: "track",
      placement: "placement",
      publishedAt: "published_at",
    },
    judgeQueue: {
      id: "id",
      judgeId: "judge_id",
      hackathonId: "hackathon_id",
      projectId: "project_id",
      order: "order",
      isCompleted: "is_completed",
      completedAt: "completed_at",
      startedAt: "started_at",
    },
    stripePayments: {
      id: "id",
      customerEmail: "customer_email",
      stripePaymentIntentId: "stripe_payment_intent_id",
    },
    userAccountLinks: { userId: "user_id", stripePaymentId: "stripe_payment_id" },
    auditLogs: { id: "id", severity: "severity", userId: "user_id" },
  };
});

const HACK_A = "11111111-1111-4111-8111-111111111111";
const HACK_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";
const QUEUE_A = "55555555-5555-4555-8555-555555555555";
const JUDGE_ID = "66666666-6666-4666-8666-666666666666";
const OTHER_JUDGE_ID = "77777777-7777-4777-8777-777777777777";

const JUDGE_ROW = {
  id: JUDGE_ID,
  userId: "judge_user",
  hackathonId: HACK_A,
  isActive: true,
  name: "Grace Hopper",
};
const ADMIN_ROW = { userId: "admin_user", isActive: true, role: "admin" };

/** Returns successive elements of `items`, then undefined forever. */
const seq = (items: unknown[]) => {
  let i = 0;
  return () => items[i++];
};

const scores = {
  scoreCreativity: 5,
  scoreImpact: 5,
  scoreScope: 5,
  scoreClarity: 5,
  scoreSoundness: 5,
};

describe("Judge edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
    mockFindFirst.mockImplementation(() => undefined);
    mockFindMany.mockImplementation(() => []);
    // Tests drive successive aggregate reads with mockReturnValueOnce, and
    // clearAllMocks does not drain that queue — a test that queues more values
    // than its handler consumes would otherwise hand its leftovers to whichever
    // test runs next, making results depend on file order.
    mockSelect.mockReset();
    mockSelect.mockReturnValue([{ count: 0 }]);
    mockInsert.mockReturnValue([{ id: "inserted" }]);
    mockUpdate.mockReturnValue([{ id: "updated" }]);
    mockDelete.mockReturnValue([{ id: "deleted" }]);
  });

  const ctxFor = (userId?: string) =>
    ({
      db,
      session: userId ? { user: { id: userId } } : null,
      userId: userId || undefined,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    }) as any;

  const judgeCaller = () => appRouter.createCaller(ctxFor("judge_user"));
  const adminCaller = () => appRouter.createCaller(ctxFor("admin_user"));

  /**
   * Wires mockFindFirst for the judge portal. `queue` is consumed in call
   * order: `isJudge` burns the first judgeQueue lookup whenever the input
   * carries only a queueId (procedures.ts resolves hackathonId that way).
   */
  const wireJudge = (opts: {
    queue?: unknown[];
    project?: Record<string, unknown>;
    hackathon?: Record<string, unknown>;
    myAssignment?: Record<string, unknown>;
    judge?: Record<string, unknown> | undefined;
  }) => {
    const nextQueue = seq(opts.queue ?? []);
    mockFindFirst.mockImplementation((table: string) => {
      if (table === "judges")
        return "judge" in opts ? opts.judge : JUDGE_ROW;
      if (table === "judgingProjects")
        return opts.project ?? { id: PROJECT_A, hackathonId: HACK_A };
      if (table === "hackathons") return opts.hackathon ?? { id: HACK_A };
      if (table === "judgeQueue") return nextQueue();
      if (table === "judgeAssignments") return opts.myAssignment;
      return undefined;
    });
  };

  /** Every judgeQueue row written by a mutation, flattened. */
  const insertedRows = () =>
    mockInsert.mock.calls.flatMap((c) => {
      const values = c[2]?.[0];
      return Array.isArray(values) ? values : values ? [values] : [];
    });

  // =====================================================================
  describe("1. A judge may only act on their own queue", () => {
    // BUG: portal.ts:405-419 loads the row with eq(judgeQueue.id, queueId)
    // only. Any active judge of the hackathon can complete another judge's
    // assignment. Left skipped: the product does not enforce ownership.
    it("refuses to force-skip a queue item that belongs to another judge", async () => {
      wireJudge({
        queue: [
          { id: QUEUE_A, hackathonId: HACK_A },
          {
            id: QUEUE_A,
            judgeId: OTHER_JUDGE_ID,
            hackathonId: HACK_A,
            projectId: PROJECT_A,
            isCompleted: false,
            project: { id: PROJECT_A, tracks: [] },
          },
        ],
      });

      await expect(
        judgeCaller().judge.forceSkipOvertime({ queueId: QUEUE_A }),
      ).rejects.toThrow(/not found|forbidden|access/i);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    // BUG: portal.ts:350-367 — same missing ownership predicate, and the
    // MAX(order) subquery is computed over the CALLER's rows, so the victim's
    // ordering is rewritten from a foreign sequence.
    it("refuses to skip a queue item that belongs to another judge", async () => {
      wireJudge({
        queue: [
          { id: QUEUE_A, hackathonId: HACK_A },
          {
            id: QUEUE_A,
            judgeId: OTHER_JUDGE_ID,
            hackathonId: HACK_A,
            order: 1,
            isCompleted: false,
          },
        ],
      });

      await expect(
        judgeCaller().judge.skipProject({ queueId: QUEUE_A }),
      ).rejects.toThrow(/not found|forbidden|access/i);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  describe("2. completeAndNext queue/vote consistency", () => {
    const vote = { queueId: QUEUE_A, projectId: PROJECT_A, ...scores };

    // BUG: portal.ts:267-305 writes the vote for input.projectId and completes
    // input.queueId with no cross-check, and isJudge resolves the hackathon
    // from projectId first, so a foreign-hackathon queueId still authorises.
    it("refuses to score one project while completing a queue slot for another", async () => {
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [
          {
            id: QUEUE_A,
            judgeId: JUDGE_ID,
            hackathonId: HACK_B,
            projectId: PROJECT_B,
          },
        ],
      });

      await expect(judgeCaller().judge.completeAndNext(vote)).rejects.toThrow(
        /bad request|mismatch|does not/i,
      );
      expect(mockInsert).not.toHaveBeenCalled();
    });

    // BUG: portal.ts:312-314 returns done for a stale queueId without ever
    // asking whether the judge has uncompleted rows left.
    it("does not declare judging finished when the queue row simply no longer exists", async () => {
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [
          undefined,
          // The slot this judge owns for the project being scored. The stale
          // queueId resolves to nothing, but they are still assigned it.
          { id: QUEUE_A },
          {
            id: "queue_b",
            hackathonId: HACK_A,
            project: { id: PROJECT_B, name: "Still Waiting" },
          },
        ],
      });

      const res = await judgeCaller().judge.completeAndNext(vote);
      expect(res.done).toBe(false);
    });

    it("returns the same next project when the same completion is submitted twice", async () => {
      const nextRow = {
        id: "queue_b",
        hackathonId: HACK_A,
        project: { id: PROJECT_B, name: "Next Project" },
      };

      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [
          { id: QUEUE_A, judgeId: JUDGE_ID, hackathonId: HACK_A, projectId: PROJECT_A },
          nextRow,
        ],
      });
      const first = await judgeCaller().judge.completeAndNext(vote);

      // Retry from a second tab: the row is already completed, so the next
      // uncompleted row is still the same one.
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [
          {
            id: QUEUE_A,
            judgeId: JUDGE_ID,
            hackathonId: HACK_A,
            projectId: PROJECT_A,
            isCompleted: true,
          },
          nextRow,
        ],
      });
      const second = await judgeCaller().judge.completeAndNext(vote);

      expect(first).toMatchObject({ done: false, nextQueueId: "queue_b" });
      expect(second).toMatchObject({ done: false, nextQueueId: "queue_b" });
    });
  });

  // =====================================================================
  describe("3. Judging window", () => {
    // BUG: neither submitVote (portal.ts:190) nor completeAndNext
    // (portal.ts:245) reads hackathons.judgingActive, so "close judging" is
    // advisory only and the upsert can still overwrite scores afterwards.
    it("rejects a vote once judging has been closed", async () => {
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        hackathon: { id: HACK_A, judgingActive: false },
      });

      await expect(
        judgeCaller().judge.submitVote({ projectId: PROJECT_A, ...scores }),
      ).rejects.toThrow(/clos/i);
    });

    // BUG: the handler never consults judgeQueue, so any judge can score any
    // project in the hackathon, including ones routed away from them.
    it("rejects a vote for a project that was never in the judge's queue", async () => {
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [undefined],
      });

      await expect(
        judgeCaller().judge.submitVote({ projectId: PROJECT_A, ...scores }),
      ).rejects.toThrow();
    });
  });

  // =====================================================================
  describe("4. skipProject response shape", () => {
    it("returns the next project with its name and table number", async () => {
      wireJudge({
        queue: [
          { id: QUEUE_A, hackathonId: HACK_A },
          { id: QUEUE_A, judgeId: JUDGE_ID, hackathonId: HACK_A, order: 1 },
          {
            id: "queue_b",
            hackathonId: HACK_A,
            project: { id: PROJECT_B, name: "Next Project", tableNumber: 12 },
          },
        ],
      });

      const res = await judgeCaller().judge.skipProject({ queueId: QUEUE_A });
      expect(res.skippedToEnd).toBe(false);
      expect(res.project).toMatchObject({ name: "Next Project", tableNumber: 12 });
    });

    // The caller renders a project card either way, so the last-project branch
    // has to hand back the joined project, not the judgeQueue row — returning
    // the queue row leaves the UI with an empty card on a judge's final table.
    it("still returns a named project when only the last project remains", async () => {
      wireJudge({
        queue: [
          { id: QUEUE_A, hackathonId: HACK_A },
          // project_id is NOT NULL and the handler loads this row with
          // `with: { project: true }`, so a slot always arrives carrying one.
          {
            id: QUEUE_A,
            judgeId: JUDGE_ID,
            hackathonId: HACK_A,
            order: 1,
            projectId: PROJECT_A,
            project: { id: PROJECT_A, name: "Last Project", tableNumber: 7 },
          },
          undefined,
        ],
      });

      const res = await judgeCaller().judge.skipProject({ queueId: QUEUE_A });
      expect(res.skippedToEnd).toBe(true);
      expect(res.project).toMatchObject({
        name: "Last Project",
        tableNumber: 7,
      });
    });
  });

  // =====================================================================
  describe("5. forceSkipOvertime reassignment", () => {
    /**
     * Candidate selection now runs two set-based queries rather than two per
     * candidate: who already holds this project, and each judge's uncompleted
     * count. The mocks mirror that shape — feeding the old per-candidate
     * counts here would make these tests pass without exercising the sort.
     */
    const wireForceSkip = (opts: {
      myAssignment?: Record<string, unknown>;
      others: Record<string, unknown>[];
      /** judgeIds already holding the skipped project */
      holders?: string[];
      /** judgeId -> uncompleted queue length */
      remaining?: Record<string, number>;
      /** the judge's own next uncompleted slot, if any */
      next?: Record<string, unknown>;
    }) => {
      const nextQueue = seq([
        { id: QUEUE_A, hackathonId: HACK_A }, // isJudge middleware lookup
        {
          id: QUEUE_A,
          judgeId: JUDGE_ID,
          hackathonId: HACK_A,
          projectId: PROJECT_A,
          project: { id: PROJECT_A, tracks: [] },
        },
        // the "what do I do next" lookup at the end
        opts.next,
      ]);
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "judges") return JUDGE_ROW;
        if (table === "hackathons") return { id: HACK_A };
        if (table === "judgeQueue") return nextQueue();
        if (table === "judgeAssignments")
          return "myAssignment" in opts
            ? opts.myAssignment
            : { judgeId: JUDGE_ID, hackathonId: HACK_A };
        return undefined;
      });
      mockFindMany.mockImplementation((table: string) =>
        table === "judgeAssignments" ? opts.others : [],
      );
      mockSelect.mockReturnValueOnce(
        (opts.holders ?? []).map((judgeId) => ({ judgeId })),
      );
      mockSelect.mockReturnValueOnce(
        Object.entries(opts.remaining ?? {}).map(([judgeId, remaining]) => ({
          judgeId,
          remaining,
        })),
      );
    };

    // BUG: portal.ts:428-486 draws candidates from every judgeAssignments row
    // with no isActive/status filter and sorts by fewest remaining, so a judge
    // who was never activated (empty queue) sorts first and is handed the
    // project it can never open.
    it("never hands the project to a judge who is not active", async () => {
      wireForceSkip({
        others: [
          {
            judgeId: "inactive_judge",
            track: null,
            status: "pending",
            judge: { id: "inactive_judge", isActive: false },
          },
          {
            judgeId: "active_judge",
            track: null,
            status: "approved",
            judge: { id: "active_judge", isActive: true },
          },
        ],
        remaining: { inactive_judge: 0, active_judge: 4 },
      });

      await judgeCaller().judge.forceSkipOvertime({ queueId: QUEUE_A });

      const reassigned = insertedRows().find((r: any) => r.projectId === PROJECT_A);
      expect(reassigned?.judgeId).toBe("active_judge");
    });

    // A judge already holding this project must not be handed it twice — they
    // would see the same table appear again later in their own queue.
    it("never hands the project to a judge who already has it", async () => {
      wireForceSkip({
        others: [
          {
            judgeId: "has_it",
            track: null,
            judge: { id: "has_it", isActive: true },
          },
          {
            judgeId: "free_judge",
            track: null,
            judge: { id: "free_judge", isActive: true },
          },
        ],
        holders: [JUDGE_ID, "has_it"],
        remaining: { has_it: 0, free_judge: 9 },
      });

      await judgeCaller().judge.forceSkipOvertime({ queueId: QUEUE_A });

      const reassigned = insertedRows().find(
        (r: any) => r.projectId === PROJECT_A,
      );
      expect(reassigned?.judgeId).toBe("free_judge");
    });

    // Between two eligible judges the lighter queue wins, so the reassigned
    // project is actually reached before judging closes.
    it("prefers the judge with the fewest projects left", async () => {
      wireForceSkip({
        others: [
          {
            judgeId: "busy",
            track: null,
            judge: { id: "busy", isActive: true },
          },
          {
            judgeId: "light",
            track: null,
            judge: { id: "light", isActive: true },
          },
        ],
        remaining: { busy: 11, light: 2 },
      });

      await judgeCaller().judge.forceSkipOvertime({ queueId: QUEUE_A });

      const reassigned = insertedRows().find(
        (r: any) => r.projectId === PROJECT_A,
      );
      expect(reassigned?.judgeId).toBe("light");
    });

    // BUG: portal.ts:422-424 loads myAssignment with no hackathonId filter and
    // then uses myAssignment.hackathonId (not queueItem.hackathonId) for the
    // reassignment row, orphaning it in the wrong hackathon.
    it("files the reassignment under the hackathon the skipped project belongs to", async () => {
      wireForceSkip({
        myAssignment: { judgeId: JUDGE_ID, hackathonId: HACK_B },
        others: [
          {
            judgeId: "active_judge",
            track: null,
            status: "approved",
            judge: { id: "active_judge", isActive: true },
          },
        ],
        remaining: { active_judge: 1 },
      });

      await judgeCaller().judge.forceSkipOvertime({ queueId: QUEUE_A });

      const reassigned = insertedRows().find((r: any) => r.projectId === PROJECT_A);
      expect(reassigned?.hackathonId).toBe(HACK_A);
    });

    // Both siblings (completeAndNext, skipProject) stamp startedAt on the slot
    // they hand over. Without it here the next table stays unclaimed and the
    // following judge to ask for work is sent to the table this judge just
    // walked up to.
    it("claims the table it hands the judge next", async () => {
      wireForceSkip({
        others: [],
        next: {
          id: "queue_next",
          judgeId: JUDGE_ID,
          hackathonId: HACK_A,
          projectId: "project_next",
          project: { id: "project_next", tracks: [] },
        },
      });

      const res = await judgeCaller().judge.forceSkipOvertime({
        queueId: QUEUE_A,
      });

      expect(res.queueId).toBe("queue_next");
      const claimed = mockUpdate.mock.calls.some(
        (call: any) =>
          call[2]?.[0]?.startedAt instanceof Date &&
          !("isCompleted" in (call[2]?.[0] ?? {})),
      );
      expect(claimed).toBe(true);
    });

    // BUG: with no judgeAssignments row the whole reassignment block is
    // skipped (portal.ts:426) yet the response still looks like a success, so
    // the project is dropped with nobody left to judge it.
    it("reports that nothing was reassigned when the judge has no assignment row", async () => {
      wireForceSkip({ myAssignment: undefined, others: [] });

      const res = await judgeCaller().judge.forceSkipOvertime({
        queueId: QUEUE_A,
      });
      expect(res).toHaveProperty("reassigned", false);
    });
  });

  // =====================================================================
  describe("6. Bulk assignment coverage", () => {
    const projectsFor = (track: string, count: number, from = 1) =>
      Array.from({ length: count }, (_, i) => ({
        id: `${track}_${i + from}`,
        hackathonId: HACK_A,
        tracks: [track],
        challenges: null,
        tableNumber: i + from,
        isCreateX: false,
      }));

    const wireAssign = (opts: {
      hackathonTracks: string[] | null;
      assignments: Record<string, unknown>[];
      projects: Record<string, unknown>[];
    }) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "hackathons")
          return { id: HACK_A, name: "Hacklytics", tracks: opts.hackathonTracks };
        return undefined;
      });
      mockFindMany.mockImplementation((table: string) => {
        if (table === "judgeAssignments") return opts.assignments;
        if (table === "judgingProjects") return opts.projects;
        return [];
      });
    };

    const runAssign = () =>
      adminCaller().judge.assignJudgesToProjects({
        hackathonId: HACK_A,
        minProjects: 3,
        maxProjects: 5,
        shuffle: false,
        autoCalculate: false,
      });

    const trackedJudges = [
      { judgeId: "j_sports", track: "Sports", judge: { name: "Sports Judge" } },
      { judgeId: "j_finance", track: "Finance", judge: { name: "Finance Judge" } },
    ];

    it("caps each track judge at maxProjects when the hackathon tracks are configured", async () => {
      wireAssign({
        hackathonTracks: ["Sports", "Finance"],
        assignments: trackedJudges,
        projects: [...projectsFor("Sports", 8), ...projectsFor("Finance", 8, 9)],
      });

      const res = await runAssign();

      expect(res.success).toBe(true);
      for (const a of res.assignments) {
        expect(a.assignedCount).toBeLessThanOrEqual(5);
        expect(a.assignedCount).toBeGreaterThanOrEqual(3);
      }
      expect(res.coverage.max).toBe(1);
    });

    // BUG: admin.ts:497 builds MAIN_TRACKS from hackathon.tracks. When that
    // column is null every tracked judge is classified "special"
    // (helpers.ts:67) and bypasses minProjects/maxProjects entirely.
    it("still caps each judge at maxProjects when the hackathon has no tracks configured", async () => {
      wireAssign({
        hackathonTracks: null,
        assignments: trackedJudges,
        projects: [...projectsFor("Sports", 8), ...projectsFor("Finance", 8, 9)],
      });

      const res = await runAssign();

      for (const a of res.assignments) {
        expect(a.assignedCount).toBeLessThanOrEqual(5);
      }
    });

    // BUG: admin.ts:499-502 filters allAssignments by hackathonId only, so
    // pending applicants whose judges row is isActive:false get real queue
    // rows and inflate coverage.min even though isJudge will never let them in.
    it("gives no queue to an applicant who has not been approved", async () => {
      wireAssign({
        hackathonTracks: ["Sports"],
        assignments: [
          {
            judgeId: "j_approved",
            track: "Sports",
            status: "approved",
            judge: { name: "Approved", isActive: true },
          },
          {
            judgeId: "j_pending",
            track: "Sports",
            status: "pending",
            judge: { name: "Pending", isActive: false },
          },
        ],
        projects: projectsFor("Sports", 8),
      });

      const res = await runAssign();

      const pending = res.assignments.find((a) => a.judgeId === "j_pending");
      expect(pending?.assignedCount).toBe(0);
    });

    // BUG: admin.ts:509-514 rejects zero projects but not zero judges, so an
    // event with no judges reports success with coverage {min:0,max:0}.
    it("refuses to run an assignment when the hackathon has no judges", async () => {
      wireAssign({
        hackathonTracks: ["Sports"],
        assignments: [],
        projects: projectsFor("Sports", 8),
      });

      await expect(runAssign()).rejects.toThrow(/judge/i);
    });

    it("refuses an assignment run for a hackathon with no projects", async () => {
      wireAssign({
        hackathonTracks: ["Sports"],
        assignments: trackedJudges,
        projects: [],
      });

      await expect(runAssign()).rejects.toThrow(/No projects found/);
    });
  });

  // =====================================================================
  describe("7. initializeQueue track filtering", () => {
    const wireInit = (
      track: string,
      projects: Record<string, unknown>[],
      judgeHackathonId: string = HACK_A,
    ) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        // The judge's own edition. initializeQueue reads this to refuse
        // building a queue nobody could ever open.
        if (table === "judges") return { hackathonId: judgeHackathonId };
        if (table === "judgeAssignments")
          return { judgeId: JUDGE_ID, hackathonId: HACK_A, track };
        return undefined;
      });
      mockFindMany.mockImplementation((table: string) =>
        table === "judgingProjects" ? projects : [],
      );
    };

    const pool = [
      {
        id: PROJECT_A,
        tracks: ["Sports"],
        challenges: null,
        isCreateX: false,
        tableNumber: 1,
      },
      {
        id: PROJECT_B,
        tracks: null,
        challenges: null,
        isCreateX: true,
        tableNumber: 2,
      },
    ];

    it("queues only the projects carrying the judge's track", async () => {
      wireInit("Sports", pool);

      const res = await adminCaller().judge.initializeQueue({
        judgeId: JUDGE_ID,
        hackathonId: HACK_A,
        shuffle: false,
      });

      expect(res).toMatchObject({ success: true, projectCount: 1 });
      expect(insertedRows()[0]).toMatchObject({ projectId: PROJECT_A });
    });

    // BUG: admin.ts:433-440 omits the `track === 'createx' && p.isCreateX`
    // branch that assignToHackathon (admin.ts:152) and buildCoverageQueues
    // (helpers.ts:72) both apply, so re-initializing a createX judge silently
    // wipes their entire workload and still reports success.
    it("queues the createX pool for a judge assigned to the createX track", async () => {
      wireInit("createX", pool);

      const res = await adminCaller().judge.initializeQueue({
        judgeId: JUDGE_ID,
        hackathonId: HACK_A,
        shuffle: false,
      });

      expect(res.projectCount).toBe(1);
    });

    /**
     * A judges row belongs to one hackathon and isJudge authorizes against it,
     * so a queue built across editions can never be opened — the projects in
     * it are simply never scored, with nothing anywhere reporting a problem.
     * assignToHackathon already refuses this; this path did not.
     */
    it("refuses to build a queue for a judge from another hackathon", async () => {
      wireInit("Sports", pool, HACK_B);

      await expect(
        adminCaller().judge.initializeQueue({
          judgeId: JUDGE_ID,
          hackathonId: HACK_A,
          shuffle: false,
        }),
      ).rejects.toThrow(/different hackathon/i);

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  describe("8. Removing a judge", () => {
    // BUG: admin.ts:460-467 hard-deletes the judges row. judgeVotes.judgeId
    // cascades, so every score that judge already submitted disappears and the
    // normalization in getRankings shifts for every project.
    it("refuses to delete a judge who has already submitted votes", async () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "judges") return JUDGE_ROW;
        if (table === "judgeVotes") return { id: "vote_1", judgeId: JUDGE_ID };
        return undefined;
      });
      mockFindMany.mockImplementation((table: string) =>
        table === "judgeVotes" ? [{ id: "vote_1", judgeId: JUDGE_ID }] : [],
      );

      await expect(
        adminCaller().judge.remove({ judgeId: JUDGE_ID }),
      ).rejects.toThrow();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    // isJudge caches the judges row for 60s under
    // `judge:<userId>:<hackathonId>:role` (procedures.ts:97-110). Nothing in
    // admin.ts clears that key explicitly — the protection comes from
    // cacheInvalidationMiddleware (trpc.ts:181-198), which has no entry for
    // `judge.remove` and so falls back to evicting the whole `judge:*`
    // namespace. This test pins that fallback: without it, a revoked judge
    // would keep force-skip rights for a full minute on every warm instance.
    it("locks a removed judge out on their very next request", async () => {
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        // The judge legitimately holds this project, so the vote turns only on
        // whether they are still a judge.
        queue: [{ id: QUEUE_A, judgeId: JUDGE_ID, projectId: PROJECT_A }],
      });
      await judgeCaller().judge.submitVote({ projectId: PROJECT_A, ...scores });

      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      await adminCaller().judge.remove({ judgeId: JUDGE_ID });

      // The judges row is gone now.
      mockFindFirst.mockImplementation((table: string) =>
        table === "judgingProjects"
          ? { id: PROJECT_A, hackathonId: HACK_A }
          : undefined,
      );

      await expect(
        judgeCaller().judge.submitVote({ projectId: PROJECT_A, ...scores }),
      ).rejects.toThrow(/Judge access required/);
    });
  });

  // =====================================================================
  describe("9. Promoting submissions into judging", () => {
    const asAdmin = () =>
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );

    const submission = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      hackathonId: HACK_A,
      name: `Project ${id}`,
      description: "d",
      tracks: ["AI"],
      challenges: null,
      isCreateX: false,
      teamMembers: ["Ada", "Grace"],
      githubUrl: null,
      demoUrl: null,
      team: null,
      ...extra,
    });

    it("writes nothing when no project has been submitted", async () => {
      asAdmin();
      mockFindMany.mockReturnValue([]);

      const res = await adminCaller().judge.promoteSubmissions({
        hackathonId: HACK_A,
      });

      expect(res).toMatchObject({ created: 0, total: 0 });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    // The whole point of the source link: an organiser presses this again as
    // late submissions land, and must not get a second copy of every project
    // with a fresh table number.
    it("skips submissions that are already judgeable", async () => {
      asAdmin();
      mockFindMany.mockImplementation((table: string) => {
        if (table === "hackathonProjects")
          return [submission("s1"), submission("s2")];
        if (table === "judgingProjects")
          return [{ id: "jp1", sourceProjectId: "s1", tableNumber: 7 }];
        return [];
      });
      mockSelect.mockResolvedValue([{ count: 0 }]);

      const res = await adminCaller().judge.promoteSubmissions({
        hackathonId: HACK_A,
      });

      expect(res).toMatchObject({ created: 1, alreadyPresent: 1, total: 2 });

      const rows = mockInsert.mock.calls[0]?.[2]?.[0];
      expect(rows).toHaveLength(1);
      expect(rows[0].sourceProjectId).toBe("s2");
      // Numbering continues past the highest table already handed out.
      expect(rows[0].tableNumber).toBe(8);
    });

    // hackathon_project.teamMembers is text[]; judging_project.teamMembers is
    // a single text column. Assigning the array straight across puts
    // "[object Object]" on a judge's screen.
    it("flattens the team member array into the scalar column", async () => {
      asAdmin();
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonProjects" ? [submission("s1")] : [],
      );
      mockSelect.mockResolvedValue([{ count: 0 }]);

      await adminCaller().judge.promoteSubmissions({ hackathonId: HACK_A });

      const rows = mockInsert.mock.calls[0]?.[2]?.[0];
      expect(rows[0].teamMembers).toBe("Ada, Grace");
    });

    // Queues are built from a snapshot of the project list. A project promoted
    // afterwards is in nobody's queue and would never be judged, silently.
    it("warns when queues already exist and new projects were added", async () => {
      asAdmin();
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonProjects" ? [submission("s1")] : [],
      );
      mockSelect.mockResolvedValue([{ count: 12 }]);

      const res = await adminCaller().judge.promoteSubmissions({
        hackathonId: HACK_A,
      });

      expect(res.queuesNeedRebuild).toBe(true);
    });
  });

  // =====================================================================
  describe("10. Rankings", () => {
    const RANKING_PROJECTS = [
      {
        id: "p_real",
        name: "Real",
        hackathonId: HACK_A,
        tableNumber: 1,
        votes: [
          { judgeId: "j_a", score: 45, judge: { user: { name: "A" } } },
          { judgeId: "j_b", score: 47, judge: { user: { name: "B" } } },
        ],
      },
      {
        id: "p_weak",
        name: "Weak",
        hackathonId: HACK_A,
        tableNumber: 2,
        votes: [
          { judgeId: "j_a", score: 30, judge: { user: { name: "A" } } },
          { judgeId: "j_b", score: 28, judge: { user: { name: "B" } } },
        ],
      },
      {
        id: "p_hype",
        name: "Hype",
        hackathonId: HACK_A,
        tableNumber: 3,
        votes: [{ judgeId: "j_single", score: 50, judge: { user: { name: "S" } } }],
      },
    ];

    it("does not let a lone perfect score from a single-vote judge take first place", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      mockFindMany.mockImplementation((table: string) =>
        table === "judgingProjects" ? RANKING_PROJECTS : [],
      );

      const res = await adminCaller().judge.getRankings({ hackathonId: HACK_A });

      expect(res.rankings[0]?.project.id).toBe("p_real");
      const hype = res.rankings.find((r) => r.project.id === "p_hype");
      // zNormalize (helpers.ts:27) replaces a single-vote judge's score with
      // the global mean, so the 50 is erased entirely.
      expect(hype?.confidenceLevel).toBe("LOW");
      expect(hype?.normalizedAvg).toBe(res.globalAvg);
      expect(hype?.scoreShift).toBe(-10);
    });

    // rankings.ts:324 caches the leaderboard for 30s, which would be long
    // enough for two organizers to read two different top-3 orderings while
    // calling winners. The save is CACHE_INVALIDATION_MAP["judge.submitVote"]
    // (trpc.ts:158), which evicts `hackathon:*:rankings` after every vote.
    it("shows a vote submitted moments earlier on the next rankings read", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      mockFindMany.mockImplementation((table: string) =>
        table === "judgingProjects"
          ? [{ ...RANKING_PROJECTS[0], votes: [] }]
          : [],
      );
      const before = await adminCaller().judge.getRankings({ hackathonId: HACK_A });
      expect(before.rankings[0]?.voteCount).toBe(0);

      wireJudge({
        project: { id: "p_real", hackathonId: HACK_A },
        queue: [{ id: QUEUE_A, judgeId: JUDGE_ID, projectId: PROJECT_A }],
      });
      await judgeCaller().judge.submitVote({ projectId: PROJECT_A, ...scores });

      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      mockFindMany.mockImplementation((table: string) =>
        table === "judgingProjects" ? [RANKING_PROJECTS[0]] : [],
      );
      const after = await adminCaller().judge.getRankings({ hackathonId: HACK_A });

      expect(after.rankings[0]?.voteCount).toBe(2);
    });
  });

  // =====================================================================
  describe("11. Judge analytics", () => {
    // The judge an organizer needs mid-event is the one who has not started, so
    // the list is driven by the queues as well as the votes. Iterating votes
    // alone drops them entirely and they read as "not in this hackathon".
    it("lists a judge who has a queue but has not started voting", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      mockSelect
        .mockReturnValueOnce([
          {
            judgeId: "j_busy",
            projectId: PROJECT_A,
            score: 40,
            durationSeconds: 600,
            judgeName: "Busy",
            judgeUserId: "u_busy",
          },
        ])
        .mockReturnValueOnce([
          { judgeId: "j_busy", total: 5, completed: 1 },
          { judgeId: "j_idle", total: 6, completed: 0 },
        ]);

      const res = (await adminCaller().judge.getJudgeAnalytics({
        hackathonId: HACK_A,
      })) as { analytics: { judgeId: string; votesSubmitted: number }[] };

      const idle = res.analytics.find((a) => a.judgeId === "j_idle");
      expect(idle).toBeDefined();
      expect(idle?.votesSubmitted).toBe(0);
    });
  });

  // =====================================================================
  describe("12. getMyAssignments hackathon resolution", () => {
    // BUG: getMyAssignments takes no input, so isJudge falls back to the
    // newest hackathon by startDate (procedures.ts:82-88). A judge for an
    // older hackathon — or every current judge the moment a future draft row
    // is created — is locked out of the procedure that lists their hackathons.
    it("lets a judge list their assignments when a newer hackathon exists", async () => {
      // The user judges HACK_A. HACK_B is newer by startDate, so the middleware
      // resolves the context to HACK_B and finds no judges row there.
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "hackathons") return { id: HACK_B };
        if (table === "judges") return undefined;
        return undefined;
      });
      mockFindMany.mockImplementation((table: string) =>
        table === "judgeAssignments"
          ? [{ judgeId: JUDGE_ID, hackathonId: HACK_A }]
          : [],
      );

      await expect(judgeCaller().judge.getMyAssignments()).resolves.toBeDefined();
    });

    it("reports no judging context when the platform has no hackathons at all", async () => {
      mockFindFirst.mockImplementation(() => undefined);

      await expect(judgeCaller().judge.getMyAssignments()).rejects.toThrow(
        /No hackathon context found for judging/,
      );
    });
  });

  // =====================================================================
  describe("13. Two judges, one table", () => {
    const BUSY = {
      id: QUEUE_A,
      projectId: PROJECT_A,
      order: 1,
      project: { id: PROJECT_A, name: "Busy Table", tableNumber: 1 },
    };
    const FREE = {
      id: "queue_b",
      projectId: PROJECT_B,
      order: 2,
      project: { id: PROJECT_B, name: "Free Table", tableNumber: 2 },
    };

    /** First judgeQueue.findMany is this judge's queue, second is the claims. */
    const wireQueue = (queue: unknown[], claims: unknown[]) => {
      wireJudge({});
      let calls = 0;
      mockFindMany.mockImplementation((table: string) => {
        if (table !== "judgeQueue") return [];
        calls += 1;
        return calls === 1 ? queue : claims;
      });
    };

    it("routes around a table another judge is already standing at", async () => {
      wireQueue(
        [BUSY, FREE],
        [{ projectId: PROJECT_A, startedAt: new Date() }],
      );

      const res = await judgeCaller().judge.getNextTable({
        hackathonId: HACK_A,
      });

      // Sent to the free table, and nothing in the response hints that a table
      // was passed over — the judge has nothing to decide or dismiss.
      expect(res.project).toMatchObject({ tableNumber: 2 });
      expect(res.queueId).toBe("queue_b");
      expect(res.done).toBe(false);
      // The skipped table is still owed, so it stays in the count.
      expect(res.remaining).toBe(2);
    });

    it("hands over a table whose claim has gone stale", async () => {
      // Nothing comes back from the claim query once the window has passed,
      // so an abandoned table needs no admin to release it.
      wireQueue([BUSY, FREE], []);

      const res = await judgeCaller().judge.getNextTable({
        hackathonId: HACK_A,
      });

      expect(res.project).toMatchObject({ tableNumber: 1 });
      expect(res.queueId).toBe(QUEUE_A);
    });

    it("serves a claimed table rather than stranding a judge with nothing to do", async () => {
      const now = Date.now();
      wireQueue(
        [BUSY, FREE],
        [
          { projectId: PROJECT_A, startedAt: new Date(now - 9 * 60 * 1000) },
          { projectId: PROJECT_B, startedAt: new Date(now - 1 * 60 * 1000) },
        ],
      );

      const res = await judgeCaller().judge.getNextTable({
        hackathonId: HACK_A,
      });

      // Every table is busy, so the judge still gets one — the table claimed
      // longest ago, being the one most likely to be free by the time they
      // walk over.
      expect(res.done).toBe(false);
      expect(res.project).toMatchObject({ tableNumber: 1 });
    });

    it("claims the table it hands out, so the next judge routes around it", async () => {
      wireQueue([BUSY, FREE], []);

      await judgeCaller().judge.getNextTable({ hackathonId: HACK_A });

      const claimWrite = mockUpdate.mock.calls.find(
        (call) => call[2]?.[0]?.startedAt instanceof Date,
      );
      expect(claimWrite).toBeDefined();
    });
  });

  // =====================================================================
  describe("12. Freezing results", () => {
    const wireResults = (opts: {
      judgingActive?: boolean;
      published?: Record<string, unknown>;
    }) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "hackathons")
          return { id: HACK_A, judgingActive: opts.judgingActive ?? false };
        if (table === "hackathonResults") return opts.published;
        return undefined;
      });
      mockFindMany.mockReturnValue([]);
    };

    /**
     * The z-score normalisation runs over the whole vote set, so one late vote
     * shifts every project's score. A snapshot taken while judging is live is
     * already stale by the time anyone reads it.
     */
    it("refuses to freeze results while judging is still live", async () => {
      wireResults({ judgingActive: true });

      await expect(
        adminCaller().judge.computeResults({ hackathonId: HACK_A }),
      ).rejects.toThrow(/still live/i);

      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("computes once judging has closed", async () => {
      wireResults({ judgingActive: false });

      const res = await adminCaller().judge.computeResults({
        hackathonId: HACK_A,
      });

      // No projects wired, so nothing to place — but it got past the guard.
      expect(res).toMatchObject({ computed: 0 });
    });

    // Recomputing under a published ordering would change placings people
    // have already been told about, with no record that it happened.
    it("refuses to recompute over published results", async () => {
      wireResults({ judgingActive: false, published: { id: "r1" } });

      await expect(
        adminCaller().judge.computeResults({ hackathonId: HACK_A }),
      ).rejects.toThrow(/already published/i);
    });

    it("refuses to publish when nothing has been computed", async () => {
      wireResults({ judgingActive: false });
      mockUpdate.mockReturnValue([]);

      await expect(
        adminCaller().judge.publishResults({ hackathonId: HACK_A }),
      ).rejects.toThrow(/compute the results first/i);
    });
  });
});