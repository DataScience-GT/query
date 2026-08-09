
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

/** How long a caller must behave for one violation to be forgiven. */
const VIOLATION_DECAY_MS = 10 * 60 * 1000;

const MAX_RATE_LIMIT_STORE_SIZE = 10000; // Limit rate limit store size to prevent memory bloat
const MAX_IP_TRACKING_STORE_SIZE = 50000; // Limit IP tracking store size

const rateLimitStore = new Map<string, RateLimitRecord>();

interface IPRecord {
  requests: number;
  firstRequest: number;
  suspiciousActivity: number;
  isBlocked: boolean;
  blockedUntil: number;
}

const ipTrackingStore = new Map<string, IPRecord>();

/**
 * Number of proxies between the client and this process that append to
 * X-Forwarded-For. On Cloud Run / App Hosting behind Google's load balancer
 * that is 1, so the client is the second-to-last entry.
 */
const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);

/**
 * The client address, taken from the right-hand end of X-Forwarded-For.
 *
 * The left-hand entries are whatever the caller sent — reading `[0]` means the
 * caller picks their own rate-limit bucket, which makes every limit here a
 * no-op (rotate the header, get a fresh bucket every request) and lets them
 * pin a bucket to a victim's address to have that victim blocked. Only the
 * entries our own proxies appended can be trusted, and those are at the end.
 */
/**
 * Logged once per process, so the hop count can be checked against reality
 * instead of assumed.
 *
 * Getting TRUSTED_PROXY_HOPS wrong is silent in both directions and expensive
 * both ways: too few and a CDN address becomes everyone's bucket, so one
 * limit covers the entire internet; too many and the value is caller-supplied,
 * letting somebody pick their own bucket or pin a block onto a victim. One
 * line at startup is enough to confirm which shape the deployment actually
 * has, and costs nothing per request.
 */
let loggedForwardedForShape = false;

export const resolveClientIp = (forwardedFor: string | null | undefined) => {
  const parts = (forwardedFor ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!loggedForwardedForShape && parts.length > 0) {
    loggedForwardedForShape = true;
    // eslint-disable-next-line no-console
    console.log(
      `[Security] x-forwarded-for has ${parts.length} entr${parts.length === 1 ? "y" : "ies"}; TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS} selects index ${Math.max(0, parts.length - 1 - TRUSTED_PROXY_HOPS)}. Expect hops = entries - 1.`,
    );
  }

  if (parts.length === 0) return "unknown";

  const index = Math.max(0, parts.length - 1 - TRUSTED_PROXY_HOPS);
  return parts[index] ?? parts[parts.length - 1] ?? "unknown";
};

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

const enforceSizeLimit = () => {
  const now = Date.now();

  // Idle records first, so eviction usually has nothing left to do.
  //
  // Both halves of this condition matter. A healthy record carries
  // `blockedUntil: 0`, so testing that alone deleted EVERY bucket on every
  // tick — the whole token-bucket store was erased once a minute and each
  // caller got a fresh full bucket back regardless of how they had behaved,
  // which quietly made the limiter little more than a per-minute burst cap.
  for (const [key, value] of rateLimitStore.entries()) {
    const idle = now - value.lastRefill > 30 * 60 * 1000;
    const blockElapsed = now > value.blockedUntil;
    if (idle && blockElapsed) {
      rateLimitStore.delete(key);
    }
  }

  for (const [ip, record] of ipTrackingStore.entries()) {
    if (!record.isBlocked && now - record.firstRequest > 5 * 60 * 1000) {
      ipTrackingStore.delete(ip);
    }
  }

  evictOldest(rateLimitStore, MAX_RATE_LIMIT_STORE_SIZE, (v) => v.lastRefill);
  evictOldest(ipTrackingStore, MAX_IP_TRACKING_STORE_SIZE, (r) => r.firstRequest);
};

// Run cleanup every minute
setInterval(enforceSizeLimit, 60 * 1000);

