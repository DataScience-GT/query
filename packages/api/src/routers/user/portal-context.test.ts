import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../../root";
import { cache } from "../../middleware/cache";
import { db } from "@query/db";

const mockFindFirst = vi.fn();

vi.mock("@query/db", () => ({
  db: {
    query: {
      admins: { findFirst: (...args: unknown[]) => mockFindFirst("admins", ...args) },
      hackathons: { findFirst: (...args: unknown[]) => mockFindFirst("hackathons", ...args) },
      judges: { findFirst: (...args: unknown[]) => mockFindFirst("judges", ...args) },
      members: { findFirst: (...args: unknown[]) => mockFindFirst("members", ...args) },
      projectLeaders: {
        findFirst: (...args: unknown[]) => mockFindFirst("projectLeaders", ...args),
      },
      users: { findFirst: vi.fn() },
    },
  },
  admins: { userId: "user_id", isActive: "is_active" },
  members: { userId: "user_id", hackathonId: "hackathon_id" },
  judges: { userId: "user_id", isActive: "is_active" },
  projectLeaders: {
    userId: "user_id",
    hackathonId: "hackathon_id",
    isActive: "is_active",
  },
  hackathons: { startDate: "start_date" },
  users: { id: "id" },
  userProfiles: { userId: "user_id" },
}));

describe("user.getPortalContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.clear();
  });

  const ctx = {
    db,
    session: { user: { id: "user-1" } },
    userId: "user-1",
    cache,
    clientIp: "127.0.0.1",
    req: undefined,
  };

  it("returns combined role flags and caches the result", async () => {
    mockFindFirst.mockImplementation((table: string) => {
      if (table === "admins") return { role: "admin", permissions: [] };
      if (table === "hackathons") return { id: "hack-1" };
      if (table === "judges") return null;
      if (table === "members") {
        return {
          isActive: true,
          membershipEndDate: new Date(Date.now() + 86400000),
          memberType: "new",
          renewalCount: 0,
        };
      }
      return null;
    });

    const caller = appRouter.createCaller(ctx);
    const first = await caller.user.getPortalContext();
    const afterFirst = mockFindFirst.mock.calls.length;
    const second = await caller.user.getPortalContext();

    expect(first.isAdmin).toBe(true);
    expect(first.isJudge).toBe(false);
    expect(first.member.isMember).toBe(true);
    expect(second).toEqual(first);
    // The point of the assertion is the cache, not the exact fan-out: the
    // second call must reach the database zero times.
    expect(afterFirst).toBeGreaterThan(0);
    expect(mockFindFirst).toHaveBeenCalledTimes(afterFirst);
  });
});
