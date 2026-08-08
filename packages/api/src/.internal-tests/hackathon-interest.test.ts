import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../root";
import { cache } from "../middleware/cache";
import { hackathonInterest } from "@query/db";

/**
 * The interest list for an announced-but-not-open edition.
 *
 * The rules worth pinning down are the ones about WHICH editions accept
 * interest: a draft must be indistinguishable from a made-up id, and an edition
 * that has actually opened must send people to register rather than quietly
 * taking a second, weaker signal.
 */

const mockFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockSelectRows = vi.fn(() => [] as unknown[]);
const mockSendRegistrationOpen = vi.fn();

vi.mock("@query/auth/email", () => ({
  sendRegistrationOpenEmail: (...args: unknown[]) =>
    mockSendRegistrationOpen(...args),
}));

vi.mock("@query/db", () => {
  const selectChain = () => {
    const node: any = {
      from: () => node,
      innerJoin: () => node,
      where: () => node,
      orderBy: () => node,
      limit: () => Promise.resolve(mockSelectRows()),
      then: (ok: any, err: any) => Promise.resolve(mockSelectRows()).then(ok, err),
    };
    return node;
  };

  const table = (name: string) => ({
    findFirst: (...args: any[]) => mockFindFirst(name, ...args),
    findMany: async () => [],
  });

  return {
    db: {
      query: {
        admins: table("admins"),
        users: table("users"),
        hackathons: table("hackathons"),
        hackathonInterest: table("hackathonInterest"),
        members: table("members"),
        projectLeaders: table("projectLeaders"),
        judges: table("judges"),
      },
      select: selectChain,
      insert: (...insertArgs: any[]) => ({
        values: (...valArgs: any[]) => {
          const val = mockInsert("insert", insertArgs, valArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
            onConflictDoUpdate: (...conflictArgs: any[]) => {
              mockInsert("conflict", insertArgs, conflictArgs);
              return Object.assign(Promise.resolve(val), {
                returning: vi.fn().mockResolvedValue(val),
              });
            },
          });
        },
      }),
      delete: (...deleteArgs: any[]) => ({
        where: (...wArgs: any[]) => {
          const val = mockDelete("delete", deleteArgs, wArgs);
          return Object.assign(Promise.resolve(val), {
            returning: vi.fn().mockResolvedValue(val),
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
    },
    admins: { userId: "user_id", isActive: "is_active", role: "role" },
    users: { id: "id", name: "name", email: "email" },
    hackathons: {
      id: "id",
      status: "status",
      isPublic: "is_public",
      startDate: "start_date",
    },
    members: { userId: "user_id", hackathonId: "hackathon_id" },
    projectLeaders: { userId: "user_id", isActive: "is_active" },
    judges: { userId: "user_id", isActive: "is_active" },
    hackathonInterest: {
      id: "id",
      hackathonId: "hackathon_id",
      userId: "user_id",
      school: "school",
      country: "country",
      graduationYear: "graduation_year",
      experience: "experience",
      createdAt: "created_at",
    },
  };
});

import { db } from "@query/db";

const HACK = "22222222-2222-4222-8222-222222222222";
const VISITOR = "user_visitor";
const ADMIN = "user_admin";

const callerFor = (userId?: string) =>
  appRouter.createCaller({
    db,
    session: userId ? { user: { id: userId } } : null,
    userId,
    cache,
    clientIp: "127.0.0.1",
    req: { headers: { get: () => null } },
  } as never);

/**
 * Deliberately a made-up edition. Real names, dates and themes belong in the
 * database, not in a fixture in a public repository — an unannounced event
 * should not be readable from the test suite before it is announced.
 */
const announced = (overrides: Record<string, any> = {}) => ({
  id: HACK,
  name: "Example Hackathon",
  description: "A placeholder edition used only by this suite.",
  location: "Somewhere",
  startDate: new Date("2099-01-02T09:00:00Z"),
  endDate: new Date("2099-01-04T21:00:00Z"),
  theme: "Example Theme",
  websiteUrl: "https://example.com",
  status: "announced",
  isPublic: true,
  ...overrides,
});

const lookups = (opts: {
  hackathon?: Record<string, any>;
  interest?: Record<string, any>;
  isAdmin?: boolean;
}) => {
  mockFindFirst.mockImplementation((tableName: string) => {
    if (tableName === "hackathons") return opts.hackathon;
    if (tableName === "hackathonInterest") return opts.interest;
    if (tableName === "admins")
      return opts.isAdmin ? { id: "ad_1", role: "admin", isActive: true } : undefined;
    return undefined;
  });
};

describe("Hackathon interest list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockReset();
    mockInsert.mockReset().mockReturnValue([]);
    mockDelete.mockReset().mockReturnValue([]);
    mockUpdate.mockReset().mockReturnValue([]);
    mockSelectRows.mockReset().mockReturnValue([]);
    mockSendRegistrationOpen.mockReset().mockResolvedValue(undefined);
    cache.clear();
  });

  describe("1. The announced edition", () => {
    it("is readable without signing in", async () => {
      // A signed-out stranger is the whole audience for this page.
      lookups({ hackathon: announced() });

      const res = await callerFor().hackathon.getUpcoming();
      expect(res?.name).toBe("Example Hackathon");
      expect(res?.theme).toBe("Example Theme");
    });

    it("answers null when nothing is announced", async () => {
      lookups({ hackathon: undefined });
      await expect(callerFor().hackathon.getUpcoming()).resolves.toBeNull();
    });

    /**
     * /hacklytics is the only public entrance to the hackathon — the 2027
     * site's single CTA and the navbar both land there. Filtering to
     * `announced` alone meant the page went blank the moment registration
     * opened, which is the moment it matters most.
     */
    it("still renders once registration opens, and says so", async () => {
      lookups({ hackathon: announced({ status: "open" }) });

      const res = await callerFor().hackathon.getUpcoming();
      expect(res?.name).toBe("Example Hackathon");
      expect(res?.registrationOpen).toBe(true);
    });

    it("reports an announced edition as not yet open", async () => {
      lookups({ hackathon: announced() });

      const res = await callerFor().hackathon.getUpcoming();
      expect(res?.registrationOpen).toBe(false);
    });
  });

  describe("5. Telling the list registration opened", () => {
    /**
     * The list exists for this one moment and nothing sent it — the runbook
     * told organisers to hand-compose an announcement instead.
     */
    it("emails everyone pending and marks each one as it goes", async () => {
      lookups({ hackathon: announced({ status: "open" }), isAdmin: true });
      mockSelectRows.mockReturnValue([
        { id: "int_1", email: "ada@example.com" },
        { id: "int_2", email: "grace@example.com" },
      ]);

      const res = await callerFor(ADMIN).hackathon.notifyRegistrationOpen({
        hackathonId: HACK,
      });

      expect(res).toMatchObject({ sent: 2, done: true });
      expect(mockSendRegistrationOpen).toHaveBeenCalledTimes(2);
      // The marker is what makes a closed tab safe to reopen: one write per
      // recipient, not one at the end of the batch.
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdate.mock.calls[0]![2][0]).toHaveProperty(
        "registrationOpenEmailSentAt",
      );
    });

    // Everyone who acts on the mail would land on a closed registration page.
    it("refuses while registration is still closed", async () => {
      lookups({ hackathon: announced({ status: "announced" }), isAdmin: true });

      await expect(
        callerFor(ADMIN).hackathon.notifyRegistrationOpen({
          hackathonId: HACK,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockSendRegistrationOpen).not.toHaveBeenCalled();
    });

    // A rejected address must not stop the rest of the batch, and must not be
    // marked as sent — otherwise it is silently never retried.
    it("keeps going when one address is rejected", async () => {
      lookups({ hackathon: announced({ status: "open" }), isAdmin: true });
      mockSelectRows.mockReturnValue([
        { id: "int_1", email: "bounces@example.com" },
        { id: "int_2", email: "grace@example.com" },
      ]);
      mockSendRegistrationOpen.mockRejectedValueOnce(new Error("550 rejected"));

      const res = await callerFor(ADMIN).hackathon.notifyRegistrationOpen({
        hackathonId: HACK,
      });

      expect(res.sent).toBe(1);
      expect(res.failed).toEqual(["bounces@example.com"]);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it("is refused to a caller who is not an admin", async () => {
      lookups({ hackathon: announced({ status: "open" }), isAdmin: false });

      await expect(
        callerFor(VISITOR).hackathon.notifyRegistrationOpen({
          hackathonId: HACK,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("2. Which editions take interest", () => {
    it("hides a draft edition behind NOT_FOUND", async () => {
      // Confirming a draft exists would leak that staff are planning something.
      lookups({ hackathon: announced({ status: "draft" }) });

      await expect(
        callerFor(VISITOR).hackathon.registerInterest({ hackathonId: HACK }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("hides a non-public edition the same way", async () => {
      lookups({ hackathon: announced({ isPublic: false }) });

      await expect(
        callerFor(VISITOR).hackathon.registerInterest({ hackathonId: HACK }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("sends people to register once the edition is open", async () => {
      // Taking interest here would collect a weaker signal from somebody who
      // could have had an actual place.
      lookups({ hackathon: announced({ status: "open" }) });

      await expect(
        callerFor(VISITOR).hackathon.registerInterest({ hackathonId: HACK }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("Registration is open"),
      });
    });

    it("refuses once the edition is over", async () => {
      lookups({ hackathon: announced({ status: "completed" }) });

      await expect(
        callerFor(VISITOR).hackathon.registerInterest({ hackathonId: HACK }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("requires signing in", async () => {
      lookups({ hackathon: announced() });

      await expect(
        callerFor().hackathon.registerInterest({ hackathonId: HACK }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("3. Joining and leaving", () => {
    it("upserts, so a second submit edits one entry", async () => {
      lookups({ hackathon: announced() });

      const res = await callerFor(VISITOR).hackathon.registerInterest({
        hackathonId: HACK,
        school: "Georgia Institute of Technology",
        country: "United States",
        graduationYear: 2029,
        experience: "first",
      });

      expect(res.onList).toBe(true);
      const [insert] = mockInsert.mock.calls;
      expect(insert![2][0]).toMatchObject({
        hackathonId: HACK,
        userId: VISITOR,
        school: "Georgia Institute of Technology",
        country: "United States",
        graduationYear: 2029,
        experience: "first",
      });
      // The unique index is what makes a double submit safe, so the write has
      // to actually name it rather than relying on the earlier read.
      const conflict = mockInsert.mock.calls.find((c) => c[0] === "conflict");
      expect(conflict).toBeDefined();
    });

    it("stores a blank answer as null rather than an empty string", async () => {
      lookups({ hackathon: announced() });

      await callerFor(VISITOR).hackathon.registerInterest({
        hackathonId: HACK,
        school: "",
        country: "",
      });

      const [insert] = mockInsert.mock.calls;
      expect(insert![2][0].school).toBeNull();
      expect(insert![2][0].country).toBeNull();
      expect(insert![2][0].graduationYear).toBeNull();
    });

    it("lets somebody leave the list", async () => {
      lookups({ hackathon: announced() });

      const res = await callerFor(VISITOR).hackathon.withdrawInterest({
        hackathonId: HACK,
      });

      expect(res.onList).toBe(false);
      expect(mockDelete.mock.calls[0]![1][0]).toBe(hackathonInterest);
    });

    it("makes leaving twice a no-op rather than an error", async () => {
      lookups({ hackathon: announced() });
      mockDelete.mockReturnValue([]);

      await expect(
        callerFor(VISITOR).hackathon.withdrawInterest({ hackathonId: HACK }),
      ).resolves.toEqual({ onList: false });
    });
  });

  describe("4. The list itself", () => {
    it("is refused to a caller who is not an admin", async () => {
      lookups({ hackathon: announced(), isAdmin: false });

      await expect(
        callerFor(VISITOR).hackathon.listInterest({ hackathonId: HACK }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("is returned to an admin", async () => {
      lookups({ hackathon: announced(), isAdmin: true });
      mockSelectRows.mockReturnValue([
        { userId: VISITOR, email: "ada@example.com", school: null },
      ]);

      const rows = await callerFor(ADMIN).hackathon.listInterest({
        hackathonId: HACK,
      });
      expect(rows).toHaveLength(1);
      // Read through the join rather than a stored copy, so somebody who
      // changes their address stays reachable.
      expect(rows[0]!.email).toBe("ada@example.com");
    });
  });
});
