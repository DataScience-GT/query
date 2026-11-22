import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CacheService } from "../middleware/cache";
import {
  SharedRateLimiter,
  TokenBucketLimiter,
} from "../middleware/security";
import {
  createRedis,
  redisKeyPrefix,
  resetRedisFailureLog,
} from "../lib/redis";
import { FakeRedis } from "./_fake-redis";

vi.mock("@query/db", () => ({
  db: { insert: vi.fn().mockReturnThis(), values: vi.fn() },
  auditLogs: {},
}));

const PREFIX = "query:test:";

describe("shared Redis: configuration", () => {
  it("is off unless both variables are set", () => {
    expect(createRedis({})).toBeNull();
    expect(createRedis({ UPSTASH_REDIS_REST_URL: "https://x" })).toBeNull();
    expect(createRedis({ UPSTASH_REDIS_REST_TOKEN: "t" })).toBeNull();
  });

  it("builds a client (no network at construction) when both are set", () => {
    expect(
      createRedis({
        UPSTASH_REDIS_REST_URL: "https://example.invalid",
        UPSTASH_REDIS_REST_TOKEN: "t",
      }),
    ).not.toBeNull();
  });

  it("namespaces keys per backend", () => {
    expect(redisKeyPrefix({ K_SERVICE: "query-preview" })).toBe(
      "query:query-preview:",
    );
    expect(redisKeyPrefix({ CACHE_PREFIX: "x", K_SERVICE: "y" })).toBe(
      "query:x:",
    );
    expect(redisKeyPrefix({ NODE_ENV: "production" })).toBe(
      "query:production:",
    );
  });
});

describe("shared Redis: cache without Redis", () => {
  it("behaves as the plain in-memory cache", async () => {
    const cache = new CacheService(300, 100);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeNull();
    cache.set("m:1", 1);
    cache.set("m:2", 2);
    expect(cache.deletePattern("m:*")).toBe(2);
    expect(await cache.getOrSet("k", () => 5)).toBe(5);
    cache.destroy();
  });
});

describe("shared Redis: cross-instance cache invalidation", () => {
  let redis: FakeRedis;
  let a: CacheService;
  let b: CacheService;

  beforeEach(() => {
    vi.useFakeTimers();
    resetRedisFailureLog();
    redis = new FakeRedis();
    a = new CacheService(300, 100, { redis, prefix: PREFIX });
    b = new CacheService(300, 100, { redis, prefix: PREFIX });
  });

  afterEach(() => {
    a.destroy();
    b.destroy();
    vi.useRealTimers();
  });

  it("a delete on A evicts B within one poll interval", async () => {
    a.set("member:u1", { v: 1 });
    b.set("member:u1", { v: 1 });

    a.delete("member:u1");
    expect(a.get("member:u1")).toBeNull();
    expect(b.get("member:u1")).toEqual({ v: 1 }); // not yet

    await vi.advanceTimersByTimeAsync(2100);
    expect(b.get("member:u1")).toBeNull();
  });

  it("a pattern delete reaches the other instance", async () => {
    b.set("member:me:u1", 1);
    b.set("member:me:u1:x", 2);
    b.set("other", 3);

    a.deletePattern("member:me:u1*");
    await vi.advanceTimersByTimeAsync(2100);

    expect(b.get("member:me:u1")).toBeNull();
    expect(b.get("member:me:u1:x")).toBeNull();
    expect(b.get("other")).toBe(3);
  });

  it("does not wipe an entry the writer re-cached after its own delete", async () => {
    a.set("k", 1);
    a.delete("k");
    a.set("k", 2);
    await vi.advanceTimersByTimeAsync(2100);
    expect(a.get("k")).toBe(2);
  });

  it("getOrSet catches up first when this instance has not polled lately", async () => {
    b.set("k", "old");
    a.delete("k");
    // Let the publish land, then jump the clock without letting B's timer run.
    await Promise.resolve();
    vi.setSystemTime(Date.now() + 10_000);
    const value = await b.getOrSet("k", () => "fresh");
    expect(value).toBe("fresh");
  });

  it("keeps working, per instance, when Redis is down", async () => {
    redis.mode = "error";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    a.set("k", 1);
    a.delete("k");
    expect(a.get("k")).toBeNull();
    await vi.advanceTimersByTimeAsync(2100);
    expect(await b.getOrSet("x", () => 7)).toBe(7);
    expect(log).toHaveBeenCalledTimes(1); // once per interval, not per failure
    log.mockRestore();
  });

  it("drops its cache after a missed poll, once Redis returns", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    b.set("k", 1);
    redis.mode = "error";
    await vi.advanceTimersByTimeAsync(2100);
    expect(b.get("k")).toBe(1);
    redis.mode = "ok";
    await vi.advanceTimersByTimeAsync(2100);
    expect(b.get("k")).toBeNull();
    vi.restoreAllMocks();
  });
});

describe("shared Redis: rate limiting", () => {
  let redis: FakeRedis;
  const locals: TokenBucketLimiter[] = [];
  const limiter = (client: FakeRedis | null) => {
    const local = new TokenBucketLimiter(100, 60_000);
    locals.push(local);
    return new SharedRateLimiter(client, PREFIX, local);
  };

  beforeEach(() => {
    redis = new FakeRedis();
    resetRedisFailureLog();
  });
  afterEach(() => locals.splice(0).forEach((l) => l.dispose()));

  it("falls back to the in-memory limiter with no Redis", async () => {
    const l = limiter(null);
    expect((await l.consume("u", 2, 0.01)).allowed).toBe(true);
    expect((await l.consume("u", 2, 0.01)).allowed).toBe(true);
    expect((await l.consume("u", 2, 0.01)).allowed).toBe(false);
  });

  it("counts across two instances sharing Redis", async () => {
    const one = limiter(redis);
    const two = limiter(redis);
    expect((await one.consume("u", 3, 0.01)).allowed).toBe(true);
    expect((await two.consume("u", 3, 0.01)).allowed).toBe(true);
    expect((await one.consume("u", 3, 0.01)).allowed).toBe(true);
    const denied = await two.consume("u", 3, 0.01);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThanOrEqual(1);
    // A different caller is unaffected.
    expect((await two.consume("other", 3, 0.01)).allowed).toBe(true);
  });

  it("charges the token cost", async () => {
    const l = limiter(redis);
    expect((await l.consume("u", 5, 0.01, 3)).allowed).toBe(true);
    expect((await l.consume("u", 5, 0.01, 3)).allowed).toBe(false);
  });

  it("fails open to the in-memory limiter when Redis errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    redis.mode = "error";
    const l = limiter(redis);
    expect((await l.consume("u", 1, 0.01)).allowed).toBe(true);
    expect((await l.consume("u", 1, 0.01)).allowed).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("fails open when Redis hangs past the timeout", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    redis.mode = "hang";
    const l = limiter(redis);
    const started = Date.now();
    expect((await l.consume("u", 5, 1)).allowed).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
    log.mockRestore();
  });
});
