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

    constructor(private defaultTTL: number = 300) {
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
     * Delete all keys matching a pattern
     */
    deletePattern(pattern: string): number {
        let count = 0;
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));

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
        ttl?: number
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
     * Remove expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        let removed = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            this.stats.size = this.cache.size;
        }
    }

    /**
     * Destroy the cache service and cleanup intervals
     */
    destroy(): void {
        clearInterval(this.cleanupInterval);
        this.cache.clear();
    }
}

// Global cache instance
export const cache = new CacheService(300); // 5 minutes default TTL

// Cache key builders for consistency
export const CacheKeys = {
    user: (userId: string) => `user:${userId}`,
    userProfile: (userId: string) => `user:${userId}:profile`,
    admin: (userId: string) => `admin:${userId}`,
    hackathon: (id: string) => `hackathon:${id}`,
    hackathons: () => `hackathons:list`,
    event: (id: string) => `event:${id}`,
    events: () => `events:list`,
    judge: (userId: string) => `judge:${userId}`,
    member: (userId: string) => `member:${userId}`,
} as const;

// Cache invalidation helpers
export const invalidateUser = (userId: string) => {
    cache.deletePattern(`user:${userId}*`);
};

export const invalidateHackathons = () => {
    cache.deletePattern('hackathon*');
};

export const invalidateEvents = () => {
    cache.deletePattern('event*');
};
