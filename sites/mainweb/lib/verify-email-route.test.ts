import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// What the route's transaction does with verificationToken on a guess.
const calls = vi.hoisted(() => ({
  updates: [] as unknown[],
  deletes: 0,
  matched: null as null | { expires: Date },
}));

vi.mock("@query/db", () => {
  const tx = {
    // The consume step: DELETE … RETURNING the row a correct code matches.
    delete: () => ({
      where: () => {
        calls.deletes += 1;
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => (calls.matched ? [calls.matched] : []),
        });
      },
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          calls.updates.push(values);
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
  gte: (...args: unknown[]) => ({ gte: args }),
  sql: (strings: TemplateStringsArray) => ({ sql: strings.join("?") }),
}));

const { POST } = await import("@/app/(portal)/api/auth/verify-email/route");

const guess = (code: string) =>
  POST({
    json: async () => ({ code, email: "Member@GaTech.edu" }),
    headers: { get: () => null },
  } as unknown as NextRequest);

describe("verify-email wrong guesses", () => {
  beforeEach(() => {
    calls.updates = [];
    calls.deletes = 0;
    calls.matched = null;
  });

  it("charges a wrong code against the live one and burns it at the limit", async () => {
    const res = await guess("000000");

    expect(res.status).toBe(401);
    // One attempt added to the live code…
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0]).toHaveProperty("attempts");
    // …then the consume attempt plus the burn-at-limit delete.
    expect(calls.deletes).toBe(2);
  });
});
