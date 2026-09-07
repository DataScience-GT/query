import { describe, it, expect, afterEach, vi } from "vitest";
import { CacheService } from "./cache";
import { TokenBucketLimiter } from "./security";

// Every instance here owns an interval, so each one is disposed or the suite
// never exits.
const live: { destroy?: () => void; dispose?: () => void }[] = [];

const service = (ttl = 300, max = 10000) => {
  const instance = new CacheService(ttl, max);
  live.push(instance);
  return instance;
};

afterEach(() => {
  for (const instance of live.splice(0)) {
    instance.destroy?.();
    instance.dispose?.();
  }
  vi.useRealTimers();
});

describe("CacheService", () => {
  describe("getOrSet", () => {
    it("runs the factory once for callers that all miss together", async () => {
      const cache = service();
      let calls = 0;

      const factory = async () => {
        calls += 1;
        // Resolves on a later tick, which is what gives the other callers a
        // chance to miss before the value is stored.
        await Promise.resolve();
        return "value";
      };

      const results = await Promise.all(
        Array.from({ length: 25 }, () => cache.getOrSet("k", factory, 60)),
      );

      expect(calls).toBe(1);
      expect(results).toEqual(Array.from({ length: 25 }, () => "value"));
    });

    it("serves the stored value once the factory has settled", async () => {
      const cache = service();
      let calls = 0;

      const load = () => cache.getOrSet("k", () => ++calls, 60);

      expect(await load()).toBe(1);
      expect(await load()).toBe(1);
      expect(calls).toBe(1);
    });

    it("lets the next caller retry after the factory throws", async () => {
      const cache = service();
      let calls = 0;

      const factory = async () => {
        calls += 1;
        if (calls === 1) throw new Error("first call fails");
        return "second";
      };

      await expect(cache.getOrSet("k", factory, 60)).rejects.toThrow(
        "first call fails",
      );

      // The in-flight entry is dropped on rejection, so this is a fresh
      // attempt rather than the failed promise handed out again.
      await expect(cache.getOrSet("k", factory, 60)).resolves.toBe("second");
      expect(calls).toBe(2);
    });

    it("hands the same rejection to everyone waiting on that key", async () => {
      const cache = service();
      let calls = 0;

      const factory = async () => {
        calls += 1;
        await Promise.resolve();
        throw new Error("boom");
      };

      const settled = await Promise.allSettled([
        cache.getOrSet("k", factory, 60),
        cache.getOrSet("k", factory, 60),
        cache.getOrSet("k", factory, 60),
      ]);

      expect(calls).toBe(1);
      expect(settled.map((r) => r.status)).toEqual([
        "rejected",
        "rejected",
        "rejected",
      ]);
    });

    it("does not collapse different keys onto one factory call", async () => {
      const cache = service();
      const seen: string[] = [];

      await Promise.all(
        ["a", "b", "c"].map((key) =>
          cache.getOrSet(
            key,
            async () => {
              seen.push(key);
              return key;
            },
            60,
          ),
        ),
      );

      expect(seen.sort()).toEqual(["a", "b", "c"]);
    });
  });

  describe("null results", () => {
    it("caches a factory that answers null instead of rerunning it", async () => {
      const cache = service();
      let calls = 0;

      const load = () =>
        cache.getOrSet("member:me:u1", async () => {
          calls += 1;
          return null;
        });

      expect(await load()).toBeNull();
      expect(await load()).toBeNull();
      expect(await load()).toBeNull();
      // "This user has no member row" is the answer most portal requests get.
      // Read through get(), null looked like a miss and every page hit the
      // database again.
      expect(calls).toBe(1);
    });

    it("reports a key holding null as present", () => {
      const cache = service();
      cache.set("resume:me:u1", null, 60);

      expect(cache.has("resume:me:u1")).toBe(true);
      expect(cache.has("resume:me:u2")).toBe(false);
    });

    it("stops serving a null once its entry expires", async () => {
      const cache = service();
      let calls = 0;

      const load = () =>
        cache.getOrSet(
          "hackathons:upcoming",
          async () => {
            calls += 1;
            return null;
          },
          0.02,
        );

      expect(await load()).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(await load()).toBeNull();
      expect(calls).toBe(2);
      expect(cache.has("hackathons:upcoming")).toBe(true);
    });

    it("counts a null hit as a hit, not a miss", async () => {
      const cache = service();
      await cache.getOrSet("k", async () => null);
      const before = cache.getStats();
      await cache.getOrSet("k", async () => null);
      const after = cache.getStats();

      expect(after.hits).toBe(before.hits + 1);
      expect(after.misses).toBe(before.misses);
    });

    it("does not count has() as a read", () => {
      const cache = service();
      cache.set("k", 1, 60);
      const before = cache.getStats();
      cache.has("k");
      cache.has("absent");

      expect(cache.getStats()).toEqual(before);
    });
  });

  describe("deletePattern", () => {
    const seed = (cache: CacheService) => {
      for (const key of [
        "hackathon:1:participants",
        "hackathon:2:participants",
        "hackathon:1:teams",
        "hackathons:list:public:all",
        "member:me:u1",
        "member:me:u2",
      ]) {
        cache.set(key, key, 60);
      }
    };

    it("deletes an exact key and nothing beside it", () => {
      const cache = service();
      seed(cache);

      expect(cache.deletePattern("hackathon:1:teams")).toBe(1);
      expect(cache.get("hackathon:1:teams")).toBeNull();
      expect(cache.get("hackathon:1:participants")).not.toBeNull();
    });

    it("matches a trailing wildcard as a prefix", () => {
      const cache = service();
      seed(cache);

      expect(cache.deletePattern("member:me:*")).toBe(2);
      expect(cache.get("member:me:u1")).toBeNull();
      expect(cache.get("member:me:u2")).toBeNull();
      expect(cache.get("hackathon:1:teams")).not.toBeNull();
    });

    // `hackathon:*` must not reach `hackathons:list:...` — the anchored match
    // is what keeps a hackathon write from wiping the public listing.
    it("anchors a prefix so a longer namespace is not swept with it", () => {
      const cache = service();
      seed(cache);

      cache.deletePattern("hackathon:*");
      expect(cache.get("hackathons:list:public:all")).not.toBeNull();
    });

    it("matches a wildcard in the middle of the key", () => {
      const cache = service();
      seed(cache);

      expect(cache.deletePattern("hackathon:*:participants")).toBe(2);
      expect(cache.get("hackathon:1:teams")).not.toBeNull();
    });

    it("returns 0 when nothing matches", () => {
      const cache = service();
      seed(cache);

      expect(cache.deletePattern("judge:*")).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("drops expired entries and trims back to the size cap", () => {
      vi.useFakeTimers();
      const cache = service(300, 10);

      // Half expire almost immediately, and the rest overshoot the cap.
      for (let i = 0; i < 20; i += 1) cache.set(`short:${i}`, i, 1);
      for (let i = 0; i < 20; i += 1) cache.set(`long:${i}`, i, 600);

      vi.advanceTimersByTime(60 * 1000);

      expect(cache.getStats().size).toBe(10);
      // The short-lived keys expired, so the survivors are the long ones.
      expect(cache.get("short:0")).toBeNull();
    });
  });
});

describe("TokenBucketLimiter.sweep", () => {
  it("trims the bucket store to its cap oldest-first", () => {
    const limiter = new TokenBucketLimiter(5, 60 * 60 * 1000);
    live.push(limiter);

    for (let i = 0; i < 50; i += 1) limiter.consume(`caller-${i}`, 10, 1);
    expect(limiter.size).toBe(50);

    limiter.sweep();
    expect(limiter.size).toBe(5);
  });
});
