import { db, auditLogs } from "@query/db";

interface RateLimitRecord {
  tokens: number;
  lastRefill: number;
  violations: number;
  blockedUntil: number;
  /**
   * When this caller last exceeded their bucket.
   *
   * Separate from lastRefill because that is stamped on every request, so a
   * decay measured against it can only fire for somebody who has stopped
   * making requests entirely. Backoff is exponential in `violations`, so
   * without a decay that actually fires, one bad afternoon escalates a
   * legitimate user to five-minute blocks for the rest of the event.
   */
  lastViolation: number;
}

interface IPRecord {
  requests: number;
  firstRequest: number;
  suspiciousActivity: number;
  isBlocked: boolean;
  blockedUntil: number;
}

/** How long a caller must behave for one violation to be forgiven. */
const VIOLATION_DECAY_MS = 10 * 60 * 1000;

const MAX_RATE_LIMIT_STORE_SIZE = 10000;
const MAX_IP_TRACKING_STORE_SIZE = 50000;

const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Evicts oldest-first until the store is under `max`.
 *
 * The pick is unconditional and the loop gives up when nothing was selected.
 * A version that only deleted entries matching a predicate could make zero
 * progress — a store full of fresh, never-blocked records satisfies no
 * predicate — and since this runs on an interval, that spins the event loop of
 * the whole instance until it is killed.
 */
const evictOldest = <V>(
  store: Map<string, V>,
  max: number,
  ageOf: (value: V) => number,
) => {
  while (store.size > max) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, value] of store.entries()) {
      const age = ageOf(value);
      if (age < oldestTime) {
        oldestTime = age;
        oldestKey = key;
      }
    }
    if (oldestKey === null) break;
    store.delete(oldestKey);
  }
};

/**
 * Owns the token buckets and the timer that prunes them.
 *
 * The store, its size cap and its sweep used to be three module-level things
 * that only convention kept in step, and the sweep ran from two separate
 * intervals with subtly different conditions. One object holds all of it, and
 * a test can build its own instance instead of reaching into shared state.
 */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, RateLimitRecord>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly maxStoreSize: number = MAX_RATE_LIMIT_STORE_SIZE,
    sweepIntervalMs: number = SWEEP_INTERVAL_MS,
  ) {
    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
  }

  consume(
    identifier: string,
    maxTokens: number,
    refillRatePerSecond: number,
    tokensToConsume = 1,
  ): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    let record = this.buckets.get(identifier);

    if (!record) {
      record = {
        tokens: maxTokens,
        lastRefill: now,
        violations: 0,
        blockedUntil: 0,
        lastViolation: 0,
      };
      this.buckets.set(identifier, record);
    }

    if (now < record.blockedUntil) {
      return {
        allowed: false,
        retryAfter: Math.ceil((record.blockedUntil - now) / 1000),
      };
    }

    const elapsed = (now - record.lastRefill) / 1000;
    record.tokens = Math.min(
      maxTokens,
      record.tokens + elapsed * refillRatePerSecond,
    );
    record.lastRefill = now;

    this.decayViolations(record, now);

    if (record.tokens < tokensToConsume) {
      record.violations++;
      record.lastViolation = now;
      const backoffSeconds = Math.min(Math.pow(2, record.violations - 1), 300);
      record.blockedUntil = now + backoffSeconds * 1000;
      return { allowed: false, retryAfter: backoffSeconds };
    }

    record.tokens -= tokensToConsume;
    return { allowed: true };
  }

  /**
   * Applied before the bucket check so a caller who has waited out their
   * penalty is not immediately re-escalated from the old count.
   */
  private decayViolations(record: RateLimitRecord, now: number) {
    if (record.violations <= 0 || record.lastViolation <= 0) return;
    const clearPeriods = Math.floor(
      (now - record.lastViolation) / VIOLATION_DECAY_MS,
    );
    if (clearPeriods > 0) {
      record.violations = Math.max(0, record.violations - clearPeriods);
    }
  }

  /**
   * Both halves of the idle condition matter. A healthy record carries
   * `blockedUntil: 0`, so testing that alone deleted EVERY bucket on every
   * tick — the whole store was erased once a minute and each caller got a
   * fresh full bucket back regardless of how they had behaved.
   */
  sweep(now: number = Date.now()) {
    for (const [key, record] of this.buckets.entries()) {
      const idle = now - record.lastRefill > 30 * 60 * 1000;
      if (idle && now > record.blockedUntil) this.buckets.delete(key);
    }
    evictOldest(this.buckets, this.maxStoreSize, (r) => r.lastRefill);
  }

  clear() {
    this.buckets.clear();
  }

  get size() {
    return this.buckets.size;
  }

  /** For tests and shutdown; the process singleton never stops sweeping. */
  dispose() {
    clearInterval(this.sweepTimer);
  }
}