// DDoS Protection Configuration
// These thresholds are intentionally lower than the absolute limits to allow headroom
const DDOS_CONFIG = {
  // Rate limits are configurable via environment variables
  maxRequestsPerMinute:
    Number(process.env.DDOS_MAX_REQUESTS_PER_MINUTE) || 1000, // Adjusted for safe operation
  suspiciousThreshold: Number(process.env.DDOS_SUSPICIOUS_THRESHOLD) || 700, // Lower threshold for safety
  blockDurationMs: Number(process.env.DDOS_BLOCK_DURATION_MS) || 5 * 60 * 1000,
  burstThreshold: Number(process.env.DDOS_BURST_THRESHOLD) || 100, // Reduced for safety
  burstWindowMs: Number(process.env.DDOS_BURST_WINDOW_MS) || 5 * 1000,
  cleanupIntervalMs: Number(process.env.DDOS_CLEANUP_INTERVAL_MS) || 60 * 1000,
};

// Cleanup expired records
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.lastRefill + 30 * 60 * 1000 && now > value.blockedUntil) {
      rateLimitStore.delete(key);
    }
  }
  // Cleanup IP tracking records older than 5 minutes
  for (const [ip, record] of ipTrackingStore.entries()) {
    if (now - record.firstRequest > 5 * 60 * 1000 && !record.isBlocked) {
      ipTrackingStore.delete(ip);
    }
    // Unblock IPs after block duration
    if (record.isBlocked && now > record.blockedUntil) {
      record.isBlocked = false;
      record.requests = 0;
      record.suspiciousActivity = 0;
      record.firstRequest = now;
    }
  }
}, DDOS_CONFIG.cleanupIntervalMs);

export function rateLimit(
  identifier: string,
  maxTokens: number,
  refillRatePerSecond: number,
  tokensToConsume: number = 1,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let record = rateLimitStore.get(identifier);

  if (!record) {
    record = {
      tokens: maxTokens,
      lastRefill: now,
      violations: 0,
      blockedUntil: 0,
      lastViolation: 0,
    };
    rateLimitStore.set(identifier, record);
  }

  if (now < record.blockedUntil) {
    return {
      allowed: false,
      retryAfter: Math.ceil((record.blockedUntil - now) / 1000),
    };
  }

  const elapsed = (now - record.lastRefill) / 1000;
  const refill = elapsed * refillRatePerSecond;
  record.tokens = Math.min(maxTokens, record.tokens + refill);
  record.lastRefill = now;

  // Decay one step per clear period since the last violation, so somebody who
  // tripped the limit once and then behaved normally returns to a clean slate
  // instead of carrying an escalating backoff for the rest of the weekend.
  // Applied before the check below so a caller who has waited out their
  // penalty is not immediately re-escalated from the old count.
  if (record.violations > 0 && record.lastViolation > 0) {
    const clearPeriods = Math.floor(
      (now - record.lastViolation) / VIOLATION_DECAY_MS,
    );
    if (clearPeriods > 0) {
      record.violations = Math.max(0, record.violations - clearPeriods);
    }
  }

  if (record.tokens < tokensToConsume) {
    record.violations++;
    record.lastViolation = now;
    const backoffSeconds = Math.min(Math.pow(2, record.violations - 1), 300);
    record.blockedUntil = now + backoffSeconds * 1000;

    return {
      allowed: false,
      retryAfter: backoffSeconds,
    };
  }

  record.tokens -= tokensToConsume;

  return { allowed: true };
}

