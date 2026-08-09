/**
 * In-Memory Cache Service
 * Provides TTL-based caching with automatic cleanup
 */

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

  /**
   * Get a value from cache
   */
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

  /**
   * Set a value in cache with optional TTL
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.defaultTTL) * 1000;
    this.cache.set(key, { value, expiresAt });
    this.stats.size = this.cache.size;
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }

  /**
   * Delete all keys matching a pattern (glob-style with * wildcard)
   */
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

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, size: 0 };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
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

  /**
   * Remove expired entries and evict oldest entries if cache is over max size (LRU)
   */
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

  /**
   * Destroy the cache service and cleanup intervals
   *
   * @description
   * Properly destroys the cache service by:
   * 1. Clearing the cleanup interval to prevent memory leaks on module unload
   * 2. Clearing all cached entries
   * 3. Resetting statistics counters
   *
   * @example
   * // On application shutdown
   * app.close(() => {
   *   cache.destroy();
   * });
   *
   * // Optional: Export stats before destruction
   * const stats = cache.getStats();
   * console.log(`Cache hits: ${stats.hits}, misses: ${stats.misses}`);
   * cache.destroy();
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, size: 0 };
  }

  /**
   * Get cache statistics for monitoring and metrics export
   *
   * @returns Object containing hits, misses, and current cache size
   *
   * @example
   * const stats = cache.getStats();
   * // { hits: 150, misses: 23, size: 45 }
   */
  exportStats(): CacheStats {
    return { ...this.stats };
  }
}

// Global cache instance
export const cache = new CacheService(300, 10000); // 5 minutes default TTL, max 10000 entries

/*
 * There is deliberately no exported `cacheStats` snapshot. One existed, taken
 * once at module load, so it reported zeroes forever — call cache.getStats()
 * for a live reading.
 */

/**
 * TTL (seconds) for state an admin can flip mid-event — hackathon status,
 * registration deadlines, capacity.
 *
 * This cache lives in a single Node process, and App Hosting runs up to 10
 * instances (see apphosting.yaml). A mutation only clears the cache on the
 * instance that served it, so every other instance keeps serving stale data
 * until its own entry expires. Keeping this short bounds that window to a few
 * seconds instead of a couple of minutes. Cross-instance correctness needs a
 * shared cache; this only limits the blast radius.
 */
export const VOLATILE_TTL = 5;

/**
 * Cache key builders, for the keys that are actually written.
 *
 * `hackathons()`, `events()`, `user()`, `event()` and `member()` used to be
 * here too, and every one described a shape nothing writes — the real keys
 * carry a suffix (`events:list:all`, `member:me:<id>`). Builders for keys that
 * do not exist are how the invalidation map ended up evicting nothing: they
 * read as authoritative and match zero entries.
 */
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

/**
 * The role gate caches for 60s and the sidebar reads the portal context, so
 * granting or revoking has to clear both or the new leader is shown a tab the
 * procedures still refuse.
 */
export const clearProjectLeaderCaches = (userId: string) => {
  cache.deletePattern(`${CacheKeys.projectLeader(userId)}*`);
  invalidatePortalContext(userId);
};

/**
 * Everything that reports whether someone is a member. The portal context
 * entry is the one that matters most — the sidebar and dashboard gate on it,
 * it lives for 5 minutes, and a payment that does not evict it leaves the
 * member being told to pay again.
 */
export const clearMembershipCaches = (userId: string) => {
  // `member:<userId>*` is a shape nothing writes — member.me stores
  // `member:me:<userId>`, so a webhook grant used to leave that entry stale and
  // the member was told to pay for another minute. Evict what is written.
  cache.deletePattern(`member:me:${userId}*`);
  cache.deletePattern(`member:status:${userId}*`);
  invalidatePortalContext(userId);
};

/*
 * `invalidateUser`, `invalidateHackathons` and `invalidateEvents` used to live
 * here with no callers. Eviction happens through CACHE_INVALIDATION_MAP or by
 * id in the resolver that wrote the row — a broad namespace sweep is exactly
 * the P5 mistake (`deletePattern("hackathon*")` once wiped every attendee's
 * cached registrations on every badge scan).
 */
