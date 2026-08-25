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

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
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
  deletePattern(pattern: string): number {
    let count = 0;
    // Escape regex special chars, then convert * to .*
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
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

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    ttl?: number,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
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

    // If cache is over max size, evict oldest entries (LRU - remove oldest by expiresAt as proxy)
    while (this.cache.size > this.maxCacheSize) {
      let oldestKey: string | null = null;
      let oldestValue: CacheEntry<unknown> | undefined = undefined;

      // Find the oldest entry
      for (const [key, entry] of this.cache.entries()) {
        if (!oldestValue || entry.expiresAt < oldestValue.expiresAt) {
          oldestKey = key;
          oldestValue = entry;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
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
