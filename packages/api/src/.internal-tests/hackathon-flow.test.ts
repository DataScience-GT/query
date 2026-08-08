import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db } from "@query/db";

// Fully mock the DB at the file level. vi.mock factories are hoisted and
// file-scoped, so this mirrors the shape used by routers.test.ts.
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@query/db", () => {
  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: (...args: any[]) => mockFindMany(name, ...args),
  });

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
    hackathonProjects: { id: "id", hackathonId: "hackathon_id" },
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
    judges: { id: "id", userId: "user_id", hackathonId: "hackathon_id", isActive: "is_active" },
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

const HACK_A = "11111111-1111-4111-8111-111111111111";
const HACK_B = "22222222-2222-4222-8222-222222222222";
const PARTICIPANT = "33333333-3333-4333-8333-333333333333";
const EVENT_A = "44444444-4444-4444-8444-444444444444";
const EVENT_B = "55555555-5555-4555-8555-555555555555";
const PROJECT = "66666666-6666-4666-8666-666666666666";

const DAY = 24 * 60 * 60 * 1000;

describe("Hackathon end-to-end flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
  });

  const createMockCtx = (userId?: string) =>
    ({
      db,
      session: userId ? { user: { id: userId } } : null,
      userId: userId || undefined,
      cache,
      clientIp: "127.0.0.1",
      req: { headers: { get: () => null } },
    }) as any;

  const adminCaller = () => {
    mockFindFirst.mockImplementation((table) =>
      table === "admins"
        ? { userId: "admin_user_id", isActive: true, role: "admin" }
        : undefined,
    );
    return appRouter.createCaller(createMockCtx("admin_user_id"));
  };

  /** An open hackathon with room and a deadline that has not passed. */
  const openHackathon = (overrides: Record<string, unknown> = {}) => ({
    id: HACK_A,
    name: "Data for Good",
    status: "open",
    startDate: new Date(Date.now() + 7 * DAY),
    endDate: new Date(Date.now() + 9 * DAY),
    registrationDeadline: new Date(Date.now() + 5 * DAY),
    maxParticipants: 500,
    currentParticipants: 10,
    ...overrides,
  });

  const registrationInput = (hackathonId = HACK_A) => ({
    hackathonId,
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
  });

  // ---------------------------------------------------------------------
  describe("1. Registration opens and closes", () => {
    it("rejects registration while the hackathon is still a draft", async () => {
      mockFindFirst.mockImplementation((table) =>
        table === "hackathons" ? openHackathon({ status: "draft" }) : undefined,
      );
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      await expect(caller.hackathon.register(registrationInput())).rejects.toThrow(
        /Registration is not open/,
      );
    });

    it("lets an admin flip the hackathon to open", async () => {
      const caller = adminCaller();
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins")
          return { userId: "admin_user_id", isActive: true, role: "admin" };
        if (table === "hackathons") return openHackathon({ status: "draft" });
        return undefined;
      });
      mockUpdate.mockReturnValue([{ id: HACK_A, status: "open" }]);

      const res = await caller.hackathon.update({ id: HACK_A, status: "open" });
      expect(res).toMatchObject({ status: "open" });
    });

    it("accepts a registration once open, defaulting to pending", async () => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return openHackathon();
        return undefined; // no existing participant, no member record
      });
      mockInsert.mockReturnValue([
        { id: PARTICIPANT, registrationStatus: "pending" },
      ]);
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      const res = await caller.hackathon.register(registrationInput());
      expect(res).toMatchObject({ registrationStatus: "pending" });
    });

    it("rejects a second registration from the same user", async () => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return openHackathon();
        if (table === "hackathonParticipants") return { id: PARTICIPANT };
        return undefined;
      });
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      await expect(caller.hackathon.register(registrationInput())).rejects.toThrow(
        /already registered/,
      );
    });

    it("rejects registration after the deadline has passed", async () => {
      mockFindFirst.mockImplementation((table) =>
        table === "hackathons"
          ? openHackathon({
              registrationDeadline: new Date(Date.now() - DAY),
            })
          : undefined,
      );
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      await expect(caller.hackathon.register(registrationInput())).rejects.toThrow(
        /deadline has passed/,
      );
    });

    it("rejects registration when the hackathon is at capacity", async () => {
      mockFindFirst.mockImplementation((table) =>
        table === "hackathons"
          ? openHackathon({ maxParticipants: 500, currentParticipants: 500 })
          : undefined,
      );
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      await expect(caller.hackathon.register(registrationInput())).rejects.toThrow(
        /full/,
      );
    });
  });

  // ---------------------------------------------------------------------
  describe("2. Acceptance gates the event pass", () => {
    const scanAs = (registrationStatus: string) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins")
          return { userId: "admin_user_id", isActive: true, role: "admin" };
        if (table === "hackathonParticipants")
          return {
            id: PARTICIPANT,
            hackathonId: HACK_A,
            registrationStatus,
            user: { name: "Ada Lovelace", email: "ada@example.com" },
          };
        if (table === "hackathonEvents")
          return { id: EVENT_A, hackathonId: HACK_A, name: "Opening Ceremony" };
        if (table === "hackathonEventAttendees") return undefined;
        return undefined;
      });
      return appRouter.createCaller(createMockCtx("admin_user_id"));
    };

    it.each(["pending", "waitlisted", "rejected"])(
      "refuses to check in a %s participant",
      async (status) => {
        const caller = scanAs(status);

        await expect(
          caller.hackathon.scanParticipantPass({
            hackathonId: HACK_A,
            eventId: EVENT_A,
            participantId: PARTICIPANT,
          }),
        ).rejects.toThrow(/not accepted for this hackathon/);
      },
    );

    it.each(["approved", "checked_in"])(
      "checks in an %s participant",
      async (status) => {
        const caller = scanAs(status);

        const res = await caller.hackathon.scanParticipantPass({
          hackathonId: HACK_A,
          eventId: EVENT_A,
          participantId: PARTICIPANT,
        });
        expect(res.success).toBe(true);
      },
    );

    it("names the offending status in the error so staff can act on it", async () => {
      const caller = scanAs("waitlisted");

      await expect(
        caller.hackathon.scanParticipantPass({
          hackathonId: HACK_A,
          eventId: EVENT_A,
          participantId: PARTICIPANT,
        }),
      ).rejects.toThrow(/waitlisted/);
    });
  });

  // ---------------------------------------------------------------------
  describe("3. Check-in across multiple events", () => {
    const scanner = (opts: {
      event: { id: string; hackathonId: string; name: string } | undefined;
      alreadyAttended: boolean;
      participantHackathon?: string;
    }) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins")
          return { userId: "admin_user_id", isActive: true, role: "admin" };
        if (table === "hackathonParticipants")
          return {
            id: PARTICIPANT,
            hackathonId: opts.participantHackathon ?? HACK_A,
            registrationStatus: "approved",
            user: { name: "Ada Lovelace", email: "ada@example.com" },
          };
        if (table === "hackathonEvents") return opts.event;
        if (table === "hackathonEventAttendees")
          return opts.alreadyAttended ? { eventId: EVENT_A } : undefined;
        return undefined;
      });
      return appRouter.createCaller(createMockCtx("admin_user_id"));
    };

    it("checks an approved participant into the first event", async () => {
      const caller = scanner({
        event: { id: EVENT_A, hackathonId: HACK_A, name: "Opening Ceremony" },
        alreadyAttended: false,
      });

      const res = await caller.hackathon.scanParticipantPass({
        hackathonId: HACK_A,
        eventId: EVENT_A,
        participantId: PARTICIPANT,
      });
      expect(res.success).toBe(true);
    });

    it("rejects a duplicate scan into the same event", async () => {
      const caller = scanner({
        event: { id: EVENT_A, hackathonId: HACK_A, name: "Opening Ceremony" },
        alreadyAttended: true,
      });

      await expect(
        caller.hackathon.scanParticipantPass({
          hackathonId: HACK_A,
          eventId: EVENT_A,
          participantId: PARTICIPANT,
        }),
      ).rejects.toThrow(/already checked into/);
    });

    it("allows the same participant into a second, different event", async () => {
      const caller = scanner({
        event: { id: EVENT_B, hackathonId: HACK_A, name: "Midnight Snack" },
        alreadyAttended: false,
      });

      const res = await caller.hackathon.scanParticipantPass({
        hackathonId: HACK_A,
        eventId: EVENT_B,
        participantId: PARTICIPANT,
      });
      expect(res.success).toBe(true);
    });

    it("rejects an event that belongs to a different hackathon", async () => {
      const caller = scanner({ event: undefined, alreadyAttended: false });

      await expect(
        caller.hackathon.scanParticipantPass({
          hackathonId: HACK_B,
          eventId: EVENT_A,
          participantId: PARTICIPANT,
        }),
      ).rejects.toThrow(/Event not found/);
    });

    // Scanning is the one action volunteers may take, so it is gated on
    // holding any active admins row rather than on being full staff. An
    // ordinary participant still has none and is still refused.
    it("requires event staff to scan a pass", async () => {
      mockFindFirst.mockImplementation(() => undefined); // no admins row at all
      const caller = appRouter.createCaller(createMockCtx("random_user"));

      await expect(
        caller.hackathon.scanParticipantPass({
          hackathonId: HACK_A,
          eventId: EVENT_A,
          participantId: PARTICIPANT,
        }),
      ).rejects.toThrow(/Event staff access required/);
    });
  });

  // ---------------------------------------------------------------------
  describe("4. Judges grade projects", () => {
    const judgeCaller = () => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "judgingProjects")
          return { id: PROJECT, hackathonId: HACK_A };
        if (table === "judges")
          return { id: "judge_1", userId: "judge_user", hackathonId: HACK_A };
        // The project was routed to this judge, which is the ordinary case
        // these tests are about; scoring something never assigned to you is
        // covered separately in judge-edge.
        if (table === "judgeQueue")
          return { id: "queue_1", judgeId: "judge_1", projectId: PROJECT };
        return undefined;
      });
      return appRouter.createCaller(createMockCtx("judge_user"));
    };

    const scores = {
      projectId: PROJECT,
      scoreCreativity: 8,
      scoreImpact: 7,
      scoreScope: 6,
      scoreClarity: 9,
      scoreSoundness: 5,
    };

    it("records a vote and sums the five criteria", async () => {
      const caller = judgeCaller();
      mockInsert.mockReturnValue([{ id: "vote_1", score: 35 }]);

      const res = await caller.judge.submitVote(scores);

      expect(res).toMatchObject({ score: 35 });
      const inserted = mockInsert.mock.calls[0]?.[2]?.[0];
      expect(inserted.score).toBe(35);
      expect(inserted.judgeId).toBe("judge_1");
    });

    it("refuses a vote from a user who is not a judge for that hackathon", async () => {
      mockFindFirst.mockImplementation((table) =>
        table === "judgingProjects"
          ? { id: PROJECT, hackathonId: HACK_A }
          : undefined,
      );
      const caller = appRouter.createCaller(createMockCtx("random_user"));

      await expect(caller.judge.submitVote(scores)).rejects.toThrow(
        /Judge access required/,
      );
    });

    it.each([0, 11])("rejects an out-of-range score of %i", async (bad) => {
      const caller = judgeCaller();

      await expect(
        caller.judge.submitVote({ ...scores, scoreImpact: bad }),
      ).rejects.toThrow();
    });

    it("only lets an admin toggle judging on", async () => {
      const caller = adminCaller();
      mockUpdate.mockReturnValue([{ judgingActive: true }]);

      const res = await caller.judge.toggleJudging({
        hackathonId: HACK_A,
        active: true,
      });
      expect(res).toMatchObject({ success: true, judgingActive: true });
    });

    it("refuses to let a non-admin toggle judging", async () => {
      mockFindFirst.mockImplementation(() => undefined);
      const caller = appRouter.createCaller(createMockCtx("random_user"));

      await expect(
        caller.judge.toggleJudging({ hackathonId: HACK_A, active: true }),
      ).rejects.toThrow(/Admin access required/);
    });
  });

  // ---------------------------------------------------------------------
  describe("5. Team window", () => {
    const HOUR = 60 * 60 * 1000;

    /**
     * Places "now" a given number of hours after the hacking start by moving
     * the hackathon's start time, which is what the window is measured from.
     */
    const hackathonStartedHoursAgo = (hours: number) => ({
      id: HACK_A,
      status: "open",
      startDate: new Date(Date.now() - hours * HOUR),
      endDate: new Date(Date.now() + 24 * HOUR),
      hackingStartTime: new Date(Date.now() - hours * HOUR),
    });

    const teamCaller = (hoursIn: number, participant?: Record<string, any>) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return hackathonStartedHoursAgo(hoursIn);
        if (table === "hackathonParticipants")
          return participant ?? { id: PARTICIPANT, teamId: null };
        if (table === "hackathonTeams")
          return {
            id: "team_1",
            captainId: "other_user",
            currentMembers: 3,
          };
        return undefined;
      });
      return appRouter.createCaller(createMockCtx("user_a"));
    };

    const newTeam = {
      hackathonId: HACK_A,
      name: "meow",
      maxMembers: 4 as const,
    };

    it("refuses team creation before the window opens at +12h", async () => {
      const caller = teamCaller(2);

      await expect(caller.team.createTeam(newTeam)).rejects.toThrow(
        /not open yet/,
      );
    });

    it("allows team creation inside the window", async () => {
      const caller = teamCaller(20);
      mockInsert.mockReturnValue([{ id: "team_1", name: "meow" }]);

      const res = await caller.team.createTeam(newTeam);
      expect(res).toMatchObject({ name: "meow" });
    });

    it("refuses team creation after the window closes at +34h", async () => {
      const caller = teamCaller(40);

      await expect(caller.team.createTeam(newTeam)).rejects.toThrow(/closed/);
    });

    it("lets a member leave before the roster locks at +24h", async () => {
      const caller = teamCaller(20, { id: PARTICIPANT, teamId: "team_1" });

      const res = await caller.team.leaveTeam({ hackathonId: HACK_A });
      expect(res).toMatchObject({ success: true });
    });

    it("refuses to let a member leave inside the final 12 hours", async () => {
      const caller = teamCaller(30, { id: PARTICIPANT, teamId: "team_1" });

      await expect(
        caller.team.leaveTeam({ hackathonId: HACK_A }),
      ).rejects.toThrow(/within 12 hours of the project deadline/);
    });

    it("still allows joining after the leave lock, up to +34h", async () => {
      const caller = teamCaller(30);

      const res = await caller.team.window({ hackathonId: HACK_A });
      expect(res.canJoin).toBe(true);
      expect(res.canLeave).toBe(false);
    });

    it("reports the window so the UI can disable instead of failing", async () => {
      const caller = teamCaller(2);

      const res = await caller.team.window({ hackathonId: HACK_A });
      expect(res).toMatchObject({
        isOpen: false,
        canCreate: false,
        canJoin: false,
        canLeave: false,
      });
      expect(res.leaveLocksAt.getTime() - res.opensAt.getTime()).toBe(
        12 * HOUR,
      );
    });
  });

  // ---------------------------------------------------------------------
  describe("6. Joining a team", () => {
    const HOUR = 60 * 60 * 1000;

    const joinCaller = (opts: {
      participant?: Record<string, any>;
      team?: Record<string, any>;
    }) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons")
          return {
            id: HACK_A,
            startDate: new Date(Date.now() - 20 * HOUR),
            endDate: new Date(Date.now() + 24 * HOUR),
            hackingStartTime: new Date(Date.now() - 20 * HOUR),
          };
        if (table === "hackathonParticipants")
          return opts.participant ?? { id: PARTICIPANT, teamId: null };
        if (table === "hackathonTeams")
          return (
            opts.team ?? {
              id: "team_1",
              hackathonId: HACK_A,
              isOpen: true,
              currentMembers: 2,
              maxMembers: 4,
            }
          );
        return undefined;
      });
      return appRouter.createCaller(createMockCtx("user_a"));
    };

    const join = { hackathonId: HACK_A, teamId: "77777777-7777-4777-8777-777777777777" };

    it("lets a registered participant join a team with room", async () => {
      const caller = joinCaller({});

      const res = await caller.team.joinTeam(join);
      expect(res).toMatchObject({ success: true });
    });

    it("refuses to let someone join two teams", async () => {
      const caller = joinCaller({
        participant: { id: PARTICIPANT, teamId: "team_existing" },
      });

      await expect(caller.team.joinTeam(join)).rejects.toThrow(
        /already in a team/,
      );
    });

    it("refuses to overfill a team at capacity", async () => {
      const caller = joinCaller({
        team: {
          id: "team_1",
          hackathonId: HACK_A,
          isOpen: true,
          currentMembers: 4,
          maxMembers: 4,
        },
      });

      await expect(caller.team.joinTeam(join)).rejects.toThrow(/full/);
    });

    it("refuses to join a closed team", async () => {
      const caller = joinCaller({
        team: {
          id: "team_1",
          hackathonId: HACK_A,
          isOpen: false,
          currentMembers: 1,
          maxMembers: 4,
        },
      });

      await expect(caller.team.joinTeam(join)).rejects.toThrow(/closed/);
    });

    it("refuses an unregistered user", async () => {
      const caller = joinCaller({ participant: null as any });
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons")
          return {
            id: HACK_A,
            startDate: new Date(Date.now() - 20 * HOUR),
            endDate: new Date(Date.now() + 24 * HOUR),
            hackingStartTime: new Date(Date.now() - 20 * HOUR),
          };
        return undefined;
      });

      await expect(caller.team.joinTeam(join)).rejects.toThrow(
        /not registered/,
      );
    });
  });

  // ---------------------------------------------------------------------
  describe("7. Project submission window", () => {
    const HOUR = 60 * 60 * 1000;

    const submitCaller = (hoursIn: number, existingProject = false) => {
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons")
          return {
            id: HACK_A,
            startDate: new Date(Date.now() - hoursIn * HOUR),
            endDate: new Date(Date.now() + 24 * HOUR),
            hackingStartTime: new Date(Date.now() - hoursIn * HOUR),
          };
        if (table === "hackathonParticipants")
          return { id: PARTICIPANT, teamId: "team_1" };
        if (table === "hackathonProjects")
          return existingProject ? { id: "project_1" } : undefined;
        return undefined;
      });
      return appRouter.createCaller(createMockCtx("user_a"));
    };

    const project = {
      hackathonId: HACK_A,
      name: "Flood Risk Mapper",
      description: "Maps flood risk from open census and elevation data.",
    };

    it("refuses submission before it opens at +12h", async () => {
      const caller = submitCaller(2);

      await expect(caller.team.submitProject(project)).rejects.toThrow(
        /not open yet/,
      );
    });

    it("refuses submission after the +36h hard deadline", async () => {
      const caller = submitCaller(40);

      await expect(caller.team.submitProject(project)).rejects.toThrow(
        /submission closed/i,
      );
    });

    it("refuses edits to an existing project after the +34h freeze", async () => {
      const caller = submitCaller(35, true);

      await expect(
        caller.team.submitProject({
          ...project,
          teamId: "88888888-8888-4888-8888-888888888888",
        }),
      ).rejects.toThrow(/edits are closed/i);
    });

    it("rejects a description shorter than 10 characters", async () => {
      const caller = submitCaller(20);

      await expect(
        caller.team.submitProject({ ...project, description: "too short" }),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------
  describe("8. Judge queue", () => {
    const QUEUE_A = "99999999-9999-4999-8999-999999999999";

    /**
     * `isJudge` resolves the hackathon from the input. When the input carries a
     * projectId it looks up judgingProjects; when it only carries a queueId it
     * burns the first judgeQueue lookup. `middlewareHitsQueue` accounts for it.
     */
    const queueCaller = (opts: {
      queueItem?: Record<string, any> | undefined;
      next?: Record<string, any> | undefined;
      middlewareHitsQueue?: boolean;
    }) => {
      const skip = opts.middlewareHitsQueue ? 1 : 0;
      let queueLookups = 0;
      mockFindFirst.mockImplementation((table) => {
        if (table === "judgingProjects")
          return { id: PROJECT, hackathonId: HACK_A };
        if (table === "judges")
          return { id: "judge_1", userId: "judge_user", hackathonId: HACK_A };
        if (table === "hackathons") return { id: HACK_A };
        if (table === "judgeQueue") {
          queueLookups += 1;
          // judge_queue.project_id is NOT NULL, so a slot always names the
          // project it covers. Defaulted here (overridable per test) because
          // completeAndNext checks the slot against the project being scored.
          if (skip && queueLookups === 1)
            return { id: QUEUE_A, hackathonId: HACK_A, projectId: PROJECT };
          if (queueLookups === skip + 1)
            return opts.queueItem && { projectId: PROJECT, ...opts.queueItem };
          return opts.next;
        }
        if (table === "judgeAssignments") return undefined;
        return undefined;
      });
      return appRouter.createCaller(createMockCtx("judge_user"));
    };

    const vote = {
      queueId: QUEUE_A,
      projectId: PROJECT,
      scoreCreativity: 5,
      scoreImpact: 5,
      scoreScope: 5,
      scoreClarity: 5,
      scoreSoundness: 5,
    };

    it("completes the current project and hands back the next one", async () => {
      const caller = queueCaller({
        queueItem: { id: QUEUE_A, hackathonId: HACK_A },
        next: {
          id: "queue_b",
          hackathonId: HACK_A,
          project: { id: "project_b", name: "Next Project" },
        },
      });

      const res = await caller.judge.completeAndNext(vote);
      expect(res).toMatchObject({
        done: false,
        nextQueueId: "queue_b",
      });
    });

    it("reports done when nothing is left in the queue", async () => {
      const caller = queueCaller({
        queueItem: { id: QUEUE_A, hackathonId: HACK_A },
        next: undefined,
      });

      const res = await caller.judge.completeAndNext(vote);
      expect(res).toMatchObject({ done: true, nextProject: null });
    });

    it("moves a skipped project to the end and returns the next", async () => {
      const caller = queueCaller({
        middlewareHitsQueue: true,
        queueItem: { id: QUEUE_A, hackathonId: HACK_A },
        next: {
          id: "queue_b",
          hackathonId: HACK_A,
          project: { id: "project_b" },
        },
      });

      const res = await caller.judge.skipProject({ queueId: QUEUE_A });
      expect(res).toMatchObject({ skippedToEnd: false, queueId: "queue_b" });
    });

    it("cannot skip past the last remaining project", async () => {
      const caller = queueCaller({
        middlewareHitsQueue: true,
        queueItem: { id: QUEUE_A, hackathonId: HACK_A },
        next: undefined,
      });

      const res = await caller.judge.skipProject({ queueId: QUEUE_A });
      expect(res).toMatchObject({ skippedToEnd: true, queueId: QUEUE_A });
    });

    it("errors when skipping a queue item that does not exist", async () => {
      const caller = queueCaller({
        middlewareHitsQueue: true,
        queueItem: undefined,
        next: undefined,
      });

      await expect(
        caller.judge.skipProject({ queueId: QUEUE_A }),
      ).rejects.toThrow(/Queue item not found/);
    });

    it("force-skips an overtime project without recording a vote", async () => {
      const caller = queueCaller({
        middlewareHitsQueue: true,
        queueItem: {
          id: QUEUE_A,
          hackathonId: HACK_A,
          projectId: PROJECT,
          project: { id: PROJECT, tracks: [] },
        },
      });
      mockInsert.mockClear();

      await caller.judge.forceSkipOvertime({ queueId: QUEUE_A });

      // No vote row should be written for a forced skip.
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("errors when force-skipping a queue item that does not exist", async () => {
      const caller = queueCaller({
        middlewareHitsQueue: true,
        queueItem: undefined,
      });

      await expect(
        caller.judge.forceSkipOvertime({ queueId: QUEUE_A }),
      ).rejects.toThrow(/Queue item not found/);
    });
  });

  // ---------------------------------------------------------------------
  describe("9. Rankings", () => {
    it("ranks projects and normalizes across judges", async () => {
      const caller = adminCaller();
      mockFindMany.mockImplementation((table) => {
        if (table !== "judgingProjects") return [];
        return [
          {
            id: "p_low",
            name: "Low",
            hackathonId: HACK_A,
            votes: [
              { judgeId: "j1", score: 20, judge: { user: { name: "J1" } } },
              { judgeId: "j2", score: 22, judge: { user: { name: "J2" } } },
            ],
          },
          {
            id: "p_high",
            name: "High",
            hackathonId: HACK_A,
            votes: [
              { judgeId: "j1", score: 45, judge: { user: { name: "J1" } } },
              { judgeId: "j2", score: 48, judge: { user: { name: "J2" } } },
            ],
          },
        ];
      });

      const res = await caller.judge.getRankings({ hackathonId: HACK_A });

      expect(res.rankings.length).toBe(2);
      // The better-scored project must outrank the weaker one.
      const ids = res.rankings.map((r: any) => r.project.id);
      expect(ids[0]).toBe("p_high");
      expect(res.globalAvg).toBeGreaterThan(0);
    });

    it("returns an empty ranking when no projects exist", async () => {
      const caller = adminCaller();
      mockFindMany.mockReturnValue([]);

      const res = await caller.judge.getRankings({ hackathonId: HACK_A });
      expect(res).toMatchObject({
        rankings: [],
        globalAvg: 0,
        hasTies: false,
      });
    });

    it("requires admin rights to read rankings", async () => {
      mockFindFirst.mockImplementation(() => undefined);
      const caller = appRouter.createCaller(createMockCtx("random_user"));

      await expect(
        caller.judge.getRankings({ hackathonId: HACK_A }),
      ).rejects.toThrow(/Admin access required/);
    });
  });
});
