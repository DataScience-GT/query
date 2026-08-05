import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import {
  db,
  hackathons,
  hackathonParticipants,
  hackathonTeams,
  hackathonProjects,
  membershipHistory,
} from "@query/db";
import { __onRollback } from "./_db-tx-mock";

// Same file-level DB mock as hackathon-flow.test.ts: every drizzle entry point
// is a spy, and each test supplies a table-name-keyed findFirst implementation.
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@query/db", async () => {
  const { createTransactionMock } = await import("./_db-tx-mock");

  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: (...args: any[]) => mockFindMany(name, ...args),
  });

  return {
    db: {
      // Every hook is wrapped rather than passed by reference: the factory is
      // hoisted above the `const mock*` declarations, so it may only close over
      // them, never read them.
      transaction: createTransactionMock({
        base: () => db,
        update: (...a: any[]) => mockUpdate(...a),
        insert: (...a: any[]) => mockInsert(...a),
      }),
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
        hackathonMaps: table("hackathonMaps"),
        members: table("members"),
        membershipHistory: table("membershipHistory"),
        events: table("events"),
        eventCheckIns: table("eventCheckIns"),
        judges: table("judges"),
        judgeAssignments: table("judgeAssignments"),
        judgingProjects: table("judgingProjects"),
        judgeVotes: table("judgeVotes"),
        judgeQueue: table("judgeQueue"),
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
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => ({
            orderBy: vi.fn().mockResolvedValue([{ count: 0 }]),
            groupBy: vi.fn().mockResolvedValue([]),
            limit: vi.fn().mockResolvedValue([]),
            offset: vi.fn().mockResolvedValue([]),
            // `.for("update")` row-locks before a seat recount.
            for: vi.fn().mockResolvedValue([{ count: 0 }]),
          })),
          orderBy: vi.fn().mockResolvedValue([{ count: 0 }]),
          groupBy: vi.fn().mockResolvedValue([]),
          innerJoin: vi.fn().mockImplementation(() => ({
            innerJoin: vi.fn().mockImplementation(() => ({
              where: vi.fn().mockResolvedValue([]),
            })),
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", email: "email", name: "name", image: "image" },
    userProfiles: { userId: "user_id" },
    hackathons: {
      id: "id",
      name: "name",
      status: "status",
      isPublic: "is_public",
      startDate: "start_date",
      endDate: "end_date",
      hackingStartTime: "hacking_start_time",
      registrationDeadline: "registration_deadline",
      judgingActive: "judging_active",
      currentParticipants: "current_participants",
      maxParticipants: "max_participants",
    },
    hackathonParticipants: {
      id: "id",
      hackathonId: "hackathon_id",
      userId: "user_id",
      teamId: "team_id",
      registrationStatus: "registration_status",
      hasSubmittedProject: "has_submitted_project",
      registeredAt: "registered_at",
    },
    hackathonTeams: {
      id: "id",
      hackathonId: "hackathon_id",
      name: "name",
      captainId: "captain_id",
      currentMembers: "current_members",
      maxMembers: "max_members",
      isOpen: "is_open",
      createdAt: "created_at",
    },
    hackathonProjects: {
      id: "id",
      hackathonId: "hackathon_id",
      teamId: "team_id",
      name: "name",
      status: "status",
    },
    hackathonEvents: { id: "id", hackathonId: "hackathon_id", name: "name" },
    hackathonEventAttendees: {
      eventId: "event_id",
      participantId: "participant_id",
    },
    hackathonMaps: { id: "id", hackathonId: "hackathon_id" },
    members: {
      id: "id",
      userId: "user_id",
      hackathonId: "hackathon_id",
      isActive: "is_active",
      memberType: "member_type",
      membershipEndDate: "membership_end_date",
    },
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
    },
    judgeAssignments: { judgeId: "judge_id", hackathonId: "hackathon_id" },
    judgingProjects: {
      id: "id",
      hackathonId: "hackathon_id",
      tableNumber: "table_number",
    },
    judgeVotes: { judgeId: "judge_id", projectId: "project_id", score: "score" },
    judgeQueue: {
      id: "id",
      judgeId: "judge_id",
      hackathonId: "hackathon_id",
      isCompleted: "is_completed",
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const HACK_A = "11111111-1111-4111-8111-111111111111";
const HACK_NEXT = "22222222-2222-4222-8222-222222222222";
const TEAM_A = "77777777-7777-4777-8777-777777777777";
const PARTICIPANT_A = "33333333-3333-4333-8333-333333333333";
const PARTICIPANT_B = "44444444-4444-4444-8444-444444444444";
const PROJECT_A = "66666666-6666-4666-8666-666666666666";

const createMockCtx = (userId?: string) =>
  ({
    db,
    session: userId ? { user: { id: userId } } : null,
    userId: userId || undefined,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  }) as any;

const callerFor = (userId?: string) =>
  appRouter.createCaller(createMockCtx(userId));

/** A running hackathon whose hacking clock started `hours` ago. */
const runningHackathon = (hours: number, overrides: Record<string, any> = {}) => ({
  id: HACK_A,
  name: "Data for Good",
  status: "open",
  startDate: new Date(Date.now() - hours * HOUR),
  endDate: new Date(Date.now() + 24 * HOUR),
  hackingStartTime: new Date(Date.now() - hours * HOUR),
  registrationDeadline: new Date(Date.now() + 5 * DAY),
  maxParticipants: 500,
  currentParticipants: 10,
  ...overrides,
});

const projectInput = (overrides: Record<string, any> = {}) => ({
  hackathonId: HACK_A,
  name: "Flood Risk Mapper",
  description: "Maps flood risk from open census and elevation data.",
  ...overrides,
});

const registrationInput = (overrides: Record<string, any> = {}) => ({
  hackathonId: HACK_A,
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "555-0100",
  age: 20,
  school: "Georgia Tech",
  major: "Computer Science",
  graduationYear: 2027,
  levelOfStudy: "Junior" as const,
  country: "United States",
  agreeToCodeOfConduct: true as const,
  ...overrides,
});

/** Tables touched by insert/update/delete, so tests can assert on writes. */
const insertedInto = (t: unknown) =>
  mockInsert.mock.calls.filter((c) => c[1]?.[0] === t);
const updatedTables = () => mockUpdate.mock.calls.map((c) => c[1]?.[0]);
const deletedTables = () => mockDelete.mock.calls.map((c) => c[1]?.[0]);

describe("Participant edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations, so per-test write simulations would
    // leak into the next test. Reset the five drizzle entry points explicitly.
    mockFindFirst.mockReset();
    mockFindMany.mockReset().mockReturnValue([]);
    mockInsert.mockReset().mockReturnValue([]);
    mockUpdate.mockReset().mockReturnValue([]);
    mockDelete.mockReset().mockReturnValue([]);
    cache.clear();
  });

  // =====================================================================
  describe("1. Project submission ownership", () => {
    /** A participant who belongs to a team captained by someone else. */
    const teammateCaller = (
      hoursIn: number,
      opts: {
        captainId?: string;
        status?: string;
        hackathonStatus?: string;
        existingProject?: Record<string, any>;
      } = {},
    ) => {
      // A project that has been inserted is findable afterwards, so a resubmit
      // sees the row the first submit created rather than an empty table.
      let projectRow = opts.existingProject;
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons")
          return runningHackathon(hoursIn, {
            status: opts.hackathonStatus ?? "open",
          });
        if (table === "hackathonParticipants")
          return {
            id: PARTICIPANT_A,
            hackathonId: HACK_A,
            userId: "user_a",
            teamId: TEAM_A,
            registrationStatus: opts.status ?? "approved",
            team: { id: TEAM_A, captainId: opts.captainId ?? "captain_user" },
          };
        if (table === "hackathonTeams")
          return {
            id: TEAM_A,
            hackathonId: HACK_A,
            captainId: opts.captainId ?? "captain_user",
            currentMembers: 3,
            maxMembers: 4,
          };
        if (table === "hackathonProjects") return projectRow;
        return undefined;
      });
      mockInsert.mockImplementation((_op, insertArgs, valArgs) => {
        if (insertArgs[0] === hackathonProjects) {
          projectRow = { id: PROJECT_A, status: "submitted", ...valArgs[0] };
        }
        return [{ id: PROJECT_A, status: "submitted" }];
      });
      mockUpdate.mockReturnValue([{ id: PROJECT_A, status: "submitted" }]);
      return callerFor("user_a");
    };

    // BUG: team.ts:515-542 only enforces captain ownership inside
    // `if (input.teamId)`. Omitting teamId skips the check entirely.
    it("refuses a submission from a team member who is not the captain", async () => {
      const caller = teammateCaller(20);

      await expect(
        caller.team.submitProject(projectInput()),
      ).rejects.toThrow(/captain/i);
    });

    // BUG: team.ts:494 only looks up an existing project when input.teamId is
    // set, so the teamId-less path always takes the INSERT branch.
    it("updates the existing project instead of inserting a duplicate on resubmit", async () => {
      // Starts with nothing filed: the first submit creates the project, the
      // second has to find and update it rather than file a second row.
      const caller = teammateCaller(20, { captainId: "user_a" });

      await caller.team.submitProject(projectInput());
      await caller.team.submitProject(projectInput({ name: "Renamed" }));

      expect(insertedInto(hackathonProjects)).toHaveLength(1);
      expect(updatedTables()).toContain(hackathonProjects);
    });

    // BUG: submitProject reads hackingStartTime/startDate off the hackathon but
    // never inspects hackathon.status (team.ts:453-464).
    it("refuses a submission to a cancelled hackathon", async () => {
      const caller = teammateCaller(20, {
        captainId: "user_a",
        hackathonStatus: "cancelled",
      });

      await expect(
        caller.team.submitProject(projectInput({ teamId: TEAM_A })),
      ).rejects.toThrow(/cancelled|not open|closed/i);
    });

    it("accepts a captain's submission landing exactly on the +36h hard deadline", async () => {
      // Freeze on the real clock: winding the system clock backwards would
      // drive the rate limiter's token refill negative.
      vi.useFakeTimers();
      try {
        const caller = teammateCaller(36, { captainId: "user_a" });

        const res = await caller.team.submitProject(
          projectInput({ teamId: TEAM_A }),
        );
        expect(res).toMatchObject({ id: PROJECT_A });
      } finally {
        vi.useRealTimers();
      }
    });

    it("still allows an edit landing exactly on the +34h devpost freeze", async () => {
      // Freeze on the real clock: winding the system clock backwards would
      // drive the rate limiter's token refill negative.
      vi.useFakeTimers();
      try {
        const caller = teammateCaller(34, {
          captainId: "user_a",
          existingProject: { id: PROJECT_A, status: "submitted" },
        });

        const res = await caller.team.submitProject(
          projectInput({ teamId: TEAM_A }),
        );
        expect(res).toMatchObject({ id: PROJECT_A });
        expect(insertedInto(hackathonProjects)).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // =====================================================================
  describe("2. Team window milestones", () => {
    /** Frozen on the real clock so "now" is exact to the millisecond. */
    let FIXED: Date;

    beforeEach(() => {
      vi.useFakeTimers();
      FIXED = new Date();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Places "now" exactly `offsetMs` after the hacking start. */
    const atOffset = (offsetMs: number, participant?: Record<string, any>) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons")
          return {
            id: HACK_A,
            status: "open",
            startDate: new Date(FIXED.getTime() - offsetMs),
            endDate: new Date(FIXED.getTime() + 24 * HOUR),
            hackingStartTime: new Date(FIXED.getTime() - offsetMs),
          };
        if (table === "hackathonParticipants")
          return participant ?? { id: PARTICIPANT_A, teamId: null };
        if (table === "hackathonTeams")
          return {
            id: TEAM_A,
            hackathonId: HACK_A,
            captainId: "other_user",
            currentMembers: 2,
            maxMembers: 4,
            isOpen: true,
          };
        return undefined;
      });
      mockInsert.mockReturnValue([{ id: TEAM_A, name: "meow" }]);
      return callerFor("user_a");
    };

    it.each([
      { label: "+12h, the instant the window opens", offset: 12 * HOUR, isOpen: true, canLeave: true },
      { label: "+24h, the instant rosters lock", offset: 24 * HOUR, isOpen: true, canLeave: false },
      { label: "+34h, the instant the window closes", offset: 34 * HOUR, isOpen: true, canLeave: false },
      { label: "+36h, the submission hard deadline", offset: 36 * HOUR, isOpen: false, canLeave: false },
    ])(
      "reports $label as open=$isOpen, canLeave=$canLeave",
      async ({ offset, isOpen, canLeave }) => {
        const caller = atOffset(offset);

        const res = await caller.team.window({ hackathonId: HACK_A });
        expect(res.isOpen).toBe(isOpen);
        expect(res.canCreate).toBe(isOpen);
        expect(res.canJoin).toBe(isOpen);
        expect(res.canLeave).toBe(canLeave);
      },
    );

    it("lets a team form at exactly +12h but not one millisecond earlier", async () => {
      const early = atOffset(12 * HOUR - 1);
      await expect(
        early.team.createTeam({ hackathonId: HACK_A, name: "meow", maxMembers: 4 }),
      ).rejects.toThrow(/not open yet/);

      const onTime = atOffset(12 * HOUR);
      await expect(
        onTime.team.createTeam({ hackathonId: HACK_A, name: "meow", maxMembers: 4 }),
      ).resolves.toMatchObject({ id: TEAM_A });
    });

    it("lets a team form at exactly +34h but not one millisecond later", async () => {
      const onTime = atOffset(34 * HOUR);
      await expect(
        onTime.team.createTeam({ hackathonId: HACK_A, name: "meow", maxMembers: 4 }),
      ).resolves.toMatchObject({ id: TEAM_A });

      const late = atOffset(34 * HOUR + 1);
      await expect(
        late.team.createTeam({ hackathonId: HACK_A, name: "meow", maxMembers: 4 }),
      ).rejects.toThrow(/closed/);
    });

    it("refuses to let a member leave from the exact instant rosters lock at +24h", async () => {
      const locked = atOffset(24 * HOUR, {
        id: PARTICIPANT_A,
        teamId: TEAM_A,
      });
      await expect(
        locked.team.leaveTeam({ hackathonId: HACK_A }),
      ).rejects.toThrow(/within 12 hours of the project deadline/);

      const stillOpen = atOffset(24 * HOUR - 1, {
        id: PARTICIPANT_A,
        teamId: TEAM_A,
      });
      await expect(
        stillOpen.team.leaveTeam({ hackathonId: HACK_A }),
      ).resolves.toMatchObject({ success: true });
    });
  });

  // =====================================================================
  describe("3. Roster changes during the freeze", () => {
    const captainCaller = (
      hoursIn: number,
      opts: { currentMembers?: number; project?: Record<string, any> } = {},
    ) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return runningHackathon(hoursIn);
        if (table === "hackathonParticipants")
          return {
            id: PARTICIPANT_A,
            hackathonId: HACK_A,
            userId: "user_a",
            teamId: TEAM_A,
            registrationStatus: "approved",
          };
        if (table === "hackathonTeams")
          return {
            id: TEAM_A,
            hackathonId: HACK_A,
            captainId: "user_a",
            currentMembers: opts.currentMembers ?? 3,
            maxMembers: 4,
            isOpen: true,
          };
        if (table === "hackathonProjects") return opts.project;
        return undefined;
      });
      return callerFor("user_a");
    };

    // BUG: disbandTeam calls checkTeamEditWindow (opensAt/closesAt only) and
    // never consults window.canLeave the way leaveTeam does at team.ts:255.
    it("refuses to disband a team once rosters have locked at +24h", async () => {
      const caller = captainCaller(30, {
        project: { id: PROJECT_A, teamId: TEAM_A, status: "submitted" },
      });

      await expect(
        caller.team.disbandTeam({ hackathonId: HACK_A, teamId: TEAM_A }),
      ).rejects.toThrow(/lock|leave|within 12 hours/i);
    });

    // BUG: team.ts:293-309 deletes hackathonProjects unconditionally when a
    // solo captain leaves — no check on project.status.
    it("keeps a submitted project when its solo captain leaves the team", async () => {
      const caller = captainCaller(20, {
        currentMembers: 1,
        project: { id: PROJECT_A, teamId: TEAM_A, status: "submitted" },
      });

      await caller.team.leaveTeam({ hackathonId: HACK_A }).catch(() => undefined);

      expect(deletedTables()).not.toContain(hackathonProjects);
    });

    // leaveTeam and disbandTeam both refuse while a submission stands and tell
    // the captain to withdraw it first, so that has to be something they can
    // actually do — otherwise both flows are dead ends.
    it("lets the captain withdraw the submission the disband error names", async () => {
      const caller = captainCaller(20, {
        currentMembers: 1,
        project: { id: PROJECT_A, teamId: TEAM_A, status: "submitted" },
      });

      await expect(
        caller.team.disbandTeam({ hackathonId: HACK_A, teamId: TEAM_A }),
      ).rejects.toThrow(/withdrawn/i);

      await expect(
        caller.team.withdrawProject({ hackathonId: HACK_A }),
      ).resolves.toMatchObject({ success: true });

      const setStatuses = mockUpdate.mock.calls
        .filter((c) => c[1]?.[0] === hackathonProjects)
        .map((c) => c[2]?.[0]?.status);
      expect(setStatuses).toContain("draft");
    });

    it("refuses to withdraw once judging has the project", async () => {
      const caller = captainCaller(20, {
        currentMembers: 1,
        project: { id: PROJECT_A, teamId: TEAM_A, status: "judging" },
      });

      await expect(
        caller.team.withdrawProject({ hackathonId: HACK_A }),
      ).rejects.toThrow(/Judging has started/i);
    });
  });

  // =====================================================================
  describe("4. Registration status gates team actions", () => {
    const rejectedApplicant = (status: string) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return runningHackathon(20);
        if (table === "hackathonParticipants")
          return {
            id: PARTICIPANT_A,
            hackathonId: HACK_A,
            userId: "user_a",
            teamId: null,
            registrationStatus: status,
          };
        if (table === "hackathonTeams")
          return {
            id: TEAM_A,
            hackathonId: HACK_A,
            captainId: "user_a",
            currentMembers: 1,
            maxMembers: 4,
            isOpen: true,
          };
        return undefined;
      });
      mockInsert.mockReturnValue([{ id: TEAM_A, name: "meow" }]);
      return callerFor("user_a");
    };

    // BUG: createTeam/joinTeam/submitProject only assert that a participant row
    // exists (team.ts:98, 170, 445) — registrationStatus is never inspected,
    // unlike hackathon.scanParticipantPass.
    it.each(["rejected", "waitlisted"])(
      "keeps a %s applicant out of teams and out of judging",
      async (status) => {
        const caller = rejectedApplicant(status);

        await expect(
          caller.team.createTeam({ hackathonId: HACK_A, name: "meow", maxMembers: 4 }),
        ).rejects.toThrow(new RegExp(status));
        await expect(
          caller.team.joinTeam({ hackathonId: HACK_A, teamId: TEAM_A }),
        ).rejects.toThrow(new RegExp(status));
        await expect(
          caller.team.submitProject(projectInput()),
        ).rejects.toThrow(new RegExp(status));
      },
    );
  });

  // =====================================================================
  describe("5. Concurrent team mutations", () => {
    // The seat is taken by `update ... where currentMembers < maxMembers`, so
    // the count each caller read is only a hint; the UPDATE re-tests it. A
    // plain `team.currentMembers + 1` written from the snapshot would be a lost
    // update and would seat five people in a team of four.
    it("admits only one of two racing joins into the last free seat", async () => {
      // A team with 3 of 4 seats taken. findFirst hands out snapshots, exactly
      // as an unlocked SELECT inside a transaction would.
      const teamRow = {
        id: TEAM_A,
        hackathonId: HACK_A,
        captainId: "captain_user",
        currentMembers: 3,
        maxMembers: 4,
        isOpen: true,
      };
      let participantLookups = 0;

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return runningHackathon(20);
        if (table === "hackathonParticipants") {
          participantLookups += 1;
          return {
            id: participantLookups === 1 ? PARTICIPANT_A : PARTICIPANT_B,
            hackathonId: HACK_A,
            teamId: null,
            registrationStatus: "approved",
          };
        }
        if (table === "hackathonTeams") return { ...teamRow };
        return undefined;
      });
      mockUpdate.mockImplementation((_op, updateArgs) => {
        // `where currentMembers < maxMembers` is re-evaluated against the row
        // as it stands when the statement runs — not against the snapshot the
        // caller read — and rowCount reports whether it matched. That is the
        // whole reason the capacity test lives in the UPDATE, so the stand-in
        // has to re-check it too rather than blindly applying the write.
        if (updateArgs[0] === hackathonTeams) {
          if (teamRow.currentMembers >= teamRow.maxMembers)
            return { rowCount: 0 };
          teamRow.currentMembers += 1;
          return { rowCount: 1 };
        }
        // Each caller claims their own participant row, and both start with
        // teamId null, so `where teamId is null` matches for both.
        return { rowCount: 1 };
      });

      const results = await Promise.allSettled([
        callerFor("user_a").team.joinTeam({ hackathonId: HACK_A, teamId: TEAM_A }),
        callerFor("user_b").team.joinTeam({ hackathonId: HACK_A, teamId: TEAM_A }),
      ]);

      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(String((rejected[0] as PromiseRejectedResult)?.reason)).toMatch(
        /full/,
      );
      // Both writers computed 3 + 1, so the counter reads 4 while five people
      // actually hold teamId = TEAM_A.
      expect(teamRow.currentMembers).toBe(4);
    });

    // Both clicks read teamId = null and both insert a team; what stops the
    // orphan — a team with currentMembers=1 and a captain who is not in it,
    // still listed and still accepting joins — is that the slot claim is
    // `where teamId is null`, so the loser matches no row and takes its own
    // insert down with the transaction.
    it("creates only one team when a participant double-clicks Create", async () => {
      const participantRow = {
        id: PARTICIPANT_A,
        hackathonId: HACK_A,
        userId: "user_a",
        teamId: null as string | null,
        registrationStatus: "approved",
      };
      let created = 0;

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return runningHackathon(20);
        if (table === "hackathonParticipants") return { ...participantRow };
        return undefined;
      });
      mockInsert.mockImplementation((_op, insertArgs) => {
        if (insertArgs[0] === hackathonTeams) {
          created += 1;
          // A team inserted by the transaction that then loses the slot claim
          // never existed — counting attempts instead of surviving rows would
          // call the rollback a failure.
          __onRollback(() => {
            created -= 1;
          });
          return [{ id: `team_${created}`, name: "meow" }];
        }
        return [];
      });
      mockUpdate.mockImplementation((_op, updateArgs, setArgs) => {
        if (updateArgs[0] === hackathonParticipants) {
          // `where teamId is null`: the second click finds the slot already
          // claimed and matches nothing.
          if (participantRow.teamId) return { rowCount: 0 };
          Object.assign(participantRow, setArgs[0]);
          return { rowCount: 1 };
        }
        return { rowCount: 1 };
      });

      const caller = callerFor("user_a");
      const input = { hackathonId: HACK_A, name: "meow", maxMembers: 4 as const };
      const results = await Promise.allSettled([
        caller.team.createTeam(input),
        caller.team.createTeam(input),
      ]);

      expect(created).toBe(1);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(String((rejected[0] as PromiseRejectedResult)?.reason)).toMatch(
        /already in a team/,
      );
    });
  });

  // =====================================================================
  describe("6. Registration under contention", () => {
    // BUG: the duplicate guard at registration.ts:95-108 is an unlocked
    // findFirst; the unique_participant_per_hackathon violation that follows is
    // not a TRPCError, so registration.ts:182 rethrows it as a 500.
    it("reports a double-submitted registration form as already registered", async () => {
      mockFindFirst.mockImplementation((table) =>
        table === "hackathons" ? runningHackathon(-24) : undefined,
      );
      mockInsert.mockImplementation(() => {
        throw new Error(
          'duplicate key value violates unique constraint "unique_participant_per_hackathon"',
        );
      });

      await expect(
        callerFor("user_a").hackathon.register(registrationInput()),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringMatching(/already registered/),
      });
    });

    // BUG: registration.ts:110-118 reads currentParticipants with a plain
    // findFirst and increments at :173 — two racers both see 499/500.
    it("admits only one of two racing registrations into the last seat", async () => {
      const hackathonRow = runningHackathon(-24, {
        maxParticipants: 500,
        currentParticipants: 499,
      });
      mockFindFirst.mockImplementation((table) =>
        table === "hackathons" ? { ...hackathonRow } : undefined,
      );
      mockInsert.mockReturnValue([{ id: PARTICIPANT_A }]);
      mockUpdate.mockImplementation((_op, updateArgs) => {
        // Stands in for sql`currentParticipants + 1`, including the rollback:
        // the loser of the race claims a seat and then hands it straight back
        // when the re-read shows it went over.
        if (updateArgs[0] === hackathons) {
          hackathonRow.currentParticipants += 1;
          __onRollback(() => {
            hackathonRow.currentParticipants -= 1;
          });
        }
        return [];
      });

      const results = await Promise.allSettled([
        callerFor("user_a").hackathon.register(registrationInput()),
        callerFor("user_b").hackathon.register(registrationInput()),
      ]);

      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(String((rejected[0] as PromiseRejectedResult)?.reason)).toMatch(
        /full/,
      );
      expect(hackathonRow.currentParticipants).toBe(500);
    });

    // BUG: registration.ts:178 calls deletePattern("hackathon*") inside the
    // transaction, wiping every hackathon-namespaced key for every user.
    it("evicts only the caches its own registration changed", async () => {
      mockFindFirst.mockImplementation((table) =>
        table === "hackathons" ? runningHackathon(-24) : undefined,
      );
      mockInsert.mockReturnValue([{ id: PARTICIPANT_A }]);
      cache.set("hackathons:list", ["cached"], 60);
      cache.set("hackathon:registrations:other_user", ["cached"], 60);

      await callerFor("user_a").hackathon.register(registrationInput());

      expect(cache.get("hackathons:list")).not.toBeNull();
      expect(cache.get("hackathon:registrations:other_user")).not.toBeNull();
    });

    // BUG: currentParticipants is only ever incremented (one write in the whole
    // router tree, registration.ts:173). Rejected applicants hold a seat forever
    // and there is no withdraw/cancelRegistration procedure at all.
    it("frees a seat when an admin rejects a participant", async () => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins")
          return { userId: "admin_user_id", isActive: true, role: "admin" };
        if (table === "hackathonParticipants")
          return {
            id: PARTICIPANT_A,
            hackathonId: HACK_A,
            registrationStatus: "pending",
          };
        return undefined;
      });

      await callerFor("admin_user_id").hackathon.updateParticipantStatus({
        hackathonId: HACK_A,
        participantId: PARTICIPANT_A,
        status: "rejected",
      });

      expect(updatedTables()).toContain(hackathons);
    });

    // BUG: registration.ts:222-239 is a publicProcedure whose column allow-list
    // includes registrationStatus, and the query has no limit.
    it("hides who was rejected from the public roster", async () => {
      mockFindMany.mockReturnValue([]);

      await callerFor().hackathon.participants({ hackathonId: HACK_A });

      const cfg = mockFindMany.mock.calls.find(
        (c) => c[0] === "hackathonParticipants",
      )?.[1];
      expect(cfg.columns.registrationStatus).toBeFalsy();
      expect(cfg.limit).toBeDefined();
    });
  });

  // =====================================================================
  describe("7. Membership status arithmetic", () => {
    const memberCaller = (member: Record<string, any> | undefined) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return { id: HACK_A };
        if (table === "members") return member;
        return undefined;
      });
      return callerFor("user_a");
    };

    it("reports an expired membership as a member whose days remaining went negative", async () => {
      const caller = memberCaller({
        id: "member_1",
        isActive: true,
        memberType: "new",
        renewalCount: 0,
        membershipEndDate: new Date(Date.now() - 2 * DAY),
      });

      const res = await caller.member.checkStatus();
      expect(res.isMember).toBe(true);
      expect(res.isActive).toBe(false);
      expect(res.daysRemaining).toBeLessThan(0);
    });

    // BUG: member.ts:435 `member.isActive && expiresAt && expiresAt > now`
    // returns the literal null (not false) when membershipEndDate is null.
    it("reports a membership with no end date as inactive, as a real boolean", async () => {
      const caller = memberCaller({
        id: "member_1",
        isActive: true,
        memberType: "new",
        renewalCount: 0,
        membershipEndDate: null,
      });

      const res = await caller.member.checkStatus();
      expect(res.isActive).toBe(false);
      expect(res.daysRemaining).toBeNull();
    });

    // BUG: getHackathonId (member.ts:20-27) resolves the default hackathon by
    // `orderBy desc(startDate)` with no status or date filter, so a future draft
    // hijacks every member lookup the moment staff create next year's event.
    it("resolves the hackathon in progress, not next year's draft", async () => {
      const catalogue = [
        { id: HACK_A, status: "open", startDate: new Date(Date.now() - DAY) },
        {
          id: HACK_NEXT,
          status: "draft",
          startDate: new Date(Date.now() + 300 * DAY),
        },
      ];
      mockFindFirst.mockImplementation((table, args) => {
        if (table === "hackathons") {
          if (args?.orderBy)
            return [...catalogue].sort(
              (a, b) => b.startDate.getTime() - a.startDate.getTime(),
            )[0];
          return catalogue[0];
        }
        if (table === "members")
          return {
            id: "member_1",
            hackathonId: HACK_A,
            isActive: true,
            memberType: "continuous",
            renewalCount: 1,
            membershipEndDate: new Date(Date.now() + 100 * DAY),
          };
        return undefined;
      });

      const res = await callerFor("user_a").member.checkStatus();

      expect(res.isMember).toBe(true);
      // The cache key records which hackathon the lookup actually targeted.
      expect(cache.get(`member:status:user_a:${HACK_A}`)).not.toBeNull();
    });
  });

  // =====================================================================
  describe("8. Membership writes", () => {
    const existingMember = {
      id: "member_1",
      userId: "user_a",
      hackathonId: HACK_A,
      isActive: true,
      memberType: "new" as const,
      renewalCount: 0,
      // Expiring within the year. That is the whole population with a reason to
      // renew, and the one a naive "already covered a year out" guard waves
      // through a second time. A fixed calendar date would also make this test
      // read differently either side of UTC.
      membershipEndDate: new Date(Date.now() + 180 * DAY),
    };

    // BUG: member.ts:98-134 writes the member row and its history row in two
    // unrelated statements — no db.transaction, unlike every other mutation.
    it("commits a new member and its audit row together", async () => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return { id: HACK_A };
        return undefined;
      });
      mockInsert.mockImplementation((_op, insertArgs) => {
        if (insertArgs[0] === membershipHistory)
          throw new Error("history insert failed");
        return [{ id: "member_1" }];
      });

      await expect(
        callerFor("user_a").member.register({
          firstName: "Ada",
          lastName: "Lovelace",
        }),
      ).rejects.toThrow();
      // `db` is typed DrizzleDB | null (client.ts leaves it null without
      // DATABASE_URL); the vi.mock factory always supplies an object here.
      expect(db!.transaction).toHaveBeenCalled();
    });

    // BUG: nameSchema (member.ts:9-13) is /^[a-zA-Z\s'-]+$/, so any accented or
    // non-Latin name is a hard BAD_REQUEST — while hackathon.register (which the
    // same person already passed) puts no such restriction on firstName.
    it.each(["José", "Nguyễn", "O’Brien"])(
      "lets %s become a member, exactly as hackathon registration already does",
      async (firstName) => {
        mockFindFirst.mockImplementation((table) =>
          table === "hackathons" ? { id: HACK_A } : undefined,
        );
        mockInsert.mockReturnValue([{ id: "member_1", firstName }]);

        await expect(
          callerFor("user_a").member.register({ firstName, lastName: "Tan" }),
        ).resolves.toMatchObject({ firstName });
      },
    );
  });

  // =====================================================================
  describe("9. Input sanitisation reaches the resolver", () => {
    const teamCaller = () => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return runningHackathon(20);
        if (table === "hackathonParticipants")
          return {
            id: PARTICIPANT_A,
            hackathonId: HACK_A,
            userId: "user_a",
            teamId: null,
            registrationStatus: "approved",
          };
        return undefined;
      });
      mockInsert.mockReturnValue([{ id: TEAM_A, name: "meow" }]);
      return callerFor("user_a");
    };

    it("rejects a javascript: payload before the resolver ever runs", async () => {
      const caller = teamCaller();

      await expect(
        caller.team.createTeam({
          hackathonId: HACK_A,
          name: "meow",
          description: "javascript:alert(1)",
          maxMembers: 4,
        }),
      ).rejects.toThrow(/Invalid input/);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    // BUG: trpc.ts:76 calls `sanitizeInput(rawInput);` and throws the return
    // value away, then calls next() with the untouched input. sanitizeInput is
    // pure, so stripping never reaches the resolver; and because the injection
    // check runs on the already-stripped copy, "<script>alert(1)</script>"
    // sanitizes to "" (no throw) while the raw tags are written verbatim.
    it("never lets raw script markup reach the insert", async () => {
      const caller = teamCaller();

      await caller.team
        .createTeam({
          hackathonId: HACK_A,
          name: "<script>alert(1)</script>",
          description: "<img src=x>Totally fine description",
          maxMembers: 4,
        })
        .catch(() => undefined);

      const values = insertedInto(hackathonTeams)[0]?.[2]?.[0];
      expect(values?.name ?? "").not.toMatch(/<script/i);
      expect(values?.description ?? "").not.toMatch(/<img/i);
    });
  });

  // =====================================================================
  describe("10. Post-mutation freshness", () => {
    // BUG: no team.* path is in CACHE_INVALIDATION_MAP, so the middleware falls
    // back to deletePattern("team:*") — and no cache key in the codebase starts
    // with "team:". myRegistrations (hackathon:registrations:<userId>) and the
    // participant roster keep serving the pre-join state.
    it("shows the new team on the participant's next dashboard load", async () => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return runningHackathon(20);
        if (table === "hackathonParticipants")
          return {
            id: PARTICIPANT_A,
            hackathonId: HACK_A,
            userId: "user_a",
            teamId: null,
            registrationStatus: "approved",
          };
        if (table === "hackathonTeams")
          return {
            id: TEAM_A,
            hackathonId: HACK_A,
            captainId: "captain_user",
            currentMembers: 1,
            maxMembers: 4,
            isOpen: true,
          };
        return undefined;
      });
      cache.set("hackathon:registrations:user_a", [{ teamId: null }], 30);
      cache.set(`hackathon:${HACK_A}:participants`, [{ teamId: null }], 60);

      await callerFor("user_a").team.joinTeam({
        hackathonId: HACK_A,
        teamId: TEAM_A,
      });

      expect(cache.get("hackathon:registrations:user_a")).toBeNull();
      expect(cache.get(`hackathon:${HACK_A}:participants`)).toBeNull();
    });
  });

  // =====================================================================
  describe("11. Profile updates", () => {
    // BUG: z.string().url() is backed by new URL(), which accepts any scheme, so
    // a data: URI bypasses the whole magic-byte pipeline updateProfileImage
    // exists for (user.ts:128-191). Separately, updateProfile({}) builds an
    // empty ops array (user.ts:88-121) and reports success having written
    // nothing.
    it("rejects a non-http image URL and refuses an empty update", async () => {
      const caller = callerFor("user_a");
      mockUpdate.mockReturnValue([]);
      mockInsert.mockReturnValue([]);

      await expect(
        caller.user.updateProfile({
          image: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        }),
      ).rejects.toThrow();

      await expect(caller.user.updateProfile({})).rejects.toThrow();
    });
  });
});
