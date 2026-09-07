import { describe, it, expect } from "vitest";
import { forEachWithConcurrency, emailConcurrency } from "./fanout";

describe("forEachWithConcurrency", () => {
  it("visits every item exactly once", async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const seen: number[] = [];

    await forEachWithConcurrency(items, 5, async (item) => {
      seen.push(item);
    });

    expect(seen).toHaveLength(50);
    expect(new Set(seen).size).toBe(50);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;

    await forEachWithConcurrency(
      Array.from({ length: 40 }, (_, i) => i),
      5,
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
      },
    );

    expect(peak).toBe(5);
    expect(running).toBe(0);
  });

  it("is faster than one at a time for the same work", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const delay = () => new Promise((resolve) => setTimeout(resolve, 10));

    const start = Date.now();
    await forEachWithConcurrency(items, 5, delay);
    const parallel = Date.now() - start;

    // 20 x 10ms serially is 200ms; five at a time is four rounds of it.
    expect(parallel).toBeLessThan(150);
  });

  it("does not start a runner per item on a short list", async () => {
    let peak = 0;
    let running = 0;

    await forEachWithConcurrency([1, 2], 10, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
    });

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("handles an empty list without hanging", async () => {
    let calls = 0;
    await forEachWithConcurrency([], 5, async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
  });

  it("treats a limit below one as one", async () => {
    let peak = 0;
    let running = 0;

    await forEachWithConcurrency([1, 2, 3], 0, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 2));
      running -= 1;
    });

    expect(peak).toBe(1);
  });
});

describe("emailConcurrency", () => {
  it("matches the SMTP pool size", () => {
    const original = process.env.EMAIL_MAX_CONNECTIONS;

    delete process.env.EMAIL_MAX_CONNECTIONS;
    expect(emailConcurrency()).toBe(5);

    process.env.EMAIL_MAX_CONNECTIONS = "8";
    expect(emailConcurrency()).toBe(8);

    // A misconfigured value must not stop the batch from sending at all.
    process.env.EMAIL_MAX_CONNECTIONS = "0";
    expect(emailConcurrency()).toBe(1);

    if (original === undefined) delete process.env.EMAIL_MAX_CONNECTIONS;
    else process.env.EMAIL_MAX_CONNECTIONS = original;
  });
});
