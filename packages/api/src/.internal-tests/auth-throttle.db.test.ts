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

  describe("locking an address out of guessing", () => {
    const FAILURES = 20;

    /** Minutes until the address's lock ends, or null when it holds none. */
    const lockMinutes = async (id: string) => {
      const { sql } = await import("drizzle-orm");
      const res = await S.db!.execute(
        sql`SELECT extract(epoch FROM ("locked_until" - now())) / 60 AS minutes FROM "auth_code_throttle" WHERE "identifier" = ${id}`,
      );
      const minutes = (
        res as unknown as { rows: { minutes: string | null }[] }
      ).rows[0]?.minutes;
      return minutes == null ? null : Number(minutes);
    };
    const endLock = async (id: string) => {
      const { sql } = await import("drizzle-orm");
      await S.db!.execute(
        sql`UPDATE "auth_code_throttle" SET "locked_until" = now() - interval '1 second' WHERE "identifier" = ${id}`,
      );
    };
    const fail = async (id: string, times: number) => {
      const { recordFailure } = await import("@query/db/services/auth-throttle");
      for (let i = 0; i < times; i += 1) await recordFailure(S.db!, id);
    };
    const locked = async (id: string) => {
      const { isLockedOut } = await import("@query/db/services/auth-throttle");
      return isLockedOut(S.db!, id);
    };
    const begin = async (name: string) => {
      S = await import("@query/db");
      const id = key(name);
      keys.push(id);
      return id;
    };

    it("locks an address for 15 minutes once it has used up its failures", async () => {
      const id = await begin("lock-first");

      await fail(id, FAILURES - 1);
      expect(await locked(id)).toBe(false);
      await fail(id, 1);

      expect(await locked(id)).toBe(true);
      expect(await lockMinutes(id)).toBeGreaterThan(14.5);
      expect(await lockMinutes(id)).toBeLessThanOrEqual(15);
    });

    it("lets the address try again when the lock runs out, with its failures counted afresh", async () => {
      const id = await begin("lock-ends");
      await fail(id, FAILURES);
      expect(await locked(id)).toBe(true);

      await endLock(id);
      expect(await locked(id)).toBe(false);

      await fail(id, FAILURES - 1);
      expect(await locked(id)).toBe(false);
      await fail(id, 1);
      expect(await locked(id)).toBe(true);
    });

    it("doubles the lock each time, up to a day", async () => {
      const id = await begin("lock-doubles");
      const minutes: number[] = [];

      for (let lock = 0; lock < 10; lock += 1) {
        await fail(id, FAILURES);
        minutes.push(Math.round((await lockMinutes(id)) ?? -1));
        await endLock(id);
      }

      expect(minutes).toEqual([15, 30, 60, 120, 240, 480, 960, 1440, 1440, 1440]);
    });

    it("starts the backoff over after a successful sign-in", async () => {
      const { clearFailures } = await import("@query/db/services/auth-throttle");
      const id = await begin("lock-cleared");
      await fail(id, FAILURES);
      await endLock(id);
      await fail(id, FAILURES);
      expect(Math.round((await lockMinutes(id)) ?? -1)).toBe(30);

      await clearFailures(S.db!, id);
      expect(await locked(id)).toBe(false);

      await fail(id, FAILURES);
      expect(Math.round((await lockMinutes(id)) ?? -1)).toBe(15);
    });

    it("also forgets guesses that had not yet locked it", async () => {
      const { clearFailures } = await import("@query/db/services/auth-throttle");
      const id = await begin("lock-partial");
      await fail(id, FAILURES - 1);

      await clearFailures(S.db!, id);
      await fail(id, 1);

      expect(await locked(id)).toBe(false);
    });

    it("does nothing for an address it has no row for", async () => {
      const { clearFailures } = await import("@query/db/services/auth-throttle");
      const { sql } = await import("drizzle-orm");
      const id = await begin("lock-none");

      await clearFailures(S.db!, id);

      const res = await S.db!.execute(
        sql`SELECT 1 FROM "auth_code_throttle" WHERE "identifier" = ${id}`,
      );
      expect((res as unknown as { rows: unknown[] }).rows).toHaveLength(0);
    });

    it("frees an address the old flat lock held, until it fails again", async () => {
      const { sql } = await import("drizzle-orm");
      const id = await begin("lock-legacy");
      // A row as the flat 24-hour lock left it: failures at the cap, no end.
      await S.db!.execute(
        sql`INSERT INTO "auth_code_throttle" ("identifier", "failure_window_start", "failures") VALUES (${id}, now(), 25)`,
      );
      expect(await locked(id)).toBe(false);

      await fail(id, 1);

      expect(Math.round((await lockMinutes(id)) ?? -1)).toBe(15);
    });
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