// DDoS thresholds. Intentionally lower than the absolute limits, for headroom.
const DDOS_CONFIG = {
  maxRequestsPerMinute:
    Number(process.env.DDOS_MAX_REQUESTS_PER_MINUTE) || 1000,
  suspiciousThreshold: Number(process.env.DDOS_SUSPICIOUS_THRESHOLD) || 700,
  blockDurationMs: Number(process.env.DDOS_BLOCK_DURATION_MS) || 5 * 60 * 1000,
  burstThreshold: Number(process.env.DDOS_BURST_THRESHOLD) || 100,
  burstWindowMs: Number(process.env.DDOS_BURST_WINDOW_MS) || 5 * 1000,
  cleanupIntervalMs: Number(process.env.DDOS_CLEANUP_INTERVAL_MS) || 60 * 1000,
};

/** Coarse per-caller flood protection over its own record store. */
export class FloodGuard {
  private readonly callers = new Map<string, IPRecord>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly config = DDOS_CONFIG,
    private readonly onEvent: (event: Omit<SecurityEvent, "timestamp">) => void,
    private readonly maxStoreSize: number = MAX_IP_TRACKING_STORE_SIZE,
  ) {
    this.sweepTimer = setInterval(
      () => this.sweep(),
      this.config.cleanupIntervalMs,
    );
  }

  /**
   * `key` is an identity when we have one and an address only when we do not —
   * callers must prefix it (`user:` / `ip:`) so the two namespaces can never
   * collide. Keying on the address alone puts an entire venue behind one NAT
   * into a single bucket, which is exactly the crowd this is supposed to serve.
   */
  check(key: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();

    let record = this.callers.get(key);
    if (!record) {
      record = {
        requests: 0,
        firstRequest: now,
        suspiciousActivity: 0,
        isBlocked: false,
        blockedUntil: 0,
      };
      this.callers.set(key, record);
    }

    if (record.isBlocked && now < record.blockedUntil) {
      this.onEvent({
        type: "rate_limit",
        identifier: key,
        details: "Blocked caller attempted access",
      });
      return {
        allowed: false,
        retryAfter: Math.ceil((record.blockedUntil - now) / 1000),
      };
    }

    const elapsed = now - record.firstRequest;
    if (elapsed > 60 * 1000) {
      record.requests = 0;
      record.firstRequest = now;
    }

    record.requests++;

    if (
      elapsed < this.config.burstWindowMs &&
      record.requests > this.config.burstThreshold
    ) {
      return this.block(
        key,
        record,
        now,
        `Burst attack detected: ${record.requests} requests in ${elapsed}ms`,
      );
    }

    if (record.requests > this.config.maxRequestsPerMinute) {
      return this.block(
        key,
        record,
        now,
        `Sustained attack: ${record.requests} requests/minute`,
      );
    }

    if (record.requests > this.config.suspiciousThreshold) {
      record.suspiciousActivity++;
    }

    return { allowed: true };
  }

  private block(
    key: string,
    record: IPRecord,
    now: number,
    details: string,
  ): { allowed: boolean; retryAfter: number } {
    record.suspiciousActivity++;
    record.isBlocked = true;
    record.blockedUntil = now + this.config.blockDurationMs;

    this.onEvent({ type: "rate_limit", identifier: key, details });

    return {
      allowed: false,
      retryAfter: Math.ceil(this.config.blockDurationMs / 1000),
    };
  }

  sweep(now: number = Date.now()) {
    for (const [key, record] of this.callers.entries()) {
      if (record.isBlocked && now > record.blockedUntil) {
        record.isBlocked = false;
        record.requests = 0;
        record.suspiciousActivity = 0;
        record.firstRequest = now;
        continue;
      }
      if (!record.isBlocked && now - record.firstRequest > 5 * 60 * 1000) {
        this.callers.delete(key);
      }
    }
    evictOldest(this.callers, this.maxStoreSize, (r) => r.firstRequest);
  }

  clear() {
    this.callers.clear();
  }

  dispose() {
    clearInterval(this.sweepTimer);
  }
}

