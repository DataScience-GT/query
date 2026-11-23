import { afterAll, describe, expect, it } from "vitest";

import type * as DbModule from "@query/db";

/**
 * Real-Postgres test for the sign-in code throttle. Needs TEST_DATABASE_URL (a
 * local, disposable database; never Neon or production) and skips without it.
 * Uses its own random keys and removes them afterwards.
 */
const URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!URL)("auth code throttle on a real database", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const key = (name: string) => `throttle-${suffix}-${name}@example.test`;
  const keys: string[] = [];
  let S: typeof DbModule;

  afterAll(async () => {
    if (!S) return;
    const { sql } = await import("drizzle-orm");
    for (const k of keys) {
      await S.db!.execute(
        sql`DELETE FROM "auth_code_throttle" WHERE "identifier" = ${k}`,
      );
    }
  });

  it("allows the hourly cap of codes, even when requested in parallel, then refuses", async () => {
    S = await import("@query/db");
    const { takeCodeSlot } = await import("@query/db/services/auth-throttle");
    const id = key("issue");
    keys.push(id);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => takeCodeSlot(S.db!, id, 5)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await takeCodeSlot(S.db!, id, 5)).toBe(false);
  });

  it("opens a fresh hour once the window has passed", async () => {
    S = await import("@query/db");
    const { sql } = await import("drizzle-orm");
    const { takeCodeSlot } = await import("@query/db/services/auth-throttle");
    const id = key("window");
    keys.push(id);

    expect(await takeCodeSlot(S.db!, id, 1)).toBe(true);
    expect(await takeCodeSlot(S.db!, id, 1)).toBe(false);
    await S.db!.execute(
      sql`UPDATE "auth_code_throttle" SET "issue_window_start" = now() - interval '2 hours' WHERE "identifier" = ${id}`,
    );
    expect(await takeCodeSlot(S.db!, id, 1)).toBe(true);
  });

  it("locks an address out after the daily failures and unlocks when the day passes", async () => {
    S = await import("@query/db");
    const { sql } = await import("drizzle-orm");
    const { FAILURES_PER_IDENTIFIER_PER_DAY, isLockedOut, recordFailure } =
      await import("@query/db/services/auth-throttle");
    const id = key("fail");
    keys.push(id);

    for (let i = 0; i < FAILURES_PER_IDENTIFIER_PER_DAY - 1; i++) {
      await recordFailure(S.db!, id);
    }
    expect(await isLockedOut(S.db!, id)).toBe(false);
    await recordFailure(S.db!, id);
    expect(await isLockedOut(S.db!, id)).toBe(true);

    await S.db!.execute(
      sql`UPDATE "auth_code_throttle" SET "failure_window_start" = now() - interval '25 hours' WHERE "identifier" = ${id}`,
    );
    expect(await isLockedOut(S.db!, id)).toBe(false);
  });

  it("keeps failures and issued codes in independent windows on one row", async () => {
    S = await import("@query/db");
    const { takeCodeSlot, recordFailure, isLockedOut } = await import(
      "@query/db/services/auth-throttle"
    );
    const id = key("both");
    keys.push(id);

    await recordFailure(S.db!, id);
    expect(await takeCodeSlot(S.db!, id, 1)).toBe(true);
    expect(await takeCodeSlot(S.db!, id, 1)).toBe(false);
    expect(await isLockedOut(S.db!, id)).toBe(false);
  });
});
