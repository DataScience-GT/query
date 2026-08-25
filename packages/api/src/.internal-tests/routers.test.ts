
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { TRPCError } from "@trpc/server";
import { cache } from "../middleware/cache";
import { db } from "@query/db";
import { errorFormatter } from "../trpc";
import { scrubMarkup } from "../trpc";

// Fully mock the DB at the file level
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@query/db", () => {
  return {
    db: {
      transaction: vi.fn().mockImplementation((callback) => callback(db)),
      query: {
        admins: {
          findFirst: (...args: any[]) => mockFindFirst("admins", ...args),
          findMany: (...args: any[]) => mockFindMany("admins", ...args),
        },
        hackathons: {
          findFirst: (...args: any[]) => mockFindFirst("hackathons", ...args),
          findMany: (...args: any[]) => mockFindMany("hackathons", ...args),
        },
        hackathonParticipants: {
          findFirst: (...args: any[]) =>
            mockFindFirst("hackathonParticipants", ...args),
          findMany: (...args: any[]) =>
            mockFindMany("hackathonParticipants", ...args),
        },
        hackathonTeams: {
          findFirst: (...args: any[]) =>
            mockFindFirst("hackathonTeams", ...args),
          findMany: (...args: any[]) => mockFindMany("hackathonTeams", ...args),
        },
        users: {
          findFirst: (...args: any[]) => mockFindFirst("users", ...args),
          findMany: (...args: any[]) => mockFindMany("users", ...args),
        },
        members: {
          findFirst: (...args: any[]) => mockFindFirst("members", ...args),
          findMany: (...args: any[]) => mockFindMany("members", ...args),
        },
        events: {
          findFirst: (...args: any[]) => mockFindFirst("events", ...args),
          findMany: (...args: any[]) => mockFindMany("events", ...args),
        },
        judges: {
          findFirst: (...args: any[]) => mockFindFirst("judges", ...args),
          findMany: (...args: any[]) => mockFindMany("judges", ...args),
        },
        judgeAssignments: {
          findFirst: (...args: any[]) =>
            mockFindFirst("judgeAssignments", ...args),
          findMany: (...args: any[]) =>
            mockFindMany("judgeAssignments", ...args),
        },
        hackathonProjects: {
          findFirst: (...args: any[]) =>
            mockFindFirst("hackathonProjects", ...args),
          findMany: (...args: any[]) =>
            mockFindMany("hackathonProjects", ...args),
        },
        userProfiles: {
          findFirst: (...args: any[]) => mockFindFirst("userProfiles", ...args),
          findMany: (...args: any[]) => mockFindMany("userProfiles", ...args),
        },
        membershipHistory: {
          findFirst: (...args: any[]) =>
            mockFindFirst("membershipHistory", ...args),
          findMany: (...args: any[]) =>
            mockFindMany("membershipHistory", ...args),
        },
        eventCheckIns: {
          findFirst: (...args: any[]) => mockFindFirst("eventCheckIns", ...args),
          findMany: (...args: any[]) => mockFindMany("eventCheckIns", ...args),
        },
        hackathonEvents: {
          findFirst: (...args: any[]) =>
            mockFindFirst("hackathonEvents", ...args),
          findMany: (...args: any[]) =>
            mockFindMany("hackathonEvents", ...args),
        },
        hackathonEventAttendees: {
          findFirst: (...args: any[]) =>
            mockFindFirst("hackathonEventAttendees", ...args),
          findMany: (...args: any[]) =>
            mockFindMany("hackathonEventAttendees", ...args),
        },
        judgingProjects: {
          findFirst: (...args: any[]) =>
            mockFindFirst("judgingProjects", ...args),
          findMany: (...args: any[]) =>
            mockFindMany("judgingProjects", ...args),
        },
        judgeVotes: {
          findFirst: (...args: any[]) => mockFindFirst("judgeVotes", ...args),
          findMany: (...args: any[]) => mockFindMany("judgeVotes", ...args),
        },
        judgeQueue: {
          findFirst: (...args: any[]) => mockFindFirst("judgeQueue", ...args),
          findMany: (...args: any[]) => mockFindMany("judgeQueue", ...args),
        },
        stripePayments: {
          findFirst: (...args: any[]) =>
            mockFindFirst("stripePayments", ...args),
          findMany: (...args: any[]) => mockFindMany("stripePayments", ...args),
        },
        userAccountLinks: {
          findFirst: (...args: any[]) =>
            mockFindFirst("userAccountLinks", ...args),
          findMany: (...args: any[]) =>
            mockFindMany("userAccountLinks", ...args),
        },
        auditLogs: {
          findFirst: (...args: any[]) => mockFindFirst("auditLogs", ...args),
          findMany: (...args: any[]) => mockFindMany("auditLogs", ...args),
        },
      },
      insert: (...insertArgs: any[]) => ({
        values: (...valArgs: any[]) => {
          const val = mockInsert("insert", insertArgs, valArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
            // Awaitable, like the real builder: an upsert that rejects (a
            // unique violation, say) has to surface on await rather than
            // resolving to a builder object the caller then ignores.
            onConflictDoUpdate: vi.fn().mockImplementation(() =>
              Object.assign(Promise.resolve(val), {
                returning: vi.fn().mockResolvedValue(val),
              }),
            ),
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
          // `.for("update")` row-locks before a recount, so the where node has
          // to stay chainable as well as awaitable.
          where: vi.fn().mockImplementation(() =>
            Object.assign(Promise.resolve([{ count: 0 }]), {
              orderBy: vi.fn().mockResolvedValue([{ count: 0 }]),
              groupBy: vi.fn().mockResolvedValue([]),
              limit: vi.fn().mockResolvedValue([]),
              offset: vi.fn().mockResolvedValue([]),
              for: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          ),
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
    admins: {
      userId: "user_id",
      isActive: "is_active",
      role: "role",
    },
    users: {
      id: "id",
      email: "email",
    },
    userProfiles: {
      userId: "user_id",
    },
    hackathons: {
      id: "id",
      status: "status",
      isPublic: "is_public",
      startDate: "start_date",
      endDate: "end_date",
      currentParticipants: "current_participants",
      maxParticipants: "max_participants",
    },
    hackathonParticipants: {
      id: "id",
      hackathonId: "hackathon_id",
      userId: "user_id",
      status: "status",
      registrationStatus: "registration_status",
    },
    hackathonTeams: {
      id: "id",
      hackathonId: "hackathon_id",
      name: "name",
    },
    members: {
      id: "id",
      userId: "user_id",
      hackathonId: "hackathon_id",
    },
    membershipHistory: {
      id: "id",
      memberId: "member_id",
    },
    events: {
      id: "id",
      title: "title",
      qrCode: "qr_code",
      checkInEnabled: "check_in_enabled",
      eventDate: "event_date",
      currentCheckIns: "current_check_ins",
    },
    eventCheckIns: {
      id: "id",
      eventId: "event_id",
      userId: "user_id",
    },
    hackathonEvents: {
      id: "id",
      hackathonId: "hackathon_id",
    },
    hackathonEventAttendees: {
      eventId: "event_id",
      participantId: "participant_id",
    },
    judges: {
      id: "id",
      userId: "user_id",
      hackathonId: "hackathon_id",
    },
    judgeAssignments: {
      judgeId: "judge_id",
      hackathonId: "hackathon_id",
    },
    hackathonProjects: {
      id: "id",
      hackathonId: "hackathon_id",
    },
    judgingProjects: {
      id: "id",
      hackathonId: "hackathon_id",
      tableNumber: "table_number",
    },
    judgeVotes: {
      judgeId: "judge_id",
      projectId: "project_id",
      score: "score",
    },
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
    userAccountLinks: {
      userId: "user_id",
      stripePaymentId: "stripe_payment_id",
    },
    auditLogs: {
      id: "id",
      severity: "severity",
      userId: "user_id",
    },
  };
});

describe("Router Integration and Access Control Verification Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
  });

  const createMockCtx = (
    userId?: string,
    extra: Record<string, any> = {},
    headers: Record<string, string> = {},
  ) => {
    return {
      db,
      session: userId ? { user: { id: userId } } : null,
      userId: userId || undefined,
      cache: cache,
      clientIp: "127.0.0.1",
      req: {
        headers: {
          get: (name: string) => headers[name.toLowerCase()] || null,
        },
      },
      ...extra,
    } as any;
  };

  describe("1. Admin Permissions and Role Restrictons", () => {
    it("should query the database on cache miss and verify admin status", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return {
            id: "admin_1",
            userId: "admin_user_id",
            role: "admin",
            isActive: true,
            permissions: [],
          };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const res = await caller.admin.isAdmin();

      expect(res.isAdmin).toBe(true);
      expect(res.role).toBe("admin");
      expect(mockFindFirst).toHaveBeenCalledTimes(1);

      // Hit cache next time
      const cachedRes = await caller.admin.isAdmin();
      expect(cachedRes.isAdmin).toBe(true);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it("should throw FORBIDDEN error when regular user calls admin endpoints", async () => {
      const ctx = createMockCtx("regular_user_id");
      mockFindFirst.mockReturnValue(null); // Not an admin

      const caller = appRouter.createCaller(ctx);
      await expect(caller.admin.analyticsOverview()).rejects.toThrowError(
        "Admin access required",
      );
    });

    it("should block non-super-admins from adding new admins", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return {
            id: "admin_1",
            userId: "admin_user_id",
            role: "admin",
            isActive: true,
          };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.create({
          userId: "target_user_id",
          role: "admin",
        }),
      ).rejects.toThrowError("Super admin access required");
    });
  });

  describe("2. Hackathon and Club Events Access Controls", () => {
    it("should allow public listing of hackathons by unauthenticated users", async () => {
      const ctx = createMockCtx(); // No session
      mockFindMany.mockReturnValue([
        {
          id: "h_1",
          name: "Public Hackathon 2026",
          status: "open",
          isPublic: true,
        },
      ]);

      const caller = appRouter.createCaller(ctx);
      const result = await caller.hackathon.list({ limit: 10 });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Public Hackathon 2026");
    });

    it("should separate hackathon event and club event category designations", () => {
      const hackathonType = { id: "type_1", category: "hackathon" };
      const clubType = { id: "type_2", category: "club" };
      expect(hackathonType.category).not.toBe(clubType.category);
    });
  });

  describe("3. Over-Fetching and Leakage Protections", () => {
    it("should strip secret qrCode from public events listing", async () => {
      const ctx = createMockCtx(); // Public user
      mockFindMany.mockReturnValue([
        {
          id: "event_1",
          title: "Keynote Speech",
          qrCode: "secret_qr_code_123",
          checkInEnabled: true,
          eventDate: new Date(),
        },
      ]);

      const caller = appRouter.createCaller(ctx);
      const listResult = await caller.events.list();

      expect(listResult.length).toBe(1);
      expect(listResult[0].title).toBe("Keynote Speech");
      // Assert qrCode is stripped from returned object
      expect((listResult[0] as any).qrCode).toBeUndefined();
    });

    it("should retain qrCode in admin listAll events endpoint", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return {
            id: "admin_1",
            userId: "admin_user_id",
            role: "admin",
            isActive: true,
          };
        }
        return null;
      });
      mockFindMany.mockReturnValue([
        {
          id: "event_1",
          title: "Keynote Speech",
          qrCode: "secret_qr_code_123",
          checkInEnabled: true,
          eventDate: new Date(),
        },
      ]);

      const caller = appRouter.createCaller(ctx);
      const allResult = await caller.events.listAll();

      expect(allResult.length).toBe(1);
      expect(allResult[0].qrCode).toBe("secret_qr_code_123");
    });
  });

  describe("4. Secure Error Formatting", () => {
    it("should mask database connection string credentials in production mode", () => {
      const rawError = new Error(
        "Fatal Postgres connection timeout: secret_password_value=xyz123",
      );

      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "production";

      const trpcError = new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: rawError.message,
        cause: rawError,
      });

      const formatted = errorFormatter({
        shape: {
          message: trpcError.message,
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
          },
        },
        error: trpcError,
      });

      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalEnv;

      expect(formatted.message).toBe("An unexpected error occurred");
      expect(formatted.message).not.toContain("secret_password_value");
    });

    it("should retain detailed error messages in development mode", () => {
      const rawError = new Error("Database column missing error detail");

      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "development";

      const trpcError = new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: rawError.message,
        cause: rawError,
      });

      const formatted = errorFormatter({
        shape: {
          message: trpcError.message,
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
          },
        },
        error: trpcError,
      });

      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalEnv;

      expect(formatted.message).toBe("Database column missing error detail");
    });
  });

  describe("5. Content-Type Evasion and CSRF Protection", () => {
    it("should allow mutation when Content-Type is application/json", async () => {
      const ctx = createMockCtx(
        "admin_user_id",
        {},
        { "content-type": "application/json" },
      );
      mockFindFirst.mockImplementation((table, query) => {
        if (table === "admins") {
          if (query && JSON.stringify(query).includes("target_user")) {
            return null; // Target user is not already admin
          }
          return {
            id: "admin_1",
            userId: "admin_user_id",
            role: "super_admin",
            isActive: true,
          };
        }
        if (table === "users") {
          return { id: "target_user" };
        }
        return null;
      });
      mockInsert.mockReturnValue([{ id: "new_admin" }]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.admin.create({
        userId: "target_user",
        role: "admin",
      });
      expect(res).toBeDefined();
    });

    it("should block mutation when Content-Type is text/plain (CORS preflight bypass)", async () => {
      const ctx = createMockCtx(
        "admin_user_id",
        {},
        { "content-type": "text/plain" },
      );

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.create({
          userId: "target_user",
          role: "admin",
        }),
      ).rejects.toThrowError("Invalid Content-Type for mutation request");
    });

    it("should block mutation when Content-Type is application/x-www-form-urlencoded", async () => {
      const ctx = createMockCtx(
        "admin_user_id",
        {},
        { "content-type": "application/x-www-form-urlencoded" },
      );

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.create({
          userId: "target_user",
          role: "admin",
        }),
      ).rejects.toThrowError("Invalid Content-Type for mutation request");
    });

    it("should allow queries even with text/plain Content-Type (safe side-effect free requests)", async () => {
      const ctx = createMockCtx(
        "admin_user_id",
        {},
        { "content-type": "text/plain" },
      );
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return {
            id: "admin_1",
            userId: "admin_user_id",
            role: "admin",
            isActive: true,
            permissions: [],
          };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const res = await caller.admin.isAdmin();
      expect(res.isAdmin).toBe(true);
    });
  });

  describe("6. Postgres Connection Starvation and Parameter Safety", () => {
    it("should format Postgres connection pool exhaustion errors safely in production", () => {
      const pgError = new Error("sorry, too many clients already");

      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "production";

      const trpcError = new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: pgError.message,
        cause: pgError,
      });

      const formatted = errorFormatter({
        shape: {
          message: trpcError.message,
          code: -32603,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            httpStatus: 500,
          },
        },
        error: trpcError,
      });

      (process.env as Record<string, string | undefined>).NODE_ENV =
        originalEnv;

      // Ensure error details about clients or connection exhaustion are masked
      expect(formatted.message).toBe("An unexpected error occurred");
      expect(formatted.message).not.toContain("too many clients");
    });

    it("should ensure backslash escapes in sql queries are checked securely", () => {
      // Drizzle parameterises every query, so raw input is never interpolated.
      // The sanitizer therefore passes this through byte for byte rather than
      // guessing at SQL — guessing rejects ordinary prose.
      const dangerousValue = "value\\' OR \\'1\\'=\\'1";
      expect(scrubMarkup(dangerousValue)).toBe(dangerousValue);
    });
  });

  describe("7. Hackathon Teams, Judge and Project Submission Restrictions", () => {
    it("should reject team creation if maxMembers is greater than 4", async () => {
      const ctx = createMockCtx("user_id");
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.team.createTeam({
          hackathonId: "00000000-0000-0000-0000-000000000000",
          name: "Super Team",
          maxMembers: 5,
        }),
      ).rejects.toThrow();
    });

    it("should prevent registered participants from applying to be a judge", async () => {
      const ctx = createMockCtx("participant_user_id");
      const hackathonId = "00000000-0000-0000-0000-000000000001";
      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathonParticipants") {
          return {
            id: "participant_1",
            userId: "participant_user_id",
            hackathonId,
          };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.judge.register({
          hackathonId,
          name: "John Doe",
          email: "john@example.com",
        }),
      ).rejects.toThrowError(
        "You cannot apply to be a judge because you are registered as a participant for this hackathon.",
      );
    });

    it("should prevent project submissions before 12 hours after the hacking begins", async () => {
      const ctx = createMockCtx("captain_user_id");
      const hackathonId = "00000000-0000-0000-0000-000000000001";
      const teamId = "00000000-0000-0000-0000-000000000002";

      const recentStartDate = new Date(Date.now() - 11 * 60 * 60 * 1000); // 11 hours ago

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathonParticipants") {
          return {
            id: "participant_1",
            userId: "captain_user_id",
            hackathonId,
            teamId,
            // Submitting requires the badge scan; these tests are about the
            // window, so admission is deliberately out of the way.
            registrationStatus: "checked_in",
          };
        }
        if (table === "hackathons") {
          return {
            id: hackathonId,
            startDate: recentStartDate,
            hackingStartTime: null,
          };
        }
        if (table === "hackathonTeams") {
          return { id: teamId, captainId: "captain_user_id", hackathonId };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.team.submitProject({
          hackathonId,
          teamId,
          name: "Awesome Project",
          description: "This is a long description of the awesome project.",
        }),
      ).rejects.toThrowError(
        "Project submission is not open yet. It starts 12 hours after the hacking begins.",
      );
    });

    it("should prevent project edits (existing project) after 34 hours of starting hacking", async () => {
      const ctx = createMockCtx("captain_user_id");
      const hackathonId = "00000000-0000-0000-0000-000000000001";
      const teamId = "00000000-0000-0000-0000-000000000002";

      const startDate35hAgo = new Date(Date.now() - 35 * 60 * 60 * 1000); // 35 hours ago

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathonParticipants") {
          return {
            id: "participant_1",
            userId: "captain_user_id",
            hackathonId,
            teamId,
            // Submitting requires the badge scan; these tests are about the
            // window, so admission is deliberately out of the way.
            registrationStatus: "checked_in",
          };
        }
        if (table === "hackathons") {
          return {
            id: hackathonId,
            startDate: startDate35hAgo,
            hackingStartTime: null,
          };
        }
        if (table === "hackathonTeams") {
          return { id: teamId, captainId: "captain_user_id", hackathonId };
        }
        if (table === "hackathonProjects") {
          return {
            id: "project_1",
            hackathonId,
            teamId,
            name: "Old Name",
            description: "Old Description",
          };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.team.submitProject({
          hackathonId,
          teamId,
          name: "Awesome Project",
          description: "This is a long description of the awesome project.",
        }),
      ).rejects.toThrowError(
        "Project edits are closed. Devposts must be final 34 hours after the hacking starts.",
      );
    });

    it("should prevent project submissions more than 36 hours after hacking starts", async () => {
      const ctx = createMockCtx("captain_user_id");
      const hackathonId = "00000000-0000-0000-0000-000000000001";
      const teamId = "00000000-0000-0000-0000-000000000002";

      const pastStartDate = new Date(Date.now() - 37 * 60 * 60 * 1000); // 37 hours ago

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathonParticipants") {
          return {
            id: "participant_1",
            userId: "captain_user_id",
            hackathonId,
            teamId,
            // Submitting requires the badge scan; these tests are about the
            // window, so admission is deliberately out of the way.
            registrationStatus: "checked_in",
          };
        }
        if (table === "hackathons") {
          return {
            id: hackathonId,
            startDate: pastStartDate,
            hackingStartTime: null,
          };
        }
        if (table === "hackathonTeams") {
          return { id: teamId, captainId: "captain_user_id", hackathonId };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.team.submitProject({
          hackathonId,
          teamId,
          name: "Awesome Project",
          description: "This is a long description of the awesome project.",
        }),
      ).rejects.toThrowError(
        "Project submission closed. The submission window ended 36 hours after the hacking started.",
      );
    });
  });

  describe("8. Hackathon Participant Registration (does it add users to the hackathon)", () => {
    const hackathonId = "00000000-0000-0000-0000-000000000010";

    it("should successfully register a user for an open hackathon and increment participant count", async () => {
      const ctx = createMockCtx("new_user_id");

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") {
          return {
            id: hackathonId,
            status: "open",
            currentParticipants: 5,
            maxParticipants: 100,
            registrationDeadline: null,
          };
        }
        if (table === "hackathonParticipants") {
          return null; // Not already registered
        }
        if (table === "members") {
          return null;
        }
        return null;
      });

      mockInsert.mockReturnValue([
        {
          id: "participant_new",
          hackathonId,
          userId: "new_user_id",
          registrationStatus: "pending",
          firstName: "John",
          lastName: "Doe",
        },
      ]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.hackathon.register({
        hackathonId,
        firstName: "John",
        lastName: "Doe",
        phone: "+14045550199",
        age: 20,
        school: "Georgia Tech",
        major: "Computer Science",
        graduationYear: 2026,
        levelOfStudy: "Junior",
        country: "United States",
        whyAttend: "I want to build with data.",
        agreeToCodeOfConduct: true,
      });

      expect(res.id).toBe("participant_new");
      expect(res.userId).toBe("new_user_id");
      expect(mockInsert).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should reject registration if user is already registered", async () => {
      const ctx = createMockCtx("existing_user_id");

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") {
          return { id: hackathonId, status: "open" };
        }
        if (table === "hackathonParticipants") {
          return { id: "participant_existing", userId: "existing_user_id" };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.hackathon.register({
          hackathonId,
          firstName: "John",
          lastName: "Doe",
          phone: "+14045550199",
          age: 20,
          school: "Georgia Tech",
          major: "Computer Science",
          graduationYear: 2026,
          levelOfStudy: "Junior",
          country: "United States",
          whyAttend: "I want to build with data.",
          agreeToCodeOfConduct: true,
        }),
      ).rejects.toThrowError("You are already registered for this hackathon");
    });

    it("should reject registration if hackathon capacity is full", async () => {
      const ctx = createMockCtx("user_id");

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") {
          return {
            id: hackathonId,
            status: "open",
            currentParticipants: 100,
            maxParticipants: 100,
          };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.hackathon.register({
          hackathonId,
          firstName: "Jane",
          lastName: "Smith",
          phone: "+14045550199",
          age: 21,
          school: "Georgia Tech",
          major: "Data Science",
          graduationYear: 2025,
          levelOfStudy: "Senior",
          country: "United States",
          whyAttend: "I want to build with data.",
          agreeToCodeOfConduct: true,
        }),
      ).rejects.toThrowError("This hackathon is full");
    });

    it("should reject registration if hackathon status is not open", async () => {
      const ctx = createMockCtx("user_id");

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") {
          return { id: hackathonId, status: "draft" };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.hackathon.register({
          hackathonId,
          firstName: "Alice",
          lastName: "Bob",
          phone: "+14045550199",
          age: 19,
          school: "MIT",
          major: "CS",
          graduationYear: 2027,
          levelOfStudy: "Sophomore",
          country: "United States",
          whyAttend: "I want to build with data.",
          agreeToCodeOfConduct: true,
        }),
      ).rejects.toThrowError("Registration is not open for this hackathon");
    });

    it("should return user's registrations via myRegistrations", async () => {
      const ctx = createMockCtx("user_123");
      mockFindMany.mockReturnValue([
        { id: "participant_1", hackathonId, userId: "user_123" },
      ]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.hackathon.myRegistrations();
      expect(res.length).toBe(1);
      expect(res[0].id).toBe("participant_1");
    });

    it("should return public participant list for a hackathon", async () => {
      const ctx = createMockCtx();
      mockFindMany.mockReturnValue([
        {
          hackathonId,
          teamId: null,
          user: { id: "u1", name: "Ada", image: null },
          team: null,
        },
      ]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.hackathon.participants({ hackathonId });
      expect(res.length).toBe(1);
      // The joined user is the public identity; the participant id is the
      // event-pass QR payload and is deliberately not returned.
      expect(res[0].user.id).toBe("u1");
    });
  });

  describe("9. Hackathon Creation, Updates and Admin Operations (does it create stuff)", () => {
    const hackathonId = "00000000-0000-0000-0000-000000000020";

    it("should allow admin to create a new hackathon with draft status", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        return null;
      });

      const startDate = new Date(Date.now() + 86400000);
      const endDate = new Date(Date.now() + 172800000);

      mockInsert.mockReturnValue([
        {
          id: hackathonId,
          name: "Hacklytics 2027",
          status: "draft",
          startDate,
          endDate,
        },
      ]);

      const caller = appRouter.createCaller(ctx);
      const created = await caller.hackathon.create({
        name: "Hacklytics 2027",
        description: "Premier Data Science Hackathon",
        startDate,
        endDate,
      });

      expect(created.name).toBe("Hacklytics 2027");
      expect(created.status).toBe("draft");
    });

    it("should allow admin to update an existing hackathon", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        if (table === "hackathons") {
          return {
            id: hackathonId,
            name: "Old Name",
            startDate: new Date(Date.now() + 86400000),
            endDate: new Date(Date.now() + 172800000),
          };
        }
        return null;
      });

      mockUpdate.mockReturnValue([
        { id: hackathonId, name: "Updated Hackathon Name", status: "open" },
      ]);

      const caller = appRouter.createCaller(ctx);
      const updated = await caller.hackathon.update({
        id: hackathonId,
        name: "Updated Hackathon Name",
        status: "open",
      });

      expect(updated.name).toBe("Updated Hackathon Name");
      expect(updated.status).toBe("open");
    });

    it("should allow a super admin to delete a hackathon", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          // Deleting an edition is super-admin only: isAdmin never checked
          // role, so the default "admin" could destroy every participant,
          // team, project and vote attached to it.
          return {
            id: "admin_1",
            userId: "admin_user_id",
            role: "super_admin",
            isActive: true,
          };
        }
        if (table === "hackathons") {
          return { id: hackathonId, name: "Test Hackathon" };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const res = await caller.hackathon.delete({
        hackathonId,
        confirmName: "Test Hackathon",
      });
      expect(res.success).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });

    it("should allow admin to update participant registration status", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        if (table === "hackathonParticipants") {
          return { id: "part_1", hackathonId, registrationStatus: "pending" };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const res = await caller.hackathon.updateParticipantStatus({
        hackathonId,
        participantId: "00000000-0000-0000-0000-000000000099",
        status: "approved",
      });

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("should scan participant event pass and prevent duplicate check-ins", async () => {
      const ctx = createMockCtx("admin_user_id");
      const eventId = "00000000-0000-0000-0000-000000000030";
      const participantId = "00000000-0000-0000-0000-000000000031";

      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        if (table === "hackathonParticipants") {
          return {
            id: participantId,
            hackathonId,
            // The door turns away anyone not actually admitted, so the pass
            // has to belong to an accepted participant.
            registrationStatus: "approved",
            user: { name: "Participant One", email: "p1@example.com" },
          };
        }
        if (table === "hackathonEvents") {
          return { id: eventId, hackathonId, name: "Keynote" };
        }
        if (table === "hackathonEventAttendees") {
          return null; // First scan
        }
        return null;
      });

      mockInsert.mockReturnValue([{ eventId, participantId }]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.hackathon.scanParticipantPass({
        hackathonId,
        eventId,
        participantId,
      });

      expect(res.success).toBe(true);

      // Now test duplicate scan
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        if (table === "hackathonParticipants") {
          return {
            id: participantId,
            hackathonId,
            // The door turns away anyone not actually admitted, so the pass
            // has to belong to an accepted participant.
            registrationStatus: "approved",
            user: { name: "Participant One", email: "p1@example.com" },
          };
        }
        if (table === "hackathonEvents") {
          return { id: eventId, hackathonId, name: "Keynote" };
        }
        if (table === "hackathonEventAttendees") {
          return { eventId, participantId }; // Already scanned!
        }
        return null;
      });

      await expect(
        caller.hackathon.scanParticipantPass({
          hackathonId,
          eventId,
          participantId,
        }),
      ).rejects.toThrowError("already checked into Keynote");
    });
  });

  describe("10. Event Creation and QR Check-in System", () => {
    it("should allow admin to create a general event and generate QR code", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        return null;
      });

      mockInsert.mockReturnValue([
        {
          id: "event_100",
          title: "General Meeting",
          qrCode: "qr-12345-uuid",
          checkInEnabled: true,
        },
      ]);

      const caller = appRouter.createCaller(ctx);
      const created = await caller.events.create({
        title: "General Meeting",
        eventDate: new Date(),
      });

      expect(created.title).toBe("General Meeting");
      expect(created.qrCode).toBeDefined();
    });

    it("should allow member to check in using valid event QR code", async () => {
      const ctx = createMockCtx("member_user_id");

      mockFindFirst.mockImplementation((table) => {
        if (table === "events") {
          return {
            id: "event_100",
            title: "General Meeting",
            qrCode: "00000000-0000-4000-8000-000000000099",
            checkInEnabled: true,
            currentCheckIns: 0,
            maxCheckIns: 50,
          };
        }
        if (table === "hackathons") {
          return { id: "h_latest" };
        }
        if (table === "members") {
          // A membership belongs to an edition and carries an end date; the
          // door checks both, exactly as the portal does.
          return {
            id: "member_1",
            userId: "member_user_id",
            hackathonId: "h_latest",
            isActive: true,
            membershipEndDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          };
        }
        if (table === "eventCheckIns") {
          return null; // Not checked in yet
        }
        return null;
      });

      mockInsert.mockReturnValue([{ id: "checkin_1" }]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.events.checkIn({ qrCode: "00000000-0000-4000-8000-000000000099" });

      expect(res.success).toBe(true);
      expect(res.eventTitle).toBe("General Meeting");
    });

    it("should block non-members from checking into events", async () => {
      const ctx = createMockCtx("non_member_user_id");

      mockFindFirst.mockImplementation((table) => {
        if (table === "events") {
          return { id: "event_100", qrCode: "00000000-0000-4000-8000-000000000099", checkInEnabled: true };
        }
        if (table === "members") {
          return null; // Not a member
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.events.checkIn({ qrCode: "00000000-0000-4000-8000-000000000099" }),
      ).rejects.toThrowError("Must be a member to check in");
    });
  });

  describe("11. Member Registration, Renewal, and Status Tracking", () => {
    const hackathonId = "00000000-0000-0000-0000-000000000040";

    it("should register a user as a member", async () => {
      const ctx = createMockCtx("user_member_1");

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") {
          return { id: hackathonId };
        }
        if (table === "members") {
          return null; // Not yet a member
        }
        return null;
      });

      mockInsert.mockReturnValue([
        {
          id: "member_new_id",
          userId: "user_member_1",
          hackathonId,
          firstName: "John",
          lastName: "Doe",
          memberType: "new",
          isActive: true,
        },
      ]);

      const caller = appRouter.createCaller(ctx);
      const member = await caller.member.register({
        firstName: "John",
        lastName: "Doe",
        phoneNumber: "+14045550123",
      });

      expect(member.id).toBe("member_new_id");
      expect(member.memberType).toBe("new");
      // One write. `register` creates a profile, and only a completed payment
      // grants a term — so there is no "joined" membershipHistory row to pair
      // it with, and nothing to wrap in a transaction.
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it("should reject duplicate member registration", async () => {
      const ctx = createMockCtx("user_member_1");

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return { id: hackathonId };
        if (table === "members") return { id: "existing_member" };
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.member.register({
          firstName: "John",
          lastName: "Doe",
        }),
      ).rejects.toThrowError("You already have a member profile");
    });

    it("should return correct membership status and days remaining", async () => {
      const ctx = createMockCtx("user_member_1");
      const futureExpiry = new Date(Date.now() + 30 * 86400000); // 30 days from now

      mockFindFirst.mockImplementation((table) => {
        if (table === "hackathons") return { id: hackathonId };
        if (table === "members") {
          return {
            id: "member_1",
            userId: "user_member_1",
            hackathonId,
            isActive: true,
            membershipEndDate: futureExpiry,
            memberType: "new",
            renewalCount: 0,
          };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const status = await caller.member.checkStatus();

      expect(status.isMember).toBe(true);
      expect(status.isActive).toBe(true);
      expect(status.daysRemaining).toBe(30);
    });
  });

  describe("12. Stripe Payments & Account Linking", () => {
    it("should create checkout session in mock development mode", async () => {
      const ctx = createMockCtx("stripe_user_id");
      const origMockMode = process.env.STRIPE_MOCK_MODE;
      process.env.STRIPE_MOCK_MODE = "true";

      mockFindFirst.mockImplementation((table) => {
        if (table === "users") {
          return { id: "stripe_user_id", email: "stripe@example.com", name: "Stripe User" };
        }
        if (table === "hackathons") {
          return { id: "h_latest", startDate: new Date() };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const res = await caller.stripe.createCheckoutSession({
        returnUrl: "https://datasciencegt.org/portal",
      });

      if (origMockMode === undefined) delete process.env.STRIPE_MOCK_MODE;
      else process.env.STRIPE_MOCK_MODE = origMockMode;
      expect(res.url).toContain("payment=success");
    });

    it("should allow user to link Stripe payment to account", async () => {
      const ctx = createMockCtx("user_to_link");

      mockFindFirst.mockImplementation((table) => {
        if (table === "stripePayments") {
          return {
            id: "payment_100",
            customerEmail: "purchaser@example.com",
            // The name Stripe recorded. linkAccount matches the submitted name
            // against this, so knowing the email alone cannot claim someone
            // else's payment.
            customerName: "Stripe Payer",
            paymentStatus: "paid",
            linkedUserId: null,
          };
        }
        if (table === "userAccountLinks") {
          return null; // Not linked yet
        }
        if (table === "hackathons") {
          return { id: "h_latest", startDate: new Date() };
        }
        return null;
      });

      mockInsert.mockReturnValue([{ id: "link_1" }]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.stripe.linkAccount({
        firstName: "Stripe",
        lastName: "Payer",
        email: "purchaser@example.com",
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain("Account linked successfully");
    });

    // The email is the one thing about someone else's payment that is easy to
    // know, so it cannot be the whole proof of ownership.
    it("should refuse to link a payment to someone who is not the payer", async () => {
      const ctx = createMockCtx("mallory");

      mockFindFirst.mockImplementation((table) => {
        if (table === "stripePayments") {
          return {
            id: "payment_100",
            customerEmail: "alice@gatech.edu",
            customerName: "Alice Anderson",
            paymentStatus: "paid",
            linkedUserId: null,
          };
        }
        if (table === "users") {
          return { id: "mallory", email: "mallory@gatech.edu" };
        }
        if (table === "userAccountLinks") return null;
        if (table === "hackathons") return { id: "h_latest" };
        return null;
      });

      await expect(
        appRouter.createCaller(ctx).stripe.linkAccount({
          firstName: "Mallory",
          lastName: "Jones",
          email: "alice@gatech.edu",
        }),
      ).rejects.toThrow(/No payment found/);

      expect(mockInsert).not.toHaveBeenCalled();
    });

    // A substring test would accept all of these: "" is inside every name, and
    // so is any single letter. The check compares whole name tokens.
    it.each([
      ["whitespace-only names", "   ", "   "],
      ["single letters", "a", "n"],
      ["a partial token", "ali", "and"],
    ])(
      "should not accept %s as proof of owning a payment",
      async (_label, firstName, lastName) => {
        const ctx = createMockCtx("mallory");

        mockFindFirst.mockImplementation((table) => {
          if (table === "stripePayments") {
            return {
              id: "payment_100",
              customerEmail: "alice@gatech.edu",
              customerName: "Alice Anderson",
              paymentStatus: "paid",
              linkedUserId: null,
            };
          }
          if (table === "users") {
            return { id: "mallory", email: "mallory@gatech.edu" };
          }
          if (table === "userAccountLinks") return null;
          if (table === "hackathons") return { id: "h_latest" };
          return null;
        });

        await expect(
          appRouter.createCaller(ctx).stripe.linkAccount({
            firstName,
            lastName,
            email: "alice@gatech.edu",
          }),
        ).rejects.toThrow();

        expect(mockInsert).not.toHaveBeenCalled();
      },
    );
  });

  describe("13. Judging System, Queue & Live Rankings", () => {
    const hackathonId = "00000000-0000-0000-0000-000000000050";

    it("should allow admin to create a judge profile", async () => {
      const ctx = createMockCtx("admin_user_id");
      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        if (table === "users") {
          return { id: "judge_user_id", name: "Judge Dread", email: "judge@example.com" };
        }
        if (table === "judges") {
          return null;
        }
        return null;
      });

      mockInsert.mockReturnValue([
        { id: "judge_1", userId: "judge_user_id", hackathonId, name: "Judge Dread" },
      ]);

      const caller = appRouter.createCaller(ctx);
      const judge = await caller.judge.create({
        userId: "judge_user_id",
        hackathonId,
        name: "Judge Dread",
      });

      expect(judge.name).toBe("Judge Dread");
    });

    it("should calculate bias-corrected Z-score and Bayesian rankings for hackathon projects", async () => {
      const ctx = createMockCtx("admin_user_id");

      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        return null;
      });

      mockFindMany.mockImplementation((table) => {
        if (table === "judgingProjects") {
          return [
            {
              id: "proj_1",
              name: "AI Health Assistant",
              tableNumber: 1,
              votes: [
                {
                  judgeId: "j1",
                  score: 45,
                  scoreCreativity: 9,
                  scoreImpact: 9,
                  scoreScope: 9,
                  scoreClarity: 9,
                  scoreSoundness: 9,
                  judge: { name: "Strict Judge", user: { name: "Strict Judge" } },
                },
                {
                  judgeId: "j2",
                  score: 48,
                  scoreCreativity: 10,
                  scoreImpact: 10,
                  scoreScope: 9,
                  scoreClarity: 10,
                  scoreSoundness: 9,
                  judge: { name: "Lenient Judge", user: { name: "Lenient Judge" } },
                },
              ],
            },
            {
              id: "proj_2",
              name: "Simple Web App",
              tableNumber: 2,
              votes: [
                {
                  judgeId: "j1",
                  score: 25,
                  scoreCreativity: 5,
                  scoreImpact: 5,
                  scoreScope: 5,
                  scoreClarity: 5,
                  scoreSoundness: 5,
                  judge: { name: "Strict Judge", user: { name: "Strict Judge" } },
                },
              ],
            },
          ];
        }
        return [];
      });

      const caller = appRouter.createCaller(ctx);
      const res = await caller.judge.getRankings({ hackathonId });

      expect(res.rankings.length).toBe(2);
      expect(res.rankings[0].project.name).toBe("AI Health Assistant");
      expect(res.rankings[0].weightedScore).toBeGreaterThan(res.rankings[1].weightedScore);
    });
  });

  describe("14. User Profile & Image Validation", () => {
    it("should return user profile data via me procedure", async () => {
      const ctx = createMockCtx("user_100");
      mockFindFirst.mockImplementation((table) => {
        if (table === "users") {
          return {
            id: "user_100",
            email: "user@example.com",
            name: "Sample User",
            image: "https://example.com/avatar.jpg",
            profile: { bio: "Student", website: "https://example.com", location: "Atlanta" },
          };
        }
        return null;
      });

      const caller = appRouter.createCaller(ctx);
      const profile = await caller.user.me();

      expect(profile.id).toBe("user_100");
      expect(profile.email).toBe("user@example.com");
      expect(profile.bio).toBe("Student");
    });

    it("should allow user to update profile details", async () => {
      const ctx = createMockCtx("user_100");

      const caller = appRouter.createCaller(ctx);
      const res = await caller.user.updateProfile({
        name: "Updated Name",
        bio: "New Bio",
        location: "Atlanta, GA",
      });

      expect(res.success).toBe(true);
    });

    /**
     * The GT address is the one the club actually needs: most people sign in
     * with a personal Google account, so `users.email` is not it.
     */
    describe("Georgia Tech email", () => {
      // What reached the user_profile upsert.
      const upsertedValues = () => {
        const call = mockInsert.mock.calls.at(-1);
        return (call?.[2] as Record<string, unknown>[])[0] as {
          gtEmail?: string | null;
        };
      };

      it("stores a gatech.edu address, lowercased", async () => {
        const caller = appRouter.createCaller(createMockCtx("user_100"));

        await caller.user.updateProfile({ gtEmail: "GBurdell3@GATECH.EDU" });

        expect(upsertedValues().gtEmail).toBe("gburdell3@gatech.edu");
      });

      it("accepts a gatech.edu subdomain", async () => {
        const caller = appRouter.createCaller(createMockCtx("user_100"));

        await caller.user.updateProfile({ gtEmail: "burdell@cc.gatech.edu" });

        expect(upsertedValues().gtEmail).toBe("burdell@cc.gatech.edu");
      });

      it("rejects an address outside gatech.edu", async () => {
        const caller = appRouter.createCaller(createMockCtx("user_100"));

        await expect(
          caller.user.updateProfile({ gtEmail: "burdell@gmail.com" }),
        ).rejects.toThrow();
      });

      /**
       * The domain test is a suffix match, so a lookalike that merely ends in
       * the same letters must not pass — every label before gatech.edu has to
       * be followed by its own dot.
       */
      it("rejects a lookalike domain that ends in gatech.edu", async () => {
        const caller = appRouter.createCaller(createMockCtx("user_100"));

        await expect(
          caller.user.updateProfile({ gtEmail: "burdell@notgatech.edu" }),
        ).rejects.toThrow();
      });

      /**
       * "" is the form saying "remove it". It has to reach the column as NULL:
       * an empty string would sit in the unique index and stop the next person
       * who clears theirs from saving.
       */
      it("clears the address to null rather than an empty string", async () => {
        const caller = appRouter.createCaller(createMockCtx("user_100"));

        await caller.user.updateProfile({ gtEmail: "" });

        expect(upsertedValues().gtEmail).toBeNull();
      });

      it("reports a conflict when the address is on another account", async () => {
        const caller = appRouter.createCaller(createMockCtx("user_100"));
        // Postgres unique_violation, wrapped the way Drizzle wraps driver
        // errors — the SQLSTATE sits on `.cause`, not the thrown object.
        //
        // Rejected rather than thrown: building the statement succeeds and the
        // violation only arrives when the query runs, so a synchronous throw
        // here would test a path the driver never takes. `Promise.resolve`
        // hands back this same promise, so the pre-attached catch keeps the
        // rejection from being reported as unhandled.
        const violation = Promise.reject(
          Object.assign(new Error("Failed query"), {
            cause: { code: "23505" },
          }),
        );
        violation.catch(() => {});
        mockInsert.mockImplementationOnce(() => violation);

        await expect(
          caller.user.updateProfile({ gtEmail: "taken@gatech.edu" }),
        ).rejects.toThrow(/already on another account/);
      });

      it("returns the stored address from me", async () => {
        mockFindFirst.mockImplementation((table) =>
          table === "users"
            ? {
                id: "user_100",
                email: "personal@gmail.com",
                name: "Sample User",
                image: null,
                profile: { gtEmail: "gburdell3@gatech.edu" },
              }
            : null,
        );

        const caller = appRouter.createCaller(createMockCtx("user_100"));
        const profile = await caller.user.me();

        expect(profile.gtEmail).toBe("gburdell3@gatech.edu");
      });
    });
  });

  describe("15. Audit Logs System", () => {
    it("should allow admin to retrieve audit logs with filters", async () => {
      const ctx = createMockCtx("admin_user_id");

      mockFindFirst.mockImplementation((table) => {
        if (table === "admins") {
          return { id: "admin_1", userId: "admin_user_id", role: "admin", isActive: true };
        }
        return null;
      });

      mockFindMany.mockReturnValue([
        { id: "log_1", severity: "critical", userId: "target_user", createdAt: new Date() },
      ]);

      const caller = appRouter.createCaller(ctx);
      const res = await caller.audit.list({
        limit: 10,
        offset: 0,
        severity: "critical",
      });

      expect(res.logs.length).toBe(1);
      expect(res.pagination.limit).toBe(10);
    });
  });
});