export const RATE_LIMITS = {
  public: {
    maxTokens: 1000,
    refillRate: 50,
    queryTokens: 1,
    mutationTokens: 3,
  },
  authenticated: {
    maxTokens: 300, // Raised from 100 to prevent legitimate multi-step form users from being blocked
    refillRate: 5, // Raised from 2 to recover faster between form steps
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

/*
 * `sanitizeInput` and its injection-pattern list used to live here.
 *
 * It was a second sanitizer with different semantics from the one the request
 * path runs (`scrubMarkup` in trpc.ts): it STRIPPED markup rather than refusing
 * it, truncated every string at 10,000 characters, and rejected any prose
 * containing SQL keywords — "select a track from the list" among them. Nothing
 * called it; only the tests did, so the suite was describing behaviour the
 * product did not have. Sanitization has one implementation now.
 */

/*
 * `validateEmail`, `validateUrl` and `validateUUID` used to live here with no
 * callers: every input is validated by its procedure's zod schema, which is
 * where the error can name the field.
 */

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


import { db, auditLogs } from "@query/db";

const flushQueue: Omit<SecurityEvent, "timestamp">[] = [];
const FLUSH_INTERVAL = 5000;
// Keep batch size small enough that PG parameter count (5 cols × N rows) never approaches the 65535 limit
const MAX_BATCH_SIZE = 25;
// Prevent unbounded queue growth during log storms
const MAX_QUEUE_SIZE = 500;
// Deduplication: track last log time per rate_limit identifier to suppress storms
const rateLimitLogCooldown = new Map<string, number>();
const RATE_LIMIT_LOG_COOLDOWN_MS = 60 * 60 * 1_000; // only log once per 1 hour per identifier

async function flushLogs() {
  if (flushQueue.length === 0) return;

  const batch = flushQueue.splice(0, MAX_BATCH_SIZE);

  if (!db) {
    // DB unavailable — re-queue events (up to the cap) so they are not silently dropped
    const requeue = batch.slice(0, MAX_QUEUE_SIZE - flushQueue.length);
    flushQueue.unshift(...requeue);
    // stderr, not a file. This used to append to
    // "packages/api/src/.security-errors.log" — a source path relative to the
    // process working directory, which does not exist in the deployed
    // container. The ENOENT went to a swallowed callback, so the one message
    // saying security logging had stopped was itself silently dropped.
    // eslint-disable-next-line no-console
    console.error(
      `[Security] CRITICAL: DB unavailable, ${batch.length} security logs affected.`,
    );
    return;
  }

  try {
    const values = batch.map((event) => {
      const safeDetails = event.details
        ? event.details.replace(/(password|token|secret)=[^&]*/gi, "$1=***")
        : undefined;
      const severity =
        event.type === "injection_attempt"
          ? "critical"
          : event.type === "auth_failure"
            ? "warn"
            : "info";

      // identifier can be a raw userId UUID, 'user:UUID', or an IP address
      let resolvedUserId: string | null = null;
      if (event.identifier.startsWith("user:")) {
        resolvedUserId = event.identifier.split(":")[1] ?? null;
      } else if (
        event.identifier.startsWith("ip-") ||
        event.identifier.includes(".") ||
        event.identifier.includes(":")
      ) {
        // IP address — no userId
        resolvedUserId = null;
      } else if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          event.identifier,
        )
      ) {
        // Raw UUID — treat as userId
        resolvedUserId = event.identifier;
      }

      return {
        action: event.type,
        userId: resolvedUserId,
        resourceId: event.identifier,
        metadata: { details: safeDetails },
        severity: severity as "critical" | "warn" | "info",
      };
    });

    await db.insert(auditLogs).values(values);

    // The high-volume writer, so this is where retention most needs to be
    // driven from. Rate-limit and injection events accumulate without any
    // admin ever taking an action.
    const { maybePruneAuditLogs } = await import("./audit");
    maybePruneAuditLogs(db);
  } catch (err) {
    const errorMsg = `[Security] Error flushing ${batch.length} logs: ${String(err)}`;
    // Log flushing error handled via fallback file logging

    // Re-queue failed events so they are retried on the next flush interval.
    // Only re-queue up to the remaining capacity to prevent unbounded growth.
    const requeue = batch.slice(0, MAX_QUEUE_SIZE - flushQueue.length);
    if (requeue.length > 0) {
      flushQueue.unshift(...requeue);
    }
    const dropped = batch.length - requeue.length;

    // Same reasoning as above: the container collects stderr, not a file under
    // the source tree.
    // eslint-disable-next-line no-console
    console.error(errorMsg);
    if (dropped > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `[Security] Dropped ${dropped} security log(s): the retry queue is full.`,
      );
    }
  }
}

// Start flush timer
setInterval(() => {
  void flushLogs();
}, FLUSH_INTERVAL);

