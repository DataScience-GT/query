import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  // Committed slot counts; a transaction works on a copy and commits on success.
  committed: {} as Record<string, number>,
  caps: {} as Record<string, number>,
  inserts: 0,
}));

vi.mock("@query/core", () => ({ NOREPLY_EMAIL: "n@x.test", ORG_NAME_SPOKEN: "Org" }));
vi.mock("@query/core/server", () => ({ siteOrigin: () => "https://query.example" }));
vi.mock("@query/db/services/membership", () => ({
  linkPaidPaymentByVerifiedEmail: async () => undefined,
}));
vi.mock("@query/db/services/auth-throttle", () => ({
  CODES_PER_IDENTIFIER_PER_HOUR: 5,
  GLOBAL_CODES_PER_HOUR: 300,
  GLOBAL_THROTTLE_KEY: "*global*",
  isLockedOut: async () => false,
  takeCodeSlot: async (
    tx: { slots: Record<string, number> },
    key: string,
    max: number,
  ) => {
    const used = tx.slots[key] ?? 0;
    if (used >= max) return false;
    tx.slots[key] = used + 1;
    return true;
  },
}));
vi.mock("@query/db", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<boolean>) => {
      const slots = { ...state.committed };
      const tx = {
        slots,
        execute: async (query: unknown) => {
          const text = JSON.stringify(query);
          if (text.includes("INSERT INTO")) state.inserts += 1;
          return { rows: [] };
        },
      };
      const result = await fn(tx);
      state.committed = slots;
      return result;
    },
    execute: async () => ({ rows: [] }),
  },
}));
vi.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: async () => ({ rejected: [], pending: [] }),
  }),
}));

import { authConfig } from "./config";

type Provider = {
  id: string;
  sendVerificationRequest?: (p: unknown) => Promise<void>;
  options?: { sendVerificationRequest?: (p: unknown) => Promise<void> };
};

const send = (identifier: string) => {
  const provider = (authConfig.providers as Provider[]).find(
    (p) => p.id === "nodemailer",
  );
  const fn =
    provider?.options?.sendVerificationRequest ??
    provider?.sendVerificationRequest;
  if (!fn) throw new Error("nodemailer provider not found");
  return fn({ identifier, provider: { server: {}, from: "n@x.test" } });
};

describe("email code send throttle", () => {
  beforeEach(() => {
    state.committed = {};
    state.inserts = 0;
  });

  it("does not spend global slots once an address is past its own cap", async () => {
    for (let i = 0; i < 5; i += 1) await send("a@x.test");
    expect(state.committed["*global*"]).toBe(5);

    // Five codes sent; every further post for this address is refused.
    for (let i = 0; i < 20; i += 1) await send("a@x.test");
    expect(state.committed["*global*"]).toBe(5);
    expect(state.committed["a@x.test"]).toBe(5);
    expect(state.inserts).toBe(5);
  });

  it("rolls back the address slot when the global cap refuses", async () => {
    state.committed = { "*global*": 300 };
    await send("b@x.test");
    expect(state.committed["b@x.test"]).toBeUndefined();
  });
});