export type SecurityEvent = {
  type:
    | "rate_limit"
    | "injection_attempt"
    | "auth_failure"
    | "validation_error";
  identifier: string;
  details?: string;
  timestamp: number;
};

const FLUSH_INTERVAL = 5000;
// Keep batch size small enough that PG parameter count (5 cols × N rows) never
// approaches the 65535 limit.
const MAX_BATCH_SIZE = 25;
// Prevent unbounded queue growth during log storms.
const MAX_QUEUE_SIZE = 500;
const RATE_LIMIT_LOG_COOLDOWN_MS = 60 * 60 * 1_000;

/** Batches security events to the audit log, with its own queue and timer. */
export class SecurityEventLog {
  private readonly queue: Omit<SecurityEvent, "timestamp">[] = [];
  /** Last log time per rate_limit identifier, to suppress storms. */
  private readonly cooldowns = new Map<string, number>();
  private readonly flushTimer: NodeJS.Timeout;

  constructor(flushIntervalMs: number = FLUSH_INTERVAL) {
    this.flushTimer = setInterval(() => void this.flush(), flushIntervalMs);
  }

  record(event: Omit<SecurityEvent, "timestamp">) {
    if (event.type === "rate_limit" && this.suppressed(event.identifier)) {
      return;
    }

    if (this.queue.length < MAX_QUEUE_SIZE) {
      this.queue.push(event);
    }

    if (
      event.type === "injection_attempt" ||
      this.queue.length >= MAX_BATCH_SIZE
    ) {
      void this.flush();
    }
  }

  private suppressed(identifier: string): boolean {
    const now = Date.now();
    const lastLogged = this.cooldowns.get(identifier);
    if (lastLogged && now - lastLogged < RATE_LIMIT_LOG_COOLDOWN_MS) {
      return true;
    }
    this.cooldowns.set(identifier, now);

    if (this.cooldowns.size > 10000) {
      for (const [id, ts] of this.cooldowns.entries()) {
        if (now - ts > RATE_LIMIT_LOG_COOLDOWN_MS) this.cooldowns.delete(id);
      }
    }
    return false;
  }

  /** identifier can be a raw userId UUID, 'user:UUID', or an IP address. */
  private resolveUserId(identifier: string): string | null {
    if (identifier.startsWith("user:")) return identifier.split(":")[1] ?? null;
    if (
      identifier.startsWith("ip-") ||
      identifier.includes(".") ||
      identifier.includes(":")
    ) {
      return null;
    }
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identifier,
    )
      ? identifier
      : null;
  }

  async flush() {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, MAX_BATCH_SIZE);

    if (!db) {
      this.requeue(batch);
      // stderr, not a file: this used to append to a source path relative to
      // the working directory, which does not exist in the deployed container.
      // eslint-disable-next-line no-console
      console.error(
        `[Security] CRITICAL: DB unavailable, ${batch.length} security logs affected.`,
      );
      return;
    }

    try {
      const values = batch.map((event) => ({
        action: event.type,
        userId: this.resolveUserId(event.identifier),
        resourceId: event.identifier,
        metadata: {
          details: event.details
            ? event.details.replace(/(password|token|secret)=[^&]*/gi, "$1=***")
            : undefined,
        },
        severity: (event.type === "injection_attempt"
          ? "critical"
          : event.type === "auth_failure"
            ? "warn"
            : "info") as "critical" | "warn" | "info",
      }));

      await db.insert(auditLogs).values(values);

      // The high-volume writer, so retention is driven from here: rate-limit
      // and injection events accumulate without any admin taking an action.
      const { maybePruneAuditLogs } = await import("./audit");
      maybePruneAuditLogs(db);
    } catch (err) {
      const requeued = this.requeue(batch);
      const dropped = batch.length - requeued;
      // eslint-disable-next-line no-console
      console.error(
        `[Security] Error flushing ${batch.length} logs: ${String(err)}`,
      );
      if (dropped > 0) {
        // eslint-disable-next-line no-console
        console.error(
          `[Security] Dropped ${dropped} security log(s): the retry queue is full.`,
        );
      }
    }
  }

  /** Retried on the next interval, up to the remaining capacity. */
  private requeue(batch: Omit<SecurityEvent, "timestamp">[]): number {
    const room = Math.max(0, MAX_QUEUE_SIZE - this.queue.length);
    const requeue = batch.slice(0, room);
    if (requeue.length > 0) this.queue.unshift(...requeue);
    return requeue.length;
  }

  dispose() {
    clearInterval(this.flushTimer);
  }
}