export function logSecurityEvent(event: Omit<SecurityEvent, "timestamp">) {
  const now = Date.now();

  // Deduplicate rate_limit events: suppress repeat logs for the same identifier
  // within the cooldown window to prevent audit log storms under heavy rate limiting.
  if (event.type === "rate_limit") {
    const lastLogged = rateLimitLogCooldown.get(event.identifier);
    if (lastLogged && now - lastLogged < RATE_LIMIT_LOG_COOLDOWN_MS) {
      return; // Suppressed — already logged recently for this identifier
    }
    rateLimitLogCooldown.set(event.identifier, now);

    // Prune cooldown map periodically to prevent memory leak
    if (rateLimitLogCooldown.size > 10000) {
      for (const [id, ts] of rateLimitLogCooldown.entries()) {
        if (now - ts > RATE_LIMIT_LOG_COOLDOWN_MS)
          rateLimitLogCooldown.delete(id);
      }
    }
  }

  // Queue for DB persistence — respect the cap
  if (flushQueue.length < MAX_QUEUE_SIZE) {
    flushQueue.push(event);
  } else {
    // Flush queue at capacity, event dropped
  }

  // Instant flush if critical or queue is at batch threshold
  if (
    event.type === "injection_attempt" ||
    flushQueue.length >= MAX_BATCH_SIZE
  ) {
    void flushLogs();
  }
}

/*
 * `getRecentSecurityEvents` used to read the in-memory ring below. Nothing
 * called it, and the ring lives in one instance of up to ten — the durable
 * record is the audit_log table, which /admin/audit now reads.
 */

/**
 * Coarse per-caller flood protection.
 *
 * `key` is an identity when we have one and an address only when we do not —
 * callers must prefix it (`user:` / `ip:`) so the two namespaces can never
 * collide. Keying on the address alone puts an entire venue behind one NAT into
 * a single bucket, which is exactly the crowd this is supposed to serve.
 */
export function ddosProtection(key: string): {
  allowed: boolean;
  retryAfter?: number;
} {
  const now = Date.now();

  let record = ipTrackingStore.get(key);
  if (!record) {
    record = {
      requests: 0,
      firstRequest: now,
      suspiciousActivity: 0,
      isBlocked: false,
      blockedUntil: 0,
    };
    ipTrackingStore.set(key, record);
  }

  if (record.isBlocked && now < record.blockedUntil) {
    logSecurityEvent({
      type: "rate_limit",
      identifier: key,
      details: `Blocked caller attempted access`,
    });
    return {
      allowed: false,
      retryAfter: Math.ceil((record.blockedUntil - now) / 1000),
    };
  }

  // Reset counter if window expired
  const elapsed = now - record.firstRequest;
  if (elapsed > 60 * 1000) {
    record.requests = 0;
    record.firstRequest = now;
  }

  // Increment request counter
  record.requests++;

  // Check for burst (too many requests in short window)
  if (
    elapsed < DDOS_CONFIG.burstWindowMs &&
    record.requests > DDOS_CONFIG.burstThreshold
  ) {
    record.suspiciousActivity++;
    record.isBlocked = true;
    record.blockedUntil = now + DDOS_CONFIG.blockDurationMs;

    logSecurityEvent({
      type: "rate_limit",
      identifier: key,
      details: `Burst attack detected: ${record.requests} requests in ${elapsed}ms`,
    });

    return {
      allowed: false,
      retryAfter: Math.ceil(DDOS_CONFIG.blockDurationMs / 1000),
    };
  }

  // Check for sustained attack
  if (record.requests > DDOS_CONFIG.maxRequestsPerMinute) {
    record.suspiciousActivity++;
    record.isBlocked = true;
    record.blockedUntil = now + DDOS_CONFIG.blockDurationMs;

    logSecurityEvent({
      type: "rate_limit",
      identifier: key,
      details: `Sustained attack: ${record.requests} requests/minute`,
    });

    return {
      allowed: false,
      retryAfter: Math.ceil(DDOS_CONFIG.blockDurationMs / 1000),
    };
  }

  // Mark as suspicious if approaching limits
  if (record.requests > DDOS_CONFIG.suspiciousThreshold) {
    record.suspiciousActivity++;
  }

  return { allowed: true };
}

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
 * `getDdosStats` used to expose per-instance counters that nothing read.
 */
