import { Redis } from "@upstash/redis";

// The one Redis client for the API package, and the rules for using it.
//
// Redis is optional. With UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// unset (local dev, tests, CI, previews) `redis` is null and every caller keeps
// its per-process, in-memory behaviour. Importing this file never throws and
// never touches the network.

/** Per-command ceiling. A slow Redis must cost a request this much, not more. */
export const REDIS_TIMEOUT_MS = 250;

/** One failure is logged per this interval, so an outage is not a log storm. */
const FAILURE_LOG_INTERVAL_MS = 60 * 1000;

/** The slice of the Upstash client this package calls. Tests fake exactly this. */
export interface RedisPipeline {
  incrby(key: string, by: number): RedisPipeline;
  pexpire(key: string, ms: number): RedisPipeline;
  exec(): Promise<unknown[]>;
}

export interface RedisClient {
  pipeline(): RedisPipeline;
  xadd(
    key: string,
    id: "*",
    entries: Record<string, string>,
    opts?: {
      trim: { type: "MAXLEN"; comparison: "~" | "="; threshold: number };
    },
  ): Promise<string>;
  xrange(
    key: string,
    start: string,
    end: string,
    count?: number,
  ): Promise<Record<string, Record<string, unknown>>>;
}

export function createRedis(
  env: Record<string, string | undefined> = process.env,
): RedisClient | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // retry: false — the client's default of five backed-off retries would blow
  // far past REDIS_TIMEOUT_MS. We fail open instead of waiting.
  return new Redis({
    url,
    token,
    retry: false,
    automaticDeserialization: false,
  }) as unknown as RedisClient;
}

export const redis: RedisClient | null = createRedis();

/**
 * Prefix for every key, so a preview and production backend sharing one
 * database never read each other's data. K_SERVICE is the Cloud Run service
 * (one per App Hosting backend); CACHE_PREFIX overrides it.
 */
export function redisKeyPrefix(
  env: Record<string, string | undefined> = process.env,
): string {
  const id = env.CACHE_PREFIX || env.K_SERVICE || env.NODE_ENV || "dev";
  return `query:${id}:`;
}

export function withTimeout<T>(
  work: Promise<T>,
  ms: number = REDIS_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`redis timeout ${ms}ms`)), ms);
  });
  // The loser must not become an unhandled rejection.
  work.catch(() => {});
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

let lastFailureLog = 0;

/** Logs a Redis failure at most once per interval. */
export function reportRedisFailure(what: string, err: unknown) {
  const now = Date.now();
  if (now - lastFailureLog < FAILURE_LOG_INTERVAL_MS) return;
  lastFailureLog = now;
  // oxlint-disable-next-line no-console
  console.error(
    `[Redis] ${what} failed, falling back to in-memory: ${String(err)}`,
  );
}

/** Test hook: lets a suite see the next failure logged. */
export const resetRedisFailureLog = () => {
  lastFailureLog = 0;
};
