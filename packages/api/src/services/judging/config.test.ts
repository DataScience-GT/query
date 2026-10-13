import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertHackathonExists,
  ensureJudgingConfig,
  lockInventory,
} from "./config";
import type { JudgingDb } from "./config";

// A stand-in for the handful of query-builder calls these helpers make. Each
// builder resolves to whatever the matching queue holds next.
function fakeDb(results: {
  insert?: unknown[][];
  select?: unknown[][];
  update?: unknown[][];
}) {
  const calls = { insert: 0, select: 0, update: 0 };
  const chain = (kind: keyof typeof calls) => {
    const next = () => {
      calls[kind] += 1;
      return Promise.resolve(results[kind]?.shift() ?? []);
    };
    const builder: Record<string, unknown> = {};
    for (const method of [
      "values",
      "onConflictDoNothing",
      "from",
      "where",
      "set",
    ]) {
      builder[method] = () => builder;
    }
    builder.returning = next;
    builder.limit = next;
    return builder;
  };
  const db = {
    insert: () => chain("insert"),
    select: () => chain("select"),
    update: () => chain("update"),
  };
  return { db: db as unknown as JudgingDb, calls };
}

const HACK = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const config = (over: Record<string, unknown> = {}) => ({
  hackathonId: HACK,
  state: "draft",
  inventoryLockedAt: null,
  inventoryLockedById: null,
  ...over,
});

describe("ensureJudgingConfig", () => {
  it("returns the row it just created", async () => {
    const { db, calls } = fakeDb({ insert: [[config()]] });
    await expect(ensureJudgingConfig(db, HACK)).resolves.toMatchObject({
      hackathonId: HACK,
      state: "draft",
    });
    expect(calls.select).toBe(0);
  });

  it("reads the existing row when one is already there", async () => {
    const existing = config({ state: "open" });
    const { db, calls } = fakeDb({ insert: [[]], select: [[existing]] });
    await expect(ensureJudgingConfig(db, HACK)).resolves.toBe(existing);
    expect(calls.select).toBe(1);
  });

  it("is NOT_FOUND when neither insert nor read finds a row", async () => {
    const { db } = fakeDb({ insert: [[]], select: [[]] });
    await expect(ensureJudgingConfig(db, HACK)).rejects.toBeInstanceOf(
      TRPCError,
    );
  });
});

describe("lockInventory", () => {
  it("keeps the first lock", async () => {
    const lockedAt = new Date("2026-02-21T15:00:00Z");
    const existing = config({ inventoryLockedAt: lockedAt });
    const { db, calls } = fakeDb({ insert: [[]], select: [[existing]] });
    await expect(lockInventory(db, HACK, "user-2")).resolves.toBe(existing);
    expect(calls.update).toBe(0);
  });

  it("locks an unlocked inventory", async () => {
    const locked = config({
      inventoryLockedAt: new Date(),
      inventoryLockedById: "user-1",
    });
    const { db, calls } = fakeDb({ insert: [[config()]], update: [[locked]] });
    await expect(lockInventory(db, HACK, "user-1")).resolves.toBe(locked);
    expect(calls.update).toBe(1);
  });

  it("returns the winner's lock when another caller got there first", async () => {
    const theirs = config({
      inventoryLockedAt: new Date(),
      inventoryLockedById: "user-9",
    });
    const { db } = fakeDb({
      insert: [[config()], []],
      update: [[]],
      select: [[theirs]],
    });
    await expect(lockInventory(db, HACK, "user-1")).resolves.toBe(theirs);
  });
});

describe("assertHackathonExists", () => {
  it("returns the edition", async () => {
    const row = {
      id: HACK,
      name: "Hacklytics 2027",
      startDate: new Date(),
      endDate: new Date(),
    };
    const { db } = fakeDb({ select: [[row]] });
    await expect(assertHackathonExists(db, HACK)).resolves.toBe(row);
  });

  it("is NOT_FOUND for a missing edition", async () => {
    const { db } = fakeDb({ select: [[]] });
    await expect(assertHackathonExists(db, HACK)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
