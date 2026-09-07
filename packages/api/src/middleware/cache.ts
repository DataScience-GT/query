// In-memory TTL cache with automatic cleanup.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export class CacheService {
  private cache = new Map<string, CacheEntry<unknown>>();
  private stats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private cleanupInterval: NodeJS.Timeout;
  private maxCacheSize: number;
  /** Factories running now, keyed as the cache is. See getOrSet. */
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private defaultTTL: number = 300,
    maxCacheSize: number = 10000,
  ) {
    this.maxCacheSize = maxCacheSize;
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * A live entry, or undefined. Separate from `get` because `get` answers null
   * for a miss and for a key holding null alike, so anything that needs to tell
   * those apart — `has`, `getOrSet` — has to read the entry itself.
   */
  private entry<T>(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return undefined;
    }

    return entry;
  }

  get<T>(key: string): T | null {
    const entry = this.entry<T>(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL) * 1000;
    this.cache.set(key, { value, expiresAt });
    this.stats.size = this.cache.size;
  }

  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }

  // Glob-style pattern, * wildcard.
  //
  // The two shapes this codebase actually writes — an exact key, and
  // `prefix*` — are answered without building or running a regex. Every
  // mutation evicts one to three patterns through CACHE_INVALIDATION_MAP, and
  // the scan is O(size) either way; the regex was the per-key cost stacked on
  // top of it.
  deletePattern(pattern: string): number {
    const star = pattern.indexOf("*");

    if (star === -1) {
      return this.delete(pattern) ? 1 : 0;
    }

    let matches: (key: string) => boolean;
    if (star === pattern.length - 1) {
      const prefix = pattern.slice(0, -1);
      matches = (key) => key.startsWith(prefix);
    } else {
      // Escape regex special chars, then convert * to .*
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
      matches = (key) => regex.test(key);
    }

    let count = 0;
    for (const key of this.cache.keys()) {
      if (matches(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.stats.size = this.cache.size;
    return count;
  }

  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, size: 0 };
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Whether a live entry exists — including one holding null, which `get`
   * cannot distinguish from a miss. Does not count as a hit or a miss: asking
   * whether a key is cached is not reading it.
   */
  has(key: string): boolean {
    return this.entry(key) !== undefined;
  }

  // Read through the cache, collapsing concurrent misses onto one factory
  // call. A hot key expiring under load is otherwise a stampede: every
  // request in flight misses in the same instant and runs the same query,
  // which is precisely when a 0.5 GB Neon instance behind a 20-connection
  // pool can least absorb it, and it lands as a tail spike on every
  // procedure sharing the pool rather than only on the one that missed. The
  // metrics gauges already work this way; this is the same rule for reads.
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    ttl?: number,
  ): Promise<T> {
    // Entry, not `get`: a factory that legitimately returns null — "this user
    // has no member row" — otherwise looked like a miss on every call, so the
    // one result most worth collapsing was the one that never cached.
    const cached = this.entry<T>(key);
    if (cached) {
      this.stats.hits++;
      return cached.value;
    }
    this.stats.misses++;

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    // A rejection reaches every joiner, which is what would have happened to
    // each of them separately, and the entry is dropped either way so the
    // next caller retries rather than inheriting the failure.
    const load = (async () => factory())()
      .then((value) => {
        this.set(key, value, ttl);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, load);
    return load;
  }

  // Drops expired entries, then evicts oldest over max size (LRU).
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    // Remove expired entries first
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    // Over max size: evict oldest by expiresAt, ordered in one pass. The
    // previous loop re-walked all 10,000 entries to pick a single key, so a
    // cache that overshot by k paid k walks — synchronously, on a 60s timer,
    // stalling every request in flight at the moment it fired.
    const excess = this.cache.size - this.maxCacheSize;
    if (excess > 0) {
      const byExpiry = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt,
      );

      for (let i = 0; i < excess; i += 1) {
        this.cache.delete(byExpiry[i]![0]);
        removed++;
      }
    }

    if (removed > 0) {
      this.stats.size = this.cache.size;
    }
  }

  // Clears the interval as well — otherwise it leaks on module unload.
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, size: 0 };
  }

  exportStats(): CacheStats {
    return { ...this.stats };
  }
}

// Global cache instance
export const cache = new CacheService(300, 10000); // 5 minutes default TTL, max 10000 entries

// No exported `cacheStats` snapshot: one existed, taken once at module load,
// so it reported zeroes forever. Call cache.getStats() for a live reading.

// TTL (seconds) for state an admin can flip mid-event — hackathon status,
// deadlines, capacity. A mutation only clears the cache on the instance that
// served it, and App Hosting runs up to 10, so short bounds how long the
// others serve stale. Cross-instance correctness needs a shared cache.
export const VOLATILE_TTL = 5;

// Builders for the keys that are actually written. Ones for shapes nothing
// writes (`member()` vs the real `member:me:<id>`) are how the invalidation
// map ended up evicting nothing.
export const CacheKeys = {
  userProfile: (userId: string) => `user:${userId}:profile`,
  admin: (userId: string) => `admin:${userId}`,
  hackathon: (id: string) => `hackathon:${id}`,
  judge: (userId: string) => `judge:${userId}`,
  projectLeader: (userId: string) => `project-leader:${userId}`,
  portalContext: (userId: string) => `user:${userId}:portal`,
} as const;

export const invalidatePortalContext = (userId: string) => {
  cache.delete(CacheKeys.portalContext(userId));
};

// The role gate caches for 60s and the sidebar reads portal context, so a
// grant has to clear both or the new leader sees a tab procedures refuse.
export const clearProjectLeaderCaches = (userId: string) => {
  cache.deletePattern(`${CacheKeys.projectLeader(userId)}*`);
  invalidatePortalContext(userId);
};

// Everything that reports membership. Portal context matters most: the
// sidebar and dashboard gate on it, it lives 5 minutes, and a payment that
// does not evict it leaves the member told to pay again.
export const clearMembershipCaches = (userId: string) => {
  // `member:<userId>*` is a shape nothing writes — member.me stores
  // `member:me:<userId>`. Evict what is written.
  cache.deletePattern(`member:me:${userId}*`);
  cache.deletePattern(`member:status:${userId}*`);
  invalidatePortalContext(userId);
};

// No `invalidateUser`/`invalidateHackathons`/`invalidateEvents` here.
// Eviction goes through CACHE_INVALIDATION_MAP or by id in the resolver that
// wrote the row; a namespace sweep once wiped every cached registration.
