import { describe, it, expect, vi } from "vitest";
import {
  BUCKET_MS,
  RETENTION_MS,
  bucketStartOf,
  createStatusRecorder,
  isServerErrorCode,
  percentile
  
} from "./status-samples";
import type {StatusRow} from "./status-samples";

const T0 = Date.UTC(2026, 0, 10, 12, 0, 0);

function setup(overrides: { failWrites?: boolean } = {}) {
  let clock = T0 + 1000;
  const rows: StatusRow[] = [];
  const state = { failWrites: overrides.failWrites ?? false };
  const prune = vi.fn(async () => {});
  const onWriteError = vi.fn();
  const ping = vi.fn(async () => ({ ok: true, ms: 7 }));
  const recorder = createStatusRecorder({
    now: () => clock,
    instanceId: "i-1",
    ping,
    write: async (row) => {
      if (state.failWrites) throw new Error("db down");
      rows.push(row);
    },
    prune,
    onWriteError,
    random: () => 0,
  });
  return {
    recorder,
    rows,
    state,
    prune,
    onWriteError,
    ping,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("error classification", () => {
  it("counts 5xx-class codes only", () => {
    for (const code of [
      "INTERNAL_SERVER_ERROR",
      "NOT_IMPLEMENTED",
      "BAD_GATEWAY",
      "SERVICE_UNAVAILABLE",
      "GATEWAY_TIMEOUT",
    ]) {
      expect(isServerErrorCode(code)).toBe(true);
    }
    for (const code of [
      "UNAUTHORIZED",
      "FORBIDDEN",
      "BAD_REQUEST",
      "NOT_FOUND",
      "TOO_MANY_REQUESTS",
      "PARSE_ERROR",
      "CONFLICT",
    ]) {
      expect(isServerErrorCode(code)).toBe(false);
    }
  });
});

describe("percentile", () => {
  it("uses nearest rank and is 0 when empty", () => {
    expect(percentile([], 0.95)).toBe(0);
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(95);
  });
});

describe("bucketStartOf", () => {
  it("floors to five minutes", () => {
    expect(bucketStartOf(T0 + 4 * 60_000 + 59_000)).toBe(T0);
    expect(bucketStartOf(T0 + BUCKET_MS)).toBe(T0 + BUCKET_MS);
  });
});

describe("recorder", () => {
  it("writes nothing while the bucket is still open", async () => {
    const { recorder, rows, advance } = setup();
    recorder.record(10, false);
    advance(60_000);
    recorder.record(20, false);
    await recorder.settled();
    expect(rows).toEqual([]);
  });

  it("writes the finished bucket when a request lands in a later one", async () => {
    const { recorder, rows, advance } = setup();
    for (let i = 1; i <= 20; i += 1) recorder.record(i * 10, i === 3);
    advance(BUCKET_MS);
    recorder.record(5, false);
    await recorder.settled();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      bucketStart: new Date(T0),
      instanceId: "i-1",
      requests: 20,
      errors: 1,
      p50Ms: 100,
      p95Ms: 190,
      dbOk: true,
      dbMs: 7,
    });
  });

  it("does not wait for the write", () => {
    const { recorder, advance, state } = setup();
    state.failWrites = true;
    recorder.record(10, false);
    advance(BUCKET_MS);
    // Returns synchronously and does not throw, whatever the writer does.
    expect(() => recorder.record(10, false)).not.toThrow();
  });

  it("counts a failed write and retries the bucket on the next flush", async () => {
    const { recorder, rows, state, onWriteError, advance } = setup({
      failWrites: true,
    });
    recorder.record(10, false);
    advance(BUCKET_MS);
    recorder.record(10, true);
    await recorder.settled();
    expect(onWriteError).toHaveBeenCalledTimes(1);
    expect(recorder.pending()).toBe(1);

    state.failWrites = false;
    advance(BUCKET_MS);
    recorder.record(10, false);
    await recorder.settled();

    expect(recorder.pending()).toBe(0);
    expect(rows.map((r) => r.bucketStart.getTime())).toEqual([
      T0,
      T0 + BUCKET_MS,
    ]);
  });

  it("keeps the db check taken on the first attempt", async () => {
    const { recorder, rows, state, ping, advance } = setup({
      failWrites: true,
    });
    ping.mockResolvedValueOnce({ ok: false, ms: 3000 });
    recorder.record(10, false);
    advance(BUCKET_MS);
    recorder.record(10, false);
    await recorder.settled();

    state.failWrites = false;
    advance(BUCKET_MS);
    recorder.record(10, false);
    await recorder.settled();

    expect(rows[0]).toMatchObject({ dbOk: false, dbMs: 3000 });
  });

  it("bounds the retry queue", async () => {
    const { recorder, onWriteError, advance } = setup({ failWrites: true });
    for (let i = 0; i < 30; i += 1) {
      recorder.record(10, false);
      advance(BUCKET_MS);
    }
    await recorder.settled();
    expect(recorder.pending()).toBeLessThanOrEqual(12);
    expect(onWriteError).toHaveBeenCalled();
  });

  it("keeps a bounded sample of durations", async () => {
    const { recorder, rows, advance } = setup();
    for (let i = 0; i < 5000; i += 1) recorder.record(i, false);
    advance(BUCKET_MS);
    recorder.record(1, false);
    await recorder.settled();
    expect(rows[0]!.requests).toBe(5000);
    expect(rows[0]!.p95Ms).toBeGreaterThan(0);
  });

  it("prunes at most once a day, to a 90 day cutoff", async () => {
    const { recorder, prune, advance } = setup();
    recorder.record(1, false);
    advance(BUCKET_MS);
    recorder.record(1, false);
    await recorder.settled();
    // First flush prunes, so a short-lived instance still cleans up.
    expect(prune).toHaveBeenCalledTimes(1);
    const first = (prune.mock.calls as unknown as [Date][])[0]![0];
    expect(first.getTime()).toBe(T0 + 1000 + BUCKET_MS - RETENTION_MS);

    advance(BUCKET_MS);
    recorder.record(1, false);
    await recorder.settled();
    expect(prune).toHaveBeenCalledTimes(1);

    advance(24 * 60 * 60 * 1000);
    recorder.record(1, false);
    advance(BUCKET_MS);
    recorder.record(1, false);
    await recorder.settled();
    expect(prune).toHaveBeenCalledTimes(2);
    const cutoff = (prune.mock.calls as unknown as [Date][])[1]![0];
    expect(cutoff.getTime()).toBe(
      T0 + 1000 + 2 * BUCKET_MS + 24 * 60 * 60 * 1000 + BUCKET_MS - RETENTION_MS,
    );
  });

  it("removes the bucket it wrote even if the queue was evicted meanwhile", async () => {
    let clock = T0 + 1000;
    const written: number[] = [];
    let release: (() => void) | undefined;
    let calls = 0;
    const recorder = createStatusRecorder({
      now: () => clock,
      instanceId: "i-1",
      ping: async () => ({ ok: true, ms: 1 }),
      write: async (row) => {
        calls += 1;
        // First write stalls; later ones succeed at once.
        if (calls === 1) await new Promise<void>((r) => (release = r));
        written.push(row.bucketStart.getTime());
      },
      prune: async () => {},
      onWriteError: () => {},
      random: () => 0,
    });
    recorder.record(1, false);
    clock += BUCKET_MS;
    recorder.record(1, false); // flushes T0; its write now stalls
    await new Promise((r) => setTimeout(r, 0));
    // 13 more buckets finish: the queue evicts the stalled T0 and T0+1.
    for (let i = 0; i < 13; i += 1) {
      clock += BUCKET_MS;
      recorder.record(1, false);
    }
    release?.();
    await recorder.settled();
    // The stalled write must not remove T0+2, which was never written.
    expect(written[0]).toBe(T0);
    expect(written).toContain(T0 + 2 * BUCKET_MS);
    expect(recorder.pending()).toBe(0);
  });
});
