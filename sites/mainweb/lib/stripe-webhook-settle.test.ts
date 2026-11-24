import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  // What the conditional unpaid-to-paid UPDATE ... RETURNING hands back.
  upgraded: [{ id: "pay_1" }] as { id: string }[],
  grants: 0,
  existing: {
    id: "pay_1",
    paymentStatus: "unpaid",
    linkedUserId: "user_1",
  } as Record<string, unknown> | null,
}));

vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");

vi.mock("stripe", () => ({
  default: class {
    webhooks = {};
  },
}));

vi.mock("@query/db", () => ({
  stripePayments: { id: "id", paymentStatus: "payment_status" },
  db: {
    query: {
      stripePayments: { findFirst: async () => state.existing },
    },
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => state.upgraded }),
      }),
    }),
  },
}));

vi.mock("@query/db/services/membership", () => ({
  createOrUpdateMembership: async () => {
    state.grants += 1;
  },
  splitName: () => ({ firstName: "A", lastName: "B" }),
  readPlan: () => "annual",
  BOOTCAMP_ADDON_PAYMENT_TYPE: "bootcamp_addon",
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  ne: (...args: unknown[]) => ({ ne: args }),
}));

vi.mock("@query/api", () => ({
  clearMembershipCaches: vi.fn(),
  MAX_MEMBERSHIP_CHARGE_CENTS: 10000,
  isMockMode: () => true,
}));

vi.mock("@query/api/metrics", () => ({
  membershipGrants: { inc: vi.fn() },
  membershipGrantFailures: { inc: vi.fn() },
}));

const { POST } = await import("@/app/(portal)/api/webhooks/stripe/route");

const deliver = (amount: number, metadata: Record<string, string> = {}) =>
  POST({
    text: async () =>
      JSON.stringify({
        type: "checkout.session.async_payment_succeeded",
        data: {
          object: {
            id: "cs_1",
            payment_status: "paid",
            amount_total: amount,
            customer_details: { email: "a@example.test", name: "A B" },
            metadata,
          },
        },
      }),
    headers: { get: () => "sig" },
  } as unknown as NextRequest);

describe("settling an async checkout payment", () => {
  beforeEach(() => {
    state.upgraded = [{ id: "pay_1" }];
    state.grants = 0;
  });

  it("grants once when this delivery flipped the row to paid", async () => {
    await deliver(2500, { plan: "annual" });
    expect(state.grants).toBe(1);
  });

  it("does not grant when a concurrent delivery already flipped it", async () => {
    state.upgraded = [];
    await deliver(2500, { plan: "annual" });
    expect(state.grants).toBe(0);
  });

  it("does not grant when the amount does not match the stated plan", async () => {
    await deliver(100, { plan: "annual" });
    expect(state.grants).toBe(0);
  });
});
