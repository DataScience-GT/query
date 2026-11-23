import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  live: null as null | { token: string; attempts: number; expires: Date },
  updates: [] as unknown[],
  deletes: 0,
  failures: 0,
  lockedOut: false,
}));

vi.mock("@query/core/server", () => ({
  siteOrigin: () => "https://query.example",
}));

vi.mock("@query/db/services/auth-throttle", () => ({
  isLockedOut: async () => state.lockedOut,
  recordFailure: async () => {
    state.failures += 1;
  },
}));

vi.mock("@query/db", () => {
  // select … FOR UPDATE yields the live code row; every write is counted.
  const selectChain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit"]) {
    selectChain[m] = () => selectChain;
  }
  selectChain.for = async () => (state.live ? [state.live] : []);
  const tx = {
    select: () => selectChain,
    delete: () => ({
      where: async () => {
        state.deletes += 1;
      },
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          state.updates.push(values);
        },
      }),
    }),
  };
  return {
    db: { transaction: async (cb: (t: typeof tx) => unknown) => cb(tx) },
    users: {},
    sessions: {},
    accounts: {},
    stripePayments: {},
    userAccountLinks: {},
    verificationTokens: {
      identifier: "identifier",
      token: "token",
      attempts: "attempts",
      expires: "expires",
    },
  };
});

vi.mock("@query/db/services/membership", () => ({
  createOrUpdateMembership: vi.fn(),
  paidForBootcamp: vi.fn(),
  isBootcampAddOnOnly: vi.fn(),
  planFromMetadata: vi.fn(),
}));

vi.mock("@query/api", () => ({
  rateLimit: () => ({ allowed: true }),
  cache: { delete: vi.fn(), deletePattern: vi.fn() },
  resolveClientIp: () => "127.0.0.1",
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ eq: args }),
  and: (...args: unknown[]) => ({ and: args }),
  isNull: (...args: unknown[]) => ({ isNull: args }),
  like: (...args: unknown[]) => ({ like: args }),
  sql: (strings: TemplateStringsArray) => ({ sql: strings.join("?") }),
}));

const { POST } = await import("@/app/(portal)/api/auth/verify-email/route");

function request(
  code: string,
  headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "https://query.example",
  },
) {
  return POST({
    json: async () => ({ code, email: "Member@GaTech.edu" }),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as NextRequest);
}

const live = (attempts = 0) => ({
  token: "custom:123456",
  attempts,
  expires: new Date(Date.now() + 60_000),
});

describe("verify-email wrong guesses", () => {
  beforeEach(() => {
    state.live = live();
    state.updates = [];
    state.deletes = 0;
    state.failures = 0;
    state.lockedOut = false;
  });

  it("charges a wrong code to the live one and to the daily failure count", async () => {
    const res = await request("000000");

    expect(res.status).toBe(401);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toHaveProperty("attempts");
    expect(state.deletes).toBe(0);
    expect(state.failures).toBe(1);
  });

  it("burns the code on the fifth wrong guess", async () => {
    state.live = live(4);
    const res = await request("000000");

    expect(res.status).toBe(401);
    expect(state.updates).toHaveLength(0);
    expect(state.deletes).toBe(1);
  });

  it("refuses even the right code once the code is out of attempts", async () => {
    state.live = live(5);
    const res = await request("123456");

    expect(res.status).toBe(401);
    expect(state.deletes).toBe(1);
    expect(state.failures).toBe(1);
  });

  it("answers 401 and counts a failure when no code is live", async () => {
    state.live = null;
    const res = await request("123456");

    expect(res.status).toBe(401);
    expect(state.failures).toBe(1);
  });

  it("answers 429 without touching any code when the address is locked out", async () => {
    state.lockedOut = true;
    const res = await request("123456");

    expect(res.status).toBe(429);
    expect(state.updates).toHaveLength(0);
    expect(state.deletes).toBe(0);
  });
});

describe("verify-email request origin", () => {
  beforeEach(() => {
    state.live = live();
    state.updates = [];
    state.deletes = 0;
    state.failures = 0;
    state.lockedOut = false;
  });

  it("rejects a cross-origin POST", async () => {
    const res = await request("123456", {
      "content-type": "application/json",
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
  });

  it("rejects a non-JSON body", async () => {
    const res = await request("123456", {
      "content-type": "text/plain",
      origin: "https://query.example",
    });
    expect(res.status).toBe(403);
  });

  it("rejects a request with neither Origin nor same-origin Sec-Fetch-Site", async () => {
    const res = await request("123456", { "content-type": "application/json" });
    expect(res.status).toBe(403);
  });

  it("accepts Sec-Fetch-Site same-origin when Origin is absent", async () => {
    const res = await request("000000", {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    });
    // Past the gate: a wrong code is a 401, not a 403.
    expect(res.status).toBe(401);
  });
});
