import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as DbModule from "@query/db";
import type * as Throttle from "@query/db/services/auth-throttle";

/**
 * Real-Postgres test that signing in any way other than the code lifts an
 * address's lockout from guessing. The code route clears it itself; Google and
 * Discord sign-ins come through the sign-in event, and the address on them is
 * one the provider has verified, so only its owner can have got in this way.
 *
 * Needs TEST_DATABASE_URL (a local, disposable database; never Neon or
 * production) and skips without it.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("sign-in event and the code lockout", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const identifier = `oauth-${suffix}@example.test`;

  let S: typeof DbModule;
  let throttle: typeof Throttle;
  let onSignIn: (message: unknown) => Promise<void>;

  const database = () => {
    const found = S.db;
    if (!found) throw new Error("TEST_DATABASE_URL did not give a database");
    return found;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    S = await import("@query/db");
    throttle = await import("@query/db/services/auth-throttle");
    const { authConfig } = await import("./config");
    onSignIn = authConfig.events?.signIn as typeof onSignIn;
  }, 60_000);

  afterAll(async () => {
    if (!S?.db) return;
    const { sql } = await import("drizzle-orm");
    await database().execute(
      sql`DELETE FROM "auth_code_throttle" WHERE "identifier" = ${identifier}`,
    );
  }, 60_000);

  it("frees an address that wrong guesses had locked, whatever the case the provider sent", async () => {
    for (let i = 0; i < 20; i += 1) {
      await throttle.recordFailure(database(), identifier);
    }
    expect(await throttle.isLockedOut(database(), identifier)).toBe(true);

    await onSignIn({
      user: { id: "someone", email: identifier.toUpperCase(), name: null },
    });

    expect(await throttle.isLockedOut(database(), identifier)).toBe(false);
  });
});
