/**
 * Judge roster edge cases: approval, the preferred track on an application,
 * removal and its cache eviction, and an organiser pulling a project out of
 * judging. Room judging has its own tests next to its services.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db, judges, judgeAssignments, judgingEntries } from "@query/db";

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
        judgingEntries: table("judgingEntries"),
        judgingPlacements: table("judgingPlacements"),
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
    judgingPlacements: {
      id: "id",
      hackathonId: "hackathon_id",
      publishedAt: "published_at",
    },
    judgingEntries: {
      id: "id",
      sourceProjectId: "source_project_id",
      deletedAt: "deleted_at",
      deletedById: "deleted_by_id",
      updatedAt: "updated_at",
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
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const JUDGE_ID = "66666666-6666-4666-8666-666666666666";

const JUDGE_ROW = {
  id: JUDGE_ID,
  userId: "judge_user",
  hackathonId: HACK_A,
  isActive: true,
  name: "Grace Hopper",
};
// Super admin, because removing a judge is restricted to that tier. It still
// passes isAdmin, so the rest of the suite is unaffected.
const ADMIN_ROW = { userId: "admin_user", isActive: true, role: "super_admin" };
const PLAIN_ADMIN_ROW = { userId: "admin_user", isActive: true, role: "admin" };

describe("Judge roster edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
    mockFindFirst.mockImplementation(() => undefined);
    mockFindMany.mockImplementation(() => []);
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

  /** Every row a mutation inserted into `table`, flattened. */
  const insertsInto = (table: unknown) =>
    mockInsert.mock.calls
      .filter((c) => c[1]?.[0] === table)
      .flatMap((c) => {
        const values = c[2]?.[0];
        return Array.isArray(values) ? values : values ? [values] : [];
      });

  const judgeCaller = () => appRouter.createCaller(ctxFor("judge_user"));
  const adminCaller = () => appRouter.createCaller(ctxFor("admin_user"));
  const applicantCaller = () =>
    appRouter.createCaller(ctxFor("applicant_user"));

  // =====================================================================
  describe("1. Approving a judge", () => {
    const wireApproval = () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "judgeAssignments")
          return { id: "asn_1", judgeId: JUDGE_ID, hackathonId: HACK_A };
        return undefined;
      });
      mockUpdate.mockReturnValue([
        { userId: "judge_user", hackathonId: HACK_A },
      ]);
    };

    // Approval only flips the judge row and mirrors it onto the application.
    // There is no queue to build: judges are seated in rooms on the day.
    it("writes no rows beyond the judge and its application", async () => {
      wireApproval();

      const approved = await adminCaller().judge.setActive({
        judgeId: JUDGE_ID,
        isActive: true,
      });
      expect(approved).toEqual({ success: true, isActive: true });

      const suspended = await adminCaller().judge.setActive({
        judgeId: JUDGE_ID,
        isActive: false,
      });
      expect(suspended).toEqual({ success: true, isActive: false });

      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
      const updatedTables = new Set(mockUpdate.mock.calls.map((c) => c[1]?.[0]));
      expect(updatedTables).toEqual(new Set([judges, judgeAssignments]));
    });

    it("mirrors approval onto the application's status", async () => {
      wireApproval();

      await adminCaller().judge.setActive({ judgeId: JUDGE_ID, isActive: true });

      const mirrored = mockUpdate.mock.calls.find(
        (c) => c[1]?.[0] === judgeAssignments,
      );
      expect(mirrored?.[2]?.[0]).toEqual({ status: "approved" });
    });

    it("is NOT_FOUND for a judge that does not exist", async () => {
      wireApproval();
      mockUpdate.mockReturnValue([]);

      await expect(
        adminCaller().judge.setActive({ judgeId: JUDGE_ID, isActive: true }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // =====================================================================
  describe("2. A judge's preferred track must exist on the edition", () => {
    /**
     * Free text used to land straight in the track column, where it matched
     * nothing on the edition. register keeps the edition's own labels only.
     */
    const wireTrack = (labels: Record<string, unknown>) => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "hackathons")
          return { isPublic: true, status: "open", ...labels };
        return undefined;
      });
    };

    const application = (preferredTrack: string) => ({
      hackathonId: HACK_A,
      name: "Ada Lovelace",
      email: "ada@example.com",
      preferredTrack,
    });

    const applicationRow = () =>
      insertsInto(judgeAssignments).find((row) => "judgeId" in row);

    it("refuses a track the hackathon does not have", async () => {
      wireTrack({ tracks: ["Sports"], challenges: ["AWS"] });

      await expect(
        applicantCaller().judge.register(application("Web3")),
      ).rejects.toThrow(/not a track or challenge/i);

      expect(insertsInto(judgeAssignments)).toHaveLength(0);
    });

    it("stores the edition's own spelling of a differently cased track", async () => {
      wireTrack({ tracks: ["Sports"], challenges: null });

      await applicantCaller().judge.register(application("sports"));

      expect(applicationRow()?.track).toBe("Sports");
    });

    it("accepts a challenge label and createX", async () => {
      wireTrack({ tracks: ["Sports"], challenges: ["AWS"] });
      await applicantCaller().judge.register(application("AWS"));
      expect(applicationRow()?.track).toBe("AWS");

      mockInsert.mockClear();
      await applicantCaller().judge.register(application("createX"));
      expect(applicationRow()?.track).toBe("createX");
    });

    it("refuses a second application to the same edition", async () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "hackathons") return { isPublic: true, status: "open" };
        if (table === "judges") return { id: JUDGE_ID };
        if (table === "judgeAssignments") return { id: "asn_1" };
        return undefined;
      });

      await expect(
        applicantCaller().judge.register(application("")),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  // =====================================================================
  describe("3. Removing a judge", () => {
    // judge_vote.judge_id cascades, so deleting a judge who scored in a past
    // edition would erase those scores.
    it("refuses to delete a judge who has already submitted votes", async () => {
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "judges") return JUDGE_ROW;
        if (table === "judgeVotes") return { id: "vote_1", judgeId: JUDGE_ID };
        return undefined;
      });

      await expect(
        adminCaller().judge.remove({ judgeId: JUDGE_ID }),
      ).rejects.toThrow();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    /**
     * Approving a judge is part of running the event, so any admin may.
     * Deleting the judge stays super-admin.
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

    // judge.isJudge caches its answer for 60s under `judge:<userId>:<id>`.
    // Removal has to clear it, or a removed judge keeps the Judge tab and the
    // judge desk for a minute on every warm instance.
    it("turns isJudge off on the removed judge's very next request", async () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "judges" ? JUDGE_ROW : undefined,
      );
      await expect(
        judgeCaller().judge.isJudge({ hackathonId: HACK_A }),
      ).resolves.toMatchObject({ isJudge: true, judgeId: JUDGE_ID });

      mockFindFirst.mockImplementation((table: string) =>
        table === "admins" ? ADMIN_ROW : undefined,
      );
      mockDelete.mockReturnValue([{ userId: "judge_user" }]);
      await adminCaller().judge.remove({ judgeId: JUDGE_ID });

      // The judges row is gone now.
      mockFindFirst.mockImplementation(() => undefined);
      await expect(
        judgeCaller().judge.isJudge({ hackathonId: HACK_A }),
      ).resolves.toMatchObject({ isJudge: false, judgeId: null });
    });
  });

  // =====================================================================
  /**
   * An organiser pulling a project takes its judging entry with it, or judges
   * keep seeing it and it can still be published as a placing.
   */
  describe("4. Organiser withdrawal", () => {
    const wireWithdraw = (opts: {
      status?: string;
      entry?: Record<string, unknown>;
    }) =>
      mockFindFirst.mockImplementation((table: string) => {
        if (table === "admins") return ADMIN_ROW;
        if (table === "hackathonProjects")
          return {
            id: PROJECT_A,
            hackathonId: HACK_A,
            status: opts.status ?? "submitted",
          };
        if (table === "judgingEntries") return opts.entry;
        return undefined;
      });

    const entryUpdates = () =>
      mockUpdate.mock.calls.filter((call) => call[1]?.[0] === judgingEntries);

    it("soft-deletes the project's judging entry", async () => {
      wireWithdraw({});

      await adminCaller().hackathon.adminWithdrawProject({
        projectId: PROJECT_A,
      });

      const updates = entryUpdates();
      expect(updates).toHaveLength(1);
      expect(updates[0]?.[2]?.[0]).toMatchObject({
        deletedAt: expect.any(Date),
        deletedById: "admin_user",
      });
      // Soft delete: nothing is removed, so evaluations keep their entry.
      expect(
        mockDelete.mock.calls.filter((call) => call[1]?.[0] === judgingEntries),
      ).toHaveLength(0);
    });

    it("asks for confirmation when the project is in judging", async () => {
      wireWithdraw({ entry: { id: "entry_1" } });

      await expect(
        adminCaller().hackathon.adminWithdrawProject({ projectId: PROJECT_A }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockUpdate).not.toHaveBeenCalled();

      await adminCaller().hackathon.adminWithdrawProject({
        projectId: PROJECT_A,
        force: true,
      });
      expect(entryUpdates()).toHaveLength(1);
    });

    it("clears the edition's cached public results", async () => {
      wireWithdraw({});
      cache.set(`hackathon:${HACK_A}:results`, [{ id: "stale" }], 60);

      await adminCaller().hackathon.adminWithdrawProject({
        projectId: PROJECT_A,
      });

      expect(cache.get(`hackathon:${HACK_A}:results`)).toBeNull();
    });

    it("treats the judging status as in judging too", async () => {
      wireWithdraw({ status: "judging" });

      await expect(
        adminCaller().hackathon.adminWithdrawProject({ projectId: PROJECT_A }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });
  // =====================================================================
  /**
   * The public results tab reads one list: frozen placings from the retired
   * pool-dispatch judging (past editions) and placements from room judging.
   */
  describe("5. Public results", () => {
    const legacyRow = {
      id: "result_1",
      track: "overall",
      placement: 2,
      weightedScore: "41.50",
      project: { id: "jp_1", name: "Old name", teamMembers: "Ada, Grace" },
      sourceProject: {
        id: "hp_1",
        name: "Tide",
        githubUrl: "https://github.com/ada/tide",
        demoUrl: null,
        team: { id: "team_1", name: "Team Tide" },
      },
    };
    const placementRow = (over: Record<string, unknown>) => ({
      id: "placement_1",
      scope: "overall",
      scopeLabel: "Overall",
      placement: 1,
      score: "4.25",
      entry: {
        id: "entry_1",
        title: "Beacon",
        submissionUrl: "https://devpost.com/software/beacon",
        demoLinks: ["https://beacon.example"],
        sourceProject: null,
      },
      ...over,
    });

    const wireResults = () => {
      mockFindFirst.mockImplementation((table: string) =>
        table === "hackathons" ? { id: HACK_A, status: "completed" } : undefined,
      );
      mockFindMany.mockImplementation((table: string) => {
        if (table === "hackathonResults") return [legacyRow];
        if (table === "judgingPlacements")
          return [
            placementRow({
              id: "placement_2",
              scope: "challenge_1",
              scopeLabel: "Best Use of MongoDB",
              score: null,
            }),
            placementRow({}),
          ];
        return [];
      });
    };

    it("normalises both kinds of placing into one shape", async () => {
      wireResults();

      const results = await judgeCaller().hackathon.getResults({
        hackathonId: HACK_A,
      });

      expect(results).toEqual([
        {
          id: "placement_1",
          scope: "overall",
          scopeLabel: "Overall",
          placement: 1,
          projectName: "Beacon",
          teamName: null,
          githubUrl: null,
          demoUrl: "https://beacon.example",
          submissionUrl: "https://devpost.com/software/beacon",
          score: 4.25,
        },
        {
          id: "result_1",
          scope: "overall",
          scopeLabel: "Overall",
          placement: 2,
          projectName: "Tide",
          teamName: "Team Tide",
          githubUrl: "https://github.com/ada/tide",
          demoUrl: null,
          submissionUrl: null,
          score: 41.5,
        },
        {
          id: "placement_2",
          scope: "challenge_1",
          scopeLabel: "Best Use of MongoDB",
          placement: 1,
          projectName: "Beacon",
          teamName: null,
          githubUrl: null,
          demoUrl: "https://beacon.example",
          submissionUrl: "https://devpost.com/software/beacon",
          score: null,
        },
      ]);
    });

    it("drops a placing whose project an organiser pulled", async () => {
      wireResults();
      mockFindMany.mockImplementation((table: string) =>
        table === "judgingPlacements"
          ? [
              placementRow({
                entry: {
                  id: "entry_1",
                  title: "Beacon",
                  submissionUrl: null,
                  demoLinks: [],
                  deletedAt: new Date(),
                  sourceProject: null,
                },
              }),
            ]
          : [],
      );

      await expect(
        judgeCaller().hackathon.getResults({ hackathonId: HACK_A }),
      ).resolves.toEqual([]);
    });

    it("serves the second read from the 60s cache", async () => {
      wireResults();

      await judgeCaller().hackathon.getResults({ hackathonId: HACK_A });
      const reads = mockFindMany.mock.calls.length;
      await judgeCaller().hackathon.getResults({ hackathonId: HACK_A });

      expect(mockFindMany.mock.calls.length).toBe(reads);
    });
  });
});
