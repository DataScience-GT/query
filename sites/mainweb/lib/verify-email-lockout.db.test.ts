import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type * as DbModule from "@query/db";
import type * as DrizzleOps from "drizzle-orm";

/**
 * Real-Postgres test for what wrong guesses at /api/auth/verify-email do to an
 * address. Anyone can ask for a code for any address and then guess at it, so
 * enough wrong guesses lock the address out of code sign-in. The lock has to
 * end by itself, and ending it must not hand a guesser more tries than before.
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it. It uses one address of its own and removes
 * its rows afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

vi.mock("@query/core/server", () => ({
  siteOrigin: () => "https://query.example",
}));
vi.mock("@query/api", () => ({
  rateLimit: () => ({ allowed: true }),
  cache: { delete: vi.fn(), deletePattern: vi.fn() },
  resolveClientIp: () => "127.0.0.1",
}));

describe.skipIf(!URL)("verify-email lockout on a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const email = `lock-${suffix}@example.test`;
  const RIGHT = "246810";
  const WRONG = "000000";

  let S: typeof DbModule;
  let ops: typeof DrizzleOps;
  let POST: (request: NextRequest) => Promise<Response>;

  const database = () => {
    const found = S.db;
    if (!found) throw new Error("TEST_DATABASE_URL did not give a database");
    return found;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    ops = await import("drizzle-orm");
    ({ POST } = await import("@/app/(portal)/api/auth/verify-email/route"));
  }, 60_000);

  afterAll(async () => {
    if (!S?.db) return;
    await database().delete(S.users).where(ops.eq(S.users.email, email));
    await database().delete(S.verificationTokens).where(
      ops.eq(S.verificationTokens.identifier, email),
    );
    await database().execute(
      ops.sql`DELETE FROM "auth_code_throttle" WHERE "identifier" = ${email}`,
    );
  }, 60_000);

  /** A live code for the address, as a request for one leaves it. */
  const issue = async (code: string) => {
    const db = database();
    await db
      .delete(S.verificationTokens)
      .where(ops.eq(S.verificationTokens.identifier, email));
    await db.insert(S.verificationTokens).values({
      identifier: email,
      token: `custom:${code}`,
      expires: new Date(Date.now() + 10 * 60_000),
    });
  };

  const guess = (code: string) =>
    POST({
      json: async () => ({ code, email }),
      headers: {
        get: (name: string) =>
          ({
            "content-type": "application/json",
            origin: "https://query.example",
          })[name.toLowerCase()] ?? null,
      },
    } as unknown as NextRequest);

  /** Wrong guesses until the address's failures reach the cap, a code at a time. */
  async function guessWrongUntilLocked() {
    for (let code = 0; code < 4; code += 1) {
      await issue(RIGHT);
      for (let i = 0; i < 5; i += 1) expect((await guess(WRONG)).status).toBe(401);
    }
  }

  const throttleRow = async () => {
    const res = await database().execute(
      ops.sql`SELECT "failures", "lockouts", extract(epoch FROM ("locked_until" - now())) / 60 AS "minutes" FROM "auth_code_throttle" WHERE "identifier" = ${email}`,
    );
    return (res as unknown as { rows: Record<string, string | number | null>[] })
      .rows[0];
  };
  const endLock = () =>
    database().execute(
      ops.sql`UPDATE "auth_code_throttle" SET "locked_until" = now() - interval '1 second' WHERE "identifier" = ${email}`,
    );

  it("refuses even the right code once the wrong guesses add up, for 15 minutes", async () => {
    await guessWrongUntilLocked();

    await issue(RIGHT);
    expect((await guess(RIGHT)).status).toBe(429);
    const row = await throttleRow();
    expect(Number(row?.minutes)).toBeGreaterThan(14.5);
    expect(Number(row?.minutes)).toBeLessThanOrEqual(15);
  }, 60_000);

  it("takes the right code again once the lock has run out", async () => {
    await endLock();
    await issue(RIGHT);

    const res = await guess(RIGHT);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
  }, 60_000);

  it("forgets the lock and the failures after that sign-in", async () => {
    const row = await throttleRow();

    expect(row).toMatchObject({ failures: 0, lockouts: 0, minutes: null });
  });

  it("locks twice as long the second time when nobody signed in between", async () => {
    await guessWrongUntilLocked();
    expect(Math.round(Number((await throttleRow())?.minutes))).toBe(15);
    await endLock();

    await guessWrongUntilLocked();

    expect(Math.round(Number((await throttleRow())?.minutes))).toBe(30);
  }, 60_000);
});
