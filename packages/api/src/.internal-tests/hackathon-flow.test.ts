import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { db } from "@query/db";

// Fully mock the DB at the file level. vi.mock factories are hoisted and
// file-scoped, so this mirrors the shape used by routers.test.ts.
const mockFindFirst = vi.fn();
/** Rows a bare `await select().from().where()` resolves to. */
const mockWhereRows = vi.fn<() => unknown[]>(() => [{ n: 1 }]);
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
            // Awaited directly: a count such as the judging queue check.
            then: (ok: any, err: any) =>
              Promise.resolve(mockWhereRows()).then(ok, err),
            orderBy: vi.fn().mockResolvedValue([{ count: 0 }]),
            groupBy: vi.fn().mockResolvedValue([]),
            limit: vi.fn().mockResolvedValue([]),
            offset: vi.fn().mockResolvedValue([]),
            // Row locks. The only locked read in these flows is the team row
            // leave/disband take, answered from the same wiring as findFirst.
            for: vi.fn().mockImplementation(async () => {
              const team = mockFindFirst("hackathonTeams");
              return team ? [team] : [];
            }),
          })),
          orderBy: vi.fn().mockResolvedValue([{ count: 0 }]),
          groupBy: vi.fn().mockResolvedValue([]),
          innerJoin: vi.fn().mockImplementation(() => ({
            // Awaited directly: judging dispatch reads every vote this way.
            then: (ok: any, err: any) =>
              Promise.resolve(mockWhereRows()).then(ok, err),
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
    whyAttend: "I want to build with data.",
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

    // Capacity caps acceptances, not applications: a full house still takes
    // applications, and the seat is enforced when an organiser accepts.
    it("takes an application when every seat is already taken", async () => {
      mockFindFirst.mockImplementation((table) =>
        table === "hackathons"
          ? openHackathon({ maxParticipants: 500, currentParticipants: 500 })
          : undefined,
      );
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      const outcome = await caller.hackathon
        .register(registrationInput())
        .catch((error: unknown) => error);
      expect(String((outcome as Error)?.message ?? "")).not.toMatch(/full/);
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
          return (
            participant ?? {
              id: PARTICIPANT,
              teamId: null,
              registrationStatus: "checked_in",
            }
          );
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

    // Accepted hackers can find teammates before kickoff.
    it("allows team creation before hacking starts", async () => {
      const caller = teamCaller(-48);
      mockInsert.mockReturnValue([{ id: "team_1", name: "meow" }]);

      await expect(caller.team.createTeam(newTeam)).resolves.toMatchObject({
        name: "meow",
      });
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

    // Teams form from acceptance, not from +12h: two hours in, an accepted
    // hacker can already create, join and leave.
    it("reports the window so the UI can disable instead of failing", async () => {
      const caller = teamCaller(2);

      const res = await caller.team.window({ hackathonId: HACK_A });
      expect(res).toMatchObject({
        isOpen: true,
        canCreate: true,
        canJoin: true,
        canLeave: true,
        opensAt: null,
      });
      expect(res.closesAt.getTime() - res.leaveLocksAt.getTime()).toBe(
        10 * HOUR,
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
          return (
            opts.participant ?? {
              id: PARTICIPANT,
              teamId: null,
              registrationStatus: "approved",
            }
          );
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
        participant: {
          id: PARTICIPANT,
          teamId: "team_existing",
          registrationStatus: "approved",
        },
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
          // Submitting requires the badge scan — see checkCheckedIn.
          return {
            id: PARTICIPANT,
            teamId: "team_1",
            registrationStatus: "checked_in",
          };
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
  describe("9. Portal links resolve", () => {
    const bloom = () =>
      openHackathon({ name: "Hacklytics: Digital Bloom", status: "announced" });

    it("opens an edition from the slug the portal links with", async () => {
      // Nothing is named "hacklytics-digital-bloom", so the name lookup misses
      // and the slug pass has to find it.
      mockFindFirst.mockImplementation(() => undefined);
      mockFindMany.mockImplementation((table) =>
        table === "hackathons" ? [bloom()] : [],
      );
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      const res = await caller.hackathon.getById({
        id: "hacklytics-digital-bloom",
      });
      expect(res.id).toBe(HACK_A);
    });

    it("still opens it from the exact name, without scanning", async () => {
      mockFindFirst.mockImplementation((table) =>
        table === "hackathons" ? bloom() : undefined,
      );
      mockFindMany.mockReturnValue([]);
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      const res = await caller.hackathon.getById({
        id: "Hacklytics: Digital Bloom",
      });
      expect(res.id).toBe(HACK_A);
      expect(mockFindMany).not.toHaveBeenCalledWith(
        "hackathons",
        expect.anything(),
      );
    });

    it("opens an edition from a percent-encoded name (old admin dashboard links)", async () => {
      // `/admin/hackathons/${encodeURIComponent(name)}` used to put
      // "Hacklytics%3A%20Digital%20Bloom" in the path. That string is not the
      // stored name, and slugging it produces "hacklytics-3a-20digital-20bloom".
      mockFindFirst.mockImplementation(() => undefined);
      mockFindMany.mockImplementation((table) =>
        table === "hackathons" ? [bloom()] : [],
      );
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      const res = await caller.hackathon.getById({
        id: encodeURIComponent("Hacklytics: Digital Bloom"),
      });
      expect(res.id).toBe(HACK_A);
    });

    it("404s on a slug matching no edition", async () => {
      mockFindFirst.mockImplementation(() => undefined);
      mockFindMany.mockImplementation((table) =>
        table === "hackathons" ? [bloom()] : [],
      );
      const caller = appRouter.createCaller(createMockCtx("user_a"));

      await expect(
        caller.hackathon.getById({ id: "hacklytics-2019" }),
      ).rejects.toThrow(/not found/i);
    });
  });
});
