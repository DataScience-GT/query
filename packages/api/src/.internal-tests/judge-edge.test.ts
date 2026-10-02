/**
 * Judge-side edge cases: queue ownership, vote/queue consistency, the judging
 * window and the scoring cutoff, and admin cleanup paths. Which table the
 * shared pool hands out is covered against real Postgres in
 * routers/judge/dispatch.db.test.ts, not here.
 *
 * Tests marked `it.skip` are written against the behaviour the product SHOULD
 * have. Each one currently fails against the shipped handler; the comment
 * above it names the file and lines responsible. They are deliberately left in
 * place — unskipping one is the acceptance criterion for its fix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db, judgeQueue, judgeVotes } from "@query/db";

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
      // The judging dispatch lock (pg_advisory_xact_lock).
      execute: vi.fn().mockResolvedValue({ rows: [] }),
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
    bootcampWorkshops: {
      id: "id",
      term: "term",
      week: "week",
      title: "title",
      materialsKey: "materials_key",
      materialsFileName: "materials_file_name",
      materialsSizeBytes: "materials_size_bytes",
      solutionKey: "solution_key",
      solutionFileName: "solution_file_name",
      solutionSizeBytes: "solution_size_bytes",
      recordingUrl: "recording_url",
      isPublished: "is_published",
      createdAt: "created_at",
      updatedAt: "updated_at",
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
      qrCode: "qr_code",
      withdrawnAt: "withdrawn_at",
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
      arrivedAt: "arrived_at",
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
// Super admin, because activating and deactivating a judge is restricted to
// that tier. It still passes isAdmin, so the rest of the suite is unaffected.
const ADMIN_ROW = { userId: "admin_user", isActive: true, role: "super_admin" };
const PLAIN_ADMIN_ROW = { userId: "admin_user", isActive: true, role: "admin" };

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
    /** The judge's existing vote on the project, if any. */
    vote?: Record<string, unknown>;
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
      if (table === "judgeVotes") return opts.vote;
      return undefined;
    });
  };

  /** Every row a mutation inserted into `table`, flattened. */
  const insertsInto = (table: unknown) =>
    mockInsert.mock.calls
      .filter((c) => c[1]?.[0] === table)
      .flatMap((c) => {
        const values = c[2]?.[0];
        return Array.isArray(values) ? values : values ? [values] : [];
      });

  /** A judgeable project as loadPool reads it. */
  const poolRow = (id: string, tableNumber: number) => ({
    id,
    tableNumber,
    tracks: null,
    challenges: null,
    isCreateX: false,
  });

  /**
   * Feeds the select reads dispatchNext makes, in its order: the assignments
   * and projects behind the pool, this judge's own visits, then (only when it
   * has to pick a new table) every vote and every open visit. Which table it
   * picks is covered against real Postgres in dispatch.db.test.ts; these only
   * need it to hand something back.
   */
  const wireDispatch = (opts: {
    pool: unknown[];
    mine?: unknown[];
    votes?: unknown[];
    open?: unknown[];
  }) => {
    mockSelect
      .mockReturnValueOnce([])
      .mockReturnValueOnce(opts.pool)
      .mockReturnValueOnce(opts.mine ?? [])
      .mockReturnValueOnce(opts.votes ?? [])
      .mockReturnValueOnce(opts.open ?? []);
  };

  /** Inside the scoring window: tapped in a minute ago. */
  const recent = () => new Date(Date.now() - 60_000);
  /** Past the 4:00 cutoff and its grace. */
  const lapsed = () => new Date(Date.now() - 5 * 60_000);

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

    // A stale queueId is tolerated (the judge may be retrying), and resolving
    // the judge's own slot instead must still lead on to the next table rather
    // than reporting judging finished.
    it("does not declare judging finished when the queue row simply no longer exists", async () => {
      wireJudge({
        project: { id: PROJECT_B, hackathonId: HACK_A, name: "Still Waiting" },
        queue: [
          undefined,
          // The slot this judge owns for the project being scored. The stale
          // queueId resolves to nothing, but they are still at this table.
          {
            id: QUEUE_A,
            judgeId: JUDGE_ID,
            hackathonId: HACK_A,
            projectId: PROJECT_A,
            isCompleted: false,
            startedAt: recent(),
            arrivedAt: recent(),
          },
        ],
      });
      wireDispatch({
        pool: [poolRow(PROJECT_A, 1), poolRow(PROJECT_B, 2)],
        mine: [
          {
            id: QUEUE_A,
            projectId: PROJECT_A,
            isCompleted: true,
            startedAt: recent(),
            arrivedAt: recent(),
            completedAt: new Date(),
          },
        ],
      });
      mockInsert.mockReturnValue([{ id: "queue_b" }]);

      const res = await judgeCaller().judge.completeAndNext(vote);

      expect(res).toMatchObject({ done: false, nextQueueId: "queue_b" });
      expect(insertsInto(judgeVotes)).toHaveLength(1);
    });

    it("returns the same next project when the same completion is submitted twice", async () => {
      const slot = {
        id: QUEUE_A,
        judgeId: JUDGE_ID,
        hackathonId: HACK_A,
        projectId: PROJECT_A,
        isCompleted: false,
        startedAt: recent(),
        arrivedAt: recent(),
      };
      const pool = [poolRow(PROJECT_A, 1), poolRow(PROJECT_B, 2)];

      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [slot],
      });
      wireDispatch({
        pool,
        mine: [{ ...slot, isCompleted: true, completedAt: new Date() }],
      });
      mockInsert.mockReturnValue([{ id: "queue_b" }]);
      const first = await judgeCaller().judge.completeAndNext(vote);
      mockInsert.mockClear();

      // Retry from a second tab: the slot is already completed and the vote is
      // on record, and the visit the first call opened is still live, so
      // dispatch hands that one back rather than opening another.
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [{ ...slot, isCompleted: true }],
        vote: { id: "vote_1" },
      });
      wireDispatch({
        pool,
        mine: [
          { ...slot, isCompleted: true, completedAt: new Date() },
          {
            id: "queue_b",
            projectId: PROJECT_B,
            isCompleted: false,
            startedAt: new Date(),
            arrivedAt: null,
            completedAt: null,
          },
        ],
      });
      const second = await judgeCaller().judge.completeAndNext(vote);

      expect(first).toMatchObject({ done: false, nextQueueId: "queue_b" });
      expect(second).toMatchObject({
        done: false,
        nextQueueId: "queue_b",
        timedOut: false,
      });
      // Nothing scored twice, no second visit opened.
      expect(mockInsert).not.toHaveBeenCalled();
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
    const ownSlot = {
      id: QUEUE_A,
      judgeId: JUDGE_ID,
      hackathonId: HACK_A,
      projectId: PROJECT_A,
      isCompleted: false,
      startedAt: recent(),
      arrivedAt: null,
    };

    it("returns the next project with its name and table number", async () => {
      wireJudge({
        project: { id: PROJECT_B, name: "Next Project", tableNumber: 12 },
        queue: [{ id: QUEUE_A, hackathonId: HACK_A }, ownSlot],
      });
      wireDispatch({
        pool: [poolRow(PROJECT_A, 1), poolRow(PROJECT_B, 12)],
        mine: [{ ...ownSlot, isCompleted: true, completedAt: new Date() }],
      });
      mockInsert.mockReturnValue([{ id: "queue_b" }]);

      const res = await judgeCaller().judge.skipProject({ queueId: QUEUE_A });

      expect(res).toMatchObject({ done: false, queueId: "queue_b" });
      expect(res.project).toMatchObject({ name: "Next Project", tableNumber: 12 });
    });

    // The pool never sends a judge back to a table they passed on, so skipping
    // the last one they can be sent to ends their judging rather than serving
    // the same table again.
    it("reports done when the skipped table was the last one left", async () => {
      wireJudge({
        queue: [{ id: QUEUE_A, hackathonId: HACK_A }, ownSlot],
      });
      wireDispatch({
        pool: [poolRow(PROJECT_A, 1)],
        mine: [{ ...ownSlot, isCompleted: true, completedAt: new Date() }],
      });

      const res = await judgeCaller().judge.skipProject({ queueId: QUEUE_A });

      expect(res).toMatchObject({ done: true, project: null, queueId: null });
      // The slot is closed without a vote.
      const closed = mockUpdate.mock.calls.some(
        (call) => call[1]?.[0] === judgeQueue && call[2]?.[0]?.isCompleted === true,
      );
      expect(closed).toBe(true);
      expect(insertsInto(judgeVotes)).toHaveLength(0);
    });
  });

  // =====================================================================
  describe("7b. Approving a judge writes no queue", () => {
    /**
     * Approval used to build the judge's queue, because nothing else would.
     * With the shared pool an active judge draws tables as they ask for them,
     * so approval writes no judge_queue rows at all and only reports how many
     * projects the judge can be sent to.
     */
    const wireApproval = (opts: {
      assignment?: Record<string, unknown> | undefined;
      projects?: Record<string, unknown>[];
    }) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "judgeAssignments")
          return "assignment" in opts
            ? opts.assignment
            : { id: "asn_1", judgeId: JUDGE_ID, hackathonId: HACK_A, track: null };
        return undefined;
      });
      mockUpdate.mockReturnValue([
        { userId: "judge_user", hackathonId: HACK_A },
      ]);
      // The judge-row lock, then the two reads behind loadPool: every
      // assignment in the hackathon, and its judgeable projects.
      mockSelect
        .mockReturnValueOnce([{ id: JUDGE_ID }])
        .mockReturnValueOnce([])
        .mockReturnValueOnce(opts.projects ?? []);
    };

    it("approves a judge without writing any judge_queue rows", async () => {
      wireApproval({
        projects: [poolRow(PROJECT_A, 1), poolRow(PROJECT_B, 2)],
      });

      const res = await adminCaller().judge.setActive({
        judgeId: JUDGE_ID,
        isActive: true,
      });

      expect(res).toMatchObject({ success: true, isActive: true });
      // The pool the judge will draw from, not a queue written for them.
      expect(res.queuedProjects).toBe(2);
      expect(insertsInto(judgeQueue)).toHaveLength(0);
      // Nor is any existing visit marked done or rewritten: a judge suspended
      // mid-event and reinstated keeps what they have scored.
      const touchedQueue = mockUpdate.mock.calls.some(
        (call) => call[1]?.[0] === judgeQueue,
      );
      expect(touchedQueue).toBe(false);
    });

    /**
     * Reported by review on #320. "Is the queue empty? then build it" is a read
     * followed by a write, and judge_queue has no unique on (judge, project) —
     * so two approvals arriving together both saw an empty queue and both
     * built one, giving the judge every project twice.
     */
    it("locks the judge row before deciding whether to build", async () => {
      wireApproval({ projects: [poolRow(PROJECT_A, 1)] });

      await adminCaller().judge.setActive({
        judgeId: JUDGE_ID,
        isActive: true,
      });

      // The lock is what serialises two concurrent approvals; without it the
      // second reads the queue the first has not committed yet.
      const lockedForUpdate = mockSelect.mock.calls.some((call) =>
        (call[0] as [string, unknown[]][]).some(([method]) => method === "for"),
      );
      expect(lockedForUpdate).toBe(true);
    });

    it("builds nothing for a judge with no assignment, and nothing on suspend", async () => {
      wireApproval({ assignment: undefined });

      const approved = await adminCaller().judge.setActive({
        judgeId: JUDGE_ID,
        isActive: true,
      });
      expect(approved.queuedProjects).toBeNull();

      const suspended = await adminCaller().judge.setActive({
        judgeId: JUDGE_ID,
        isActive: false,
      });
      expect(suspended.queuedProjects).toBeNull();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  describe("7d. Correcting a judge's track", () => {
    /**
     * Reported by review on #320.
     *
     * Writing the new track while leaving the old queue alone makes the
     * assignment and the queue disagree: the judge carries on scoring the pool
     * they were routed to before, and nothing on any screen says so. Refuse
     * first, name the cost, and only then offer the override — the same
     * pattern assignJudgesToProjects uses.
     */
    const wireTrackChange = (completedCount: number) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "judgeAssignments")
          return { id: "asn_1", judgeId: JUDGE_ID, hackathonId: HACK_A };
        if (table === "hackathons")
          return { tracks: ["Sports", "Health"], challenges: null };
        return undefined;
      });
      mockFindMany.mockImplementation(() => []);
      mockSelect.mockReturnValue([{ count: completedCount }]);
    };

    it("refuses a track change once the judge has scored", async () => {
      wireTrackChange(4);

      await expect(
        adminCaller().judge.updateAssignmentTrack({
          judgeId: JUDGE_ID,
          hackathonId: HACK_A,
          track: "Health",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      // Nothing may be written by a refused change — least of all the track,
      // which would leave the assignment and the queue disagreeing.
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("names what the change would cost", async () => {
      wireTrackChange(4);

      await expect(
        adminCaller().judge.updateAssignmentTrack({
          judgeId: JUDGE_ID,
          hackathonId: HACK_A,
          track: "Health",
        }),
      ).rejects.toThrow(/already scored 4 project/i);
    });

    // Completed slots survive the override: skipProject marks one done without
    // writing a vote, so they cannot be rebuilt from the votes table.
    it("keeps completed slots when forced", async () => {
      wireTrackChange(4);

      const res = await adminCaller().judge.updateAssignmentTrack({
        judgeId: JUDGE_ID,
        hackathonId: HACK_A,
        track: "Health",
        force: true,
      });

      expect(res).toMatchObject({ queueRebuilt: true, keptCompleted: 4 });
      // The delete that precedes a rebuild must be scoped to the unfinished
      // part of the queue.
      expect(mockDelete).toHaveBeenCalled();
    });

    it("changes the track freely when nothing has been scored", async () => {
      wireTrackChange(0);

      const res = await adminCaller().judge.updateAssignmentTrack({
        judgeId: JUDGE_ID,
        hackathonId: HACK_A,
        track: "Health",
      });

      expect(res).toMatchObject({ track: "Health", queueRebuilt: true });
    });
  });

  // =====================================================================
  describe("7c. A judge's track must exist on the edition", () => {
    /**
     * Free text went straight into the routing column. Any string not on the
     * edition classified the judge as sponsor/special, filtered their pool to
     * zero, and no screen could correct it.
     */
    const wireTrack = (hackathon: Record<string, unknown>) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "judges") return { hackathonId: HACK_A };
        if (table === "hackathons") return hackathon;
        if (table === "judgeAssignments") return undefined;
        return undefined;
      });
      mockFindMany.mockImplementation(() => []);
    };

    it("refuses a track the hackathon does not have", async () => {
      wireTrack({ tracks: ["Sports"], challenges: ["AWS"] });

      await expect(
        adminCaller().judge.assignToHackathon({
          judgeId: JUDGE_ID,
          hackathonId: HACK_A,
          track: "Web3",
        }),
      ).rejects.toThrow(/not a track or challenge/i);

      expect(mockInsert).not.toHaveBeenCalled();
    });

    // The routing comparison is exact, so a differently-cased match has to be
    // stored in the edition's own spelling or it matches nothing later.
    it("normalises the casing to the edition's own spelling", async () => {
      wireTrack({ tracks: ["Sports"], challenges: null });

      await adminCaller().judge.assignToHackathon({
        judgeId: JUDGE_ID,
        hackathonId: HACK_A,
        track: "sports",
      });

      const assignmentRow = mockInsert.mock.calls
        .map((c) => c[2]?.[0])
        .find((row) => row && !Array.isArray(row) && "judgeId" in row);
      expect(assignmentRow.track).toBe("Sports");
    });

    it("accepts a challenge label and createX", async () => {
      wireTrack({ tracks: ["Sports"], challenges: ["AWS"] });

      await expect(
        adminCaller().judge.assignToHackathon({
          judgeId: JUDGE_ID,
          hackathonId: HACK_A,
          track: "AWS",
        }),
      ).resolves.toBeDefined();

      await expect(
        adminCaller().judge.assignToHackathon({
          judgeId: JUDGE_ID,
          hackathonId: HACK_A,
          track: "createX",
        }),
      ).resolves.toBeDefined();
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

    /**
     * Approving a judge is part of running the event, so any admin may; it
     * was super-admin only while every admin saw the button. Deleting the
     * judge, votes and all, stays super-admin.
     */
    it("lets a plain admin approve a judge but not remove one", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? PLAIN_ADMIN_ROW : undefined,
      );

      const approval = await adminCaller()
        .judge.setActive({ judgeId: JUDGE_ID, isActive: true })
        .catch((error: unknown) => error);
      expect((approval as { code?: string })?.code).not.toBe("FORBIDDEN");

      await expect(
        adminCaller().judge.remove({ judgeId: JUDGE_ID }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
        queue: [
          {
            id: QUEUE_A,
            judgeId: JUDGE_ID,
            projectId: PROJECT_A,
            isCompleted: false,
            startedAt: recent(),
            arrivedAt: recent(),
          },
        ],
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

    /**
     * Judges draw tables from the shared pool, so a project promoted late is
     * judgeable the moment its row exists. Promotion has no queues to append
     * to and must not write any.
     */
    it("writes no judge_queue rows and reports only the promotion counts", async () => {
      asAdmin();
      mockFindMany.mockImplementation((table: string) =>
        table === "hackathonProjects" ? [submission("s1")] : [],
      );

      const res = await adminCaller().judge.promoteSubmissions({
        hackathonId: HACK_A,
      });

      expect(res).toEqual({ created: 1, alreadyPresent: 0, total: 1 });
      expect(insertsInto(judgeQueue)).toHaveLength(0);
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
        queue: [
          {
            id: QUEUE_A,
            judgeId: JUDGE_ID,
            projectId: PROJECT_A,
            isCompleted: false,
            startedAt: recent(),
            arrivedAt: recent(),
          },
        ],
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

    /**
     * The unique index is (hackathonId, projectId, track) and Postgres treats
     * NULLs as distinct — so a null track makes onConflictDoUpdate infer an
     * arbiter that can never match, and every recompute appends a second full
     * ordering instead of upserting. Nothing in the product deletes result
     * rows, so that is only fixable in psql.
     */
    it("writes a non-null track so the upsert arbiter can match", async () => {
      wireResults({ judgingActive: false });
      mockFindMany.mockImplementation((table: string) =>
        table === "judgingProjects"
          ? [
              {
                id: PROJECT_A,
                hackathonId: HACK_A,
                sourceProjectId: null,
                name: "P",
                tableNumber: 1,
                zone: null,
                category: null,
                teamMembers: null,
                tracks: null,
                challenges: null,
                isCreateX: false,
                // Needs a real vote: a project nobody scored is deliberately
                // left out of the snapshot rather than published at rank N.
                votes: [
                  {
                    judgeId: JUDGE_ID,
                    score: 42,
                    scoreCreativity: 8,
                    scoreImpact: 9,
                    scoreScope: 8,
                    scoreClarity: 9,
                    scoreSoundness: 8,
                    comment: null,
                    durationSeconds: 300,
                    judge: { user: { name: "Grace" } },
                  },
                ],
              },
            ]
          : [],
      );

      await adminCaller().judge.computeResults({ hackathonId: HACK_A });

      const rows = mockInsert.mock.calls.at(-1)?.[2]?.[0];
      expect(rows[0].track).toBe("overall");
      expect(rows[0].track).not.toBeNull();
    });

    // Unjudged projects are reported, not published: "47th place, zero votes"
    // is a worse thing to tell a team than nothing at all.
    it("leaves projects nobody scored out of the snapshot", async () => {
      wireResults({ judgingActive: false });
      mockFindMany.mockImplementation((table: string) =>
        table === "judgingProjects"
          ? [
              {
                id: PROJECT_A,
                hackathonId: HACK_A,
                sourceProjectId: null,
                name: "Unjudged",
                tableNumber: 1,
                zone: null,
                category: null,
                teamMembers: null,
                tracks: null,
                challenges: null,
                isCreateX: false,
                votes: [],
              },
            ]
          : [],
      );

      const res = await adminCaller().judge.computeResults({
        hackathonId: HACK_A,
      });

      expect(res).toMatchObject({ computed: 0, unjudged: 1 });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    // An upsert alone keeps the placing of a project withdrawn since the last
    // compute, and publishResults would announce it with the rest.
    it("clears the previous snapshot before writing the new one", async () => {
      wireResults({ judgingActive: false });

      await adminCaller().judge.computeResults({ hackathonId: HACK_A });

      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("refuses to publish when nothing has been computed", async () => {
      wireResults({ judgingActive: false });
      mockUpdate.mockReturnValue([]);

      await expect(
        adminCaller().judge.publishResults({ hackathonId: HACK_A }),
      ).rejects.toThrow(/compute the results first/i);
    });
  });

  // =====================================================================
  describe("13. Scan-to-start", () => {
    const QR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    const wireScan = (opts: {
      project?: Record<string, unknown>;
      slot?: Record<string, unknown>;
    }) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "judges") return JUDGE_ROW;
        if (table === "hackathons") return { id: HACK_A, judgingActive: true };
        if (table === "judgingProjects") return opts.project;
        if (table === "judgeQueue") return opts.slot;
        return undefined;
      });
    };

    const project = { id: PROJECT_A, tableNumber: 7, withdrawnAt: null };

    /**
     * Scanning is what starts the clock, so it has to prove the judge is at a
     * table that is actually theirs. Without this a judge could scan any card
     * in the room and score a project they were never routed to.
     */
    it("refuses a table that is not in this judge's queue", async () => {
      wireScan({ project, slot: undefined });

      await expect(
        judgeCaller().judge.startByQrCode({ qrCode: QR }),
      ).rejects.toThrow(/not the table you were sent to/i);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("refuses a withdrawn project", async () => {
      wireScan({
        project: { ...project, withdrawnAt: new Date() },
        slot: { id: QUEUE_A, judgeId: JUDGE_ID },
      });

      await expect(
        judgeCaller().judge.startByQrCode({ qrCode: QR }),
      ).rejects.toThrow(/does not match a project/i);
    });

    it("stamps arrival on first scan", async () => {
      wireScan({
        project,
        slot: { id: QUEUE_A, judgeId: JUDGE_ID, arrivedAt: null, startedAt: null },
      });

      const res = await judgeCaller().judge.startByQrCode({ qrCode: QR });

      expect(res).toMatchObject({ queueId: QUEUE_A, alreadyStarted: false });
      const write = mockUpdate.mock.calls.at(-1)?.[2]?.[0];
      expect(write.arrivedAt).toBeInstanceOf(Date);
    });

    // Re-scanning out of uncertainty must not restart the clock, which would
    // otherwise let a long visit be quietly reset to zero.
    it("does not restart the clock on a second scan", async () => {
      // Inside the window: past the cutoff a second scan is refused instead.
      const arrivedAt = recent();
      wireScan({
        project,
        slot: { id: QUEUE_A, judgeId: JUDGE_ID, arrivedAt, startedAt: arrivedAt },
      });

      const res = await judgeCaller().judge.startByQrCode({ qrCode: QR });

      expect(res.alreadyStarted).toBe(true);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  /**
   * The floor view. Every column it reads was already stored; nothing put it
   * in one place, so finding a stalled judge on the day meant walking over to
   * look at them.
   */
  describe("10. Live judge progress", () => {
    const MIN = 60 * 1000;

    const judgeRow = (id: string, name: string) => ({
      id,
      name,
      email: `${name.toLowerCase()}@example.com`,
      isActive: true,
    });

    /**
     * liveProgress reads the judges and the projects through the query API,
     * and the visits (joined to their projects) then the votes through
     * select, in that order.
     */
    const wireFloor = (opts: {
      judges: unknown[];
      visits?: unknown[];
      votes?: unknown[];
      projects?: unknown[];
    }) => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      mockFindMany.mockImplementation((table: string) => {
        if (table === "judges") return opts.judges;
        if (table === "judgingProjects") return opts.projects ?? [];
        return [];
      });
      mockSelect.mockReset();
      mockSelect
        .mockReturnValueOnce(opts.visits ?? [])
        .mockReturnValueOnce(opts.votes ?? [])
        .mockReturnValue([]);
    };

    const visit = (over: Record<string, unknown> = {}) => ({
      judgeId: JUDGE_ID,
      projectId: PROJECT_A,
      isCompleted: false,
      startedAt: null,
      arrivedAt: null,
      tableNumber: 7,
      projectName: "Flood Mapper",
      ...over,
    });

    it("reports a judge who has not been sent to a table yet", async () => {
      wireFloor({
        judges: [judgeRow(JUDGE_ID, "Ada")],
        projects: [{ id: PROJECT_A }],
      });

      const res = await adminCaller().judge.liveProgress({
        hackathonId: HACK_A,
      });

      expect(res.judges[0]).toMatchObject({
        judgeId: JUDGE_ID,
        status: "not_started",
        scored: 0,
        voided: 0,
        idleMinutes: null,
        current: null,
      });
      expect(res.totals).toMatchObject({ judges: 1, scored: 0, voided: 0 });
    });

    it("shows which table a judge is standing at, and for how long", async () => {
      wireFloor({
        judges: [judgeRow(JUDGE_ID, "Ada")],
        visits: [
          visit({
            startedAt: new Date(Date.now() - 3 * MIN),
            arrivedAt: new Date(Date.now() - 2 * MIN),
          }),
        ],
        projects: [{ id: PROJECT_A }],
      });

      const res = await adminCaller().judge.liveProgress({
        hackathonId: HACK_A,
      });

      expect(res.judges[0]).toMatchObject({ status: "judging", idleMinutes: 0 });
      // Timed from the tap, not from hand-out: the walk is not judging.
      expect(res.judges[0]!.current).toMatchObject({
        tableNumber: 7,
        projectName: "Flood Mapper",
        phase: "judging",
      });
      expect(res.judges[0]!.current!.seconds).toBeGreaterThanOrEqual(120);
      expect(res.judges[0]!.current!.seconds).toBeLessThan(130);
    });

    it("counts idle minutes from the last vote", async () => {
      wireFloor({
        judges: [judgeRow(JUDGE_ID, "Ada")],
        visits: [
          visit({
            isCompleted: true,
            startedAt: new Date(Date.now() - 30 * MIN),
            arrivedAt: new Date(Date.now() - 28 * MIN),
          }),
        ],
        votes: [
          {
            judgeId: JUDGE_ID,
            projectId: PROJECT_A,
            votedAt: new Date(Date.now() - 25 * MIN),
            durationSeconds: 180,
          },
        ],
        projects: [{ id: PROJECT_A }],
      });

      const res = await adminCaller().judge.liveProgress({
        hackathonId: HACK_A,
      });

      expect(res.judges[0]).toMatchObject({
        status: "between",
        scored: 1,
        voided: 0,
        idleMinutes: 25,
      });
    });

    it("counts how many projects nobody has seen, and the fewest looks any has had", async () => {
      wireFloor({
        judges: [judgeRow(JUDGE_ID, "Ada"), judgeRow(OTHER_JUDGE_ID, "Grace")],
        votes: [
          { judgeId: JUDGE_ID, projectId: PROJECT_A, votedAt: new Date(), durationSeconds: 200 },
          { judgeId: OTHER_JUDGE_ID, projectId: PROJECT_A, votedAt: new Date(), durationSeconds: 200 },
          { judgeId: JUDGE_ID, projectId: PROJECT_B, votedAt: new Date(), durationSeconds: 200 },
        ],
        projects: [{ id: PROJECT_A }, { id: PROJECT_B }, { id: "project_c" }],
      });

      const res = await adminCaller().judge.liveProgress({
        hackathonId: HACK_A,
      });

      expect(res.coverage).toMatchObject({
        projects: 3,
        unseen: 1,
        minLooks: 0,
        atTarget: 1,
      });
      expect(res.totals.scored).toBe(3);
    });

    it("puts the judge who has not started above the one who is judging", async () => {
      wireFloor({
        judges: [judgeRow(JUDGE_ID, "Ada"), judgeRow(OTHER_JUDGE_ID, "Grace")],
        visits: [
          visit({
            startedAt: new Date(Date.now() - 2 * MIN),
            arrivedAt: new Date(Date.now() - 1 * MIN),
          }),
        ],
        projects: [{ id: PROJECT_A }],
      });

      const res = await adminCaller().judge.liveProgress({
        hackathonId: HACK_A,
      });

      expect(res.judges.map((j) => [j.judgeId, j.status])).toEqual([
        [OTHER_JUDGE_ID, "not_started"],
        [JUDGE_ID, "judging"],
      ]);
    });

    it("is refused to somebody who is not staff", async () => {
      mockFindFirst.mockImplementation(() => undefined);

      await expect(
        appRouter
          .createCaller(ctxFor("random_user"))
          .judge.liveProgress({ hackathonId: HACK_A }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // =====================================================================
  /**
   * An organiser pulling a project. Marking the judging entry withdrawn was
   * not enough: every queue read kept routing judges to the pulled table.
   */
  describe("14. Organiser withdrawal", () => {
    const wireWithdraw = () =>
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "hackathonProjects")
          return { id: PROJECT_A, hackathonId: HACK_A, status: "submitted" };
        return undefined;
      });

    it("drops the project's unscored queue slots", async () => {
      wireWithdraw();
      mockUpdate.mockReturnValue([{ id: "judging_row" }]);

      await adminCaller().hackathon.adminWithdrawProject({
        projectId: PROJECT_A,
      });

      // Exactly one delete, on judge_queue. The audit write behind the
      // withdrawal may also prune audit_logs, which is not this.
      const queueDeletes = mockDelete.mock.calls.filter(
        (call) => call[1]?.[0] === judgeQueue,
      );
      expect(queueDeletes).toHaveLength(1);
    });

    it("touches no queue when the project was never promoted", async () => {
      wireWithdraw();
      mockUpdate.mockReturnValue([]);

      await adminCaller().hackathon.adminWithdrawProject({
        projectId: PROJECT_A,
      });

      expect(
        mockDelete.mock.calls.filter((call) => call[1]?.[0] === judgeQueue),
      ).toHaveLength(0);
    });
  });

  // =====================================================================
  /**
   * The 4:00 cutoff, counted from the tap or scan. A score that arrives after
   * it (plus a few seconds' grace) would be a look nobody can vouch for, so
   * the table goes back into the pool instead.
   */
  describe("15. The scoring cutoff", () => {
    const slotArrived = (arrivedAt: Date) => ({
      id: QUEUE_A,
      judgeId: JUDGE_ID,
      hackathonId: HACK_A,
      projectId: PROJECT_A,
      isCompleted: false,
      startedAt: arrivedAt,
      arrivedAt,
    });

    it("refuses a first score past the cutoff, but lets an existing one be revised", async () => {
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [slotArrived(lapsed())],
      });

      await expect(
        judgeCaller().judge.submitVote({ projectId: PROJECT_A, ...scores }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringMatching(/time ran out/i),
      });
      expect(mockInsert).not.toHaveBeenCalled();

      // The same late slot, but the judge already scored inside the window:
      // correcting that score is allowed while judging is open.
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [slotArrived(lapsed())],
        vote: { id: "vote_1" },
      });

      await expect(
        judgeCaller().judge.submitVote({ projectId: PROJECT_A, ...scores }),
      ).resolves.toBeDefined();
      expect(insertsInto(judgeVotes)).toHaveLength(1);
    });

    it("voids a completion past the cutoff and moves the judge on", async () => {
      wireJudge({
        project: { id: PROJECT_A, hackathonId: HACK_A },
        queue: [slotArrived(lapsed())],
      });
      // Nothing left to hand out, so the judge is done once the slot closes.
      wireDispatch({ pool: [] });

      const res = await judgeCaller().judge.completeAndNext({
        queueId: QUEUE_A,
        projectId: PROJECT_A,
        ...scores,
      });

      expect(res).toMatchObject({ timedOut: true, done: true });
      expect(insertsInto(judgeVotes)).toHaveLength(0);
      // The slot is closed, so the table goes back to the pool.
      const closed = mockUpdate.mock.calls.some(
        (call) => call[1]?.[0] === judgeQueue && call[2]?.[0]?.isCompleted === true,
      );
      expect(closed).toBe(true);
    });
  });

  // isJudge reads ids before the procedure's schema runs, and each one goes
  // into a uuid column: a malformed id was a Postgres error and a 500.
  it("refuses a malformed id before it reaches the database", async () => {
    await expect(
      judgeCaller().judge.getNextTable({ hackathonId: "not-a-uuid" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
