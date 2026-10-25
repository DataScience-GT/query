import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@query/db", () => ({
  db: { execute: mocks.execute },
  sql: (strings: TemplateStringsArray) => strings.join(""),
}));

// unstable_cache needs Next's incremental cache; run the work straight through.
vi.mock("next/cache", () => ({
  unstable_cache: (work: (...args: unknown[]) => unknown) => work,
}));

import { DB_TIMEOUT_MS, loadStatus } from "./load";

afterEach(() => {
  vi.useRealTimers();
  mocks.execute.mockReset();
});

describe("loadStatus deadlines", () => {
  it("reports Down with empty history when the live ping never answers", async () => {
    vi.useFakeTimers();
    mocks.execute.mockReturnValue(new Promise(() => {}));
    const pending = loadStatus();
    await vi.advanceTimersByTimeAsync(DB_TIMEOUT_MS);
    const data = await pending;
    expect(data.live.dbOk).toBe(false);
    expect(data.summary.level).toBe("down");
    expect(data.historyOk).toBe(false);
  });

  it("keeps the live result and flags history when the history reads hang", async () => {
    vi.useFakeTimers();
    mocks.execute
      .mockResolvedValueOnce({ rows: [] }) // live ping
      .mockReturnValue(new Promise(() => {})); // history
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = loadStatus();
    await vi.advanceTimersByTimeAsync(DB_TIMEOUT_MS);
    const data = await pending;
    expect(data.live.dbOk).toBe(true);
    expect(data.historyOk).toBe(false);
    expect(data.hours.every((hour) => hour === null)).toBe(true);
    errors.mockRestore();
  });
});