/**
 * The client address, taken from the right-hand end of X-Forwarded-For.
 *
 * The left-hand entries are whatever the caller sent — reading `[0]` means the
 * caller picks their own rate-limit bucket, which makes every limit here a
 * no-op (rotate the header, get a fresh bucket every request) and lets them
 * pin a bucket to a victim's address to have that victim blocked. Only the
 * entries our own proxies appended can be trusted, and those are at the end.
 */
export class ClientIpResolver {
  /**
   * Logged once per instance, so the hop count can be checked against reality
   * instead of assumed. Getting it wrong is silent both ways: too few and a CDN
   * address becomes everyone's bucket; too many and the value is
   * caller-supplied, letting somebody pick their own bucket.
   */
  private logged = false;

  constructor(
    private readonly trustedProxyHops: number = Number(
      process.env.TRUSTED_PROXY_HOPS ?? 1,
    ),
  ) {}

  resolve(forwardedFor: string | null | undefined): string {
    const parts = (forwardedFor ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!this.logged && parts.length > 0) {
      this.logged = true;
      // eslint-disable-next-line no-console
      console.log(
        `[Security] x-forwarded-for has ${parts.length} entr${parts.length === 1 ? "y" : "ies"}; TRUSTED_PROXY_HOPS=${this.trustedProxyHops} selects index ${Math.max(0, parts.length - 1 - this.trustedProxyHops)}. Expect hops = entries - 1.`,
      );
    }

    if (parts.length === 0) return "unknown";

    const index = Math.max(0, parts.length - 1 - this.trustedProxyHops);
    return parts[index] ?? parts[parts.length - 1] ?? "unknown";
  }
}

// One instance each per process. The exported functions below are the API the
// rest of the codebase already calls; they delegate here.
const ipResolver = new ClientIpResolver();
export const securityEventLog = new SecurityEventLog();
export const rateLimiter = new TokenBucketLimiter();
const floodGuard = new FloodGuard(DDOS_CONFIG, (event) =>
  securityEventLog.record(event),
);

export const resolveClientIp = (forwardedFor: string | null | undefined) =>
  ipResolver.resolve(forwardedFor);

export function rateLimit(
  identifier: string,
  maxTokens: number,
  refillRatePerSecond: number,
  tokensToConsume: number = 1,
): { allowed: boolean; retryAfter?: number } {
  return rateLimiter.consume(
    identifier,
    maxTokens,
    refillRatePerSecond,
    tokensToConsume,
  );
}

export function logSecurityEvent(event: Omit<SecurityEvent, "timestamp">) {
  securityEventLog.record(event);
}

export function ddosProtection(key: string): {
  allowed: boolean;
  retryAfter?: number;
} {
  return floodGuard.check(key);
}

export const RATE_LIMITS = {
  public: {
    maxTokens: 1000,
    refillRate: 50,
    queryTokens: 1,
    mutationTokens: 3,
  },
  authenticated: {
    // Raised from 100 so legitimate multi-step form users are not blocked.
    maxTokens: 300,
    refillRate: 5,
    queryTokens: 1,
    mutationTokens: 2,
  },
  judge: {
    maxTokens: 200,
    refillRate: 5,
    queryTokens: 1,
    mutationTokens: 1,
  },
  admin: {
    maxTokens: 150,
    refillRate: 3,
    queryTokens: 1,
    mutationTokens: 2,
  },
} as const;

export function validateRequestSize(
  payload: unknown,
  maxSizeBytes: number = 1024 * 100,
): boolean {
  try {
    const jsonString = JSON.stringify(payload);
    return new TextEncoder().encode(jsonString).length <= maxSizeBytes;
  } catch {
    return false;
  }
}

/*
 * `sanitizeInput`, `validateEmail`, `validateUrl`, `validateUUID`,
 * `getRecentSecurityEvents` and `getDdosStats` used to live here with no
 * callers. Sanitization has one implementation (`scrubMarkup` in trpc.ts) and
 * every input is validated by its procedure's zod schema.
 */
