import { describe, it, expect, vi } from "vitest";
import type * as DrizzleOrm from "drizzle-orm";

vi.mock("@query/db", () => ({
  admins: { userId: "user_id", isActive: "is_active" },
  members: { userId: "user_id", hackathonId: "hackathon_id" },
  judges: { userId: "user_id", isActive: "is_active" },
  hackathons: { startDate: "start_date" },
}));

// Partial: portal-context now deep-imports the membership service, which pulls
// in the real schema modules, and those need the rest of drizzle-orm.
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof DrizzleOrm>()),
  eq: (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
}));

// The service is deep-imported so the @query/db mock above does not cover it.
vi.mock("@query/db/services/membership", () => ({
  resolveCurrentHackathonId: vi.fn(async () => "hackathon_1"),
}));

import {
  buildMemberContext,
  fetchPortalContext,
} from "./portal-context";
import { EMPTY_MEMBER_CONTEXT } from "../types/portal-context";

describe("buildMemberContext", () => {
  it("returns empty context when no member record", () => {
    expect(buildMemberContext(null)).toEqual(EMPTY_MEMBER_CONTEXT);
    expect(buildMemberContext(undefined)).toEqual(EMPTY_MEMBER_CONTEXT);
  });

  it("marks expired memberships inactive", () => {
    const past = new Date("2020-01-01");
    const ctx = buildMemberContext({
      isActive: true,
      membershipEndDate: past,
      memberType: "continuous",
      renewalCount: 1,
    });
    expect(ctx.isMember).toBe(true);
    expect(ctx.isActive).toBe(false);
    expect(ctx.daysRemaining).toBeLessThan(0);
  });

  it("marks active memberships with days remaining", () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const ctx = buildMemberContext({
      isActive: true,
      membershipEndDate: future,
      memberType: "new",
      renewalCount: 0,
    });
    expect(ctx.isActive).toBe(true);
    expect(ctx.daysRemaining).toBeGreaterThan(0);
  });
});

describe("fetchPortalContext", () => {
  it("aggregates admin, judge, and member flags", async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const db = {
      query: {
        admins: {
          findFirst: async () => ({
            role: "admin",
            permissions: ["events"],
            isActive: true,
          }),
        },
        hackathons: {
          findFirst: async () => ({ id: "hack-1" }),
        },
        judges: {
          findFirst: async () => ({ id: "judge-1", name: "Alex Judge" }),
        },
        members: {
          findFirst: async () => ({
            isActive: true,
            membershipEndDate: future,
            memberType: "continuous",
            renewalCount: 2,
          }),
        },
      },
    };

    const result = await fetchPortalContext(db as never, "user-1");

    expect(result.isAdmin).toBe(true);
    expect(result.role).toBe("admin");
    expect(result.permissions).toEqual(["events"]);
    expect(result.isJudge).toBe(true);
    expect(result.judgeId).toBe("judge-1");
    expect(result.member.isMember).toBe(true);
    expect(result.member.isActive).toBe(true);
  });

  it("returns defaults when user has no roles", async () => {
    const db = {
      query: {
        admins: { findFirst: async () => null },
        hackathons: { findFirst: async () => null },
        judges: { findFirst: async () => null },
        members: { findFirst: async () => null },
      },
    };

    const result = await fetchPortalContext(db as never, "user-2");

    expect(result.isAdmin).toBe(false);
    expect(result.isJudge).toBe(false);
    expect(result.member).toEqual(EMPTY_MEMBER_CONTEXT);
  });
});
