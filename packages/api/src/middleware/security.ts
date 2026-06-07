import { TRPCError } from "@trpc/server";
import sanitizeHtml from "sanitize-html";

interface RateLimitRecord {
  tokens: number;
  lastRefill: number;
  violations: number;
  blockedUntil: number;
}

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

const enforceSizeLimit = () => {
  const now = Date.now();

  // Cleanup rate limit store - remove oldest entries when over limit
  while (rateLimitStore.size > MAX_RATE_LIMIT_STORE_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.lastRefill < oldestTime) {
        oldestTime = value.lastRefill;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      rateLimitStore.delete(oldestKey);
    }
  }

  // Cleanup IP tracking store - remove old entries
  while (ipTrackingStore.size > MAX_IP_TRACKING_STORE_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [ip, record] of ipTrackingStore.entries()) {
      if (now - record.firstRequest > 5 * 60 * 1000 && now < record.blockedUntil) {
        if (record.firstRequest < oldestTime) {
          oldestTime = record.firstRequest;
          oldestKey = ip;
        }
      }
    }
    if (oldestKey) {
      ipTrackingStore.delete(oldestKey);
    }
  }

  // Remove expired records
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.blockedUntil) {
      rateLimitStore.delete(key);
    }
  }

  // Cleanup non-blocked IPs older than 5 minutes
  for (const [ip, record] of ipTrackingStore.entries()) {
    if (!record.isBlocked && now - record.firstRequest > 5 * 60 * 1000) {
      ipTrackingStore.delete(ip);
    }
  }
};

// Run cleanup every minute
setInterval(enforceSizeLimit, 60 * 1000);

// DDoS Protection Configuration
// These thresholds are intentionally lower than the absolute limits to allow headroom
const DDOS_CONFIG = {
  // Rate limits are configurable via environment variables
  maxRequestsPerMinute: Number(process.env.DDOS_MAX_REQUESTS_PER_MINUTE) || 1000, // Adjusted for safe operation
  suspiciousThreshold: Number(process.env.DDOS_SUSPICIOUS_THRESHOLD) || 700, // Lower threshold for safety
  blockDurationMs: Number(process.env.DDOS_BLOCK_DURATION_MS) || 5 * 60 * 1000,
  burstThreshold: Number(process.env.DDOS_BURST_THRESHOLD) || 100, // Reduced for safety
  burstWindowMs: Number(process.env.DDOS_BURST_WINDOW_MS) || 5 * 1000,
  cleanupIntervalMs: Number(process.env.DDOS_CLEANUP_INTERVAL_MS) || 60 * 1000,
};

// Log configuration for debugging
console.log(`[DDoS Config] Using thresholds: ${DDOS_CONFIG.maxRequestsPerMinute}/min, burst at ${DDOS_CONFIG.burstThreshold} in ${DDOS_CONFIG.burstWindowMs}ms`);

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
  tokensToConsume: number = 1
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let record = rateLimitStore.get(identifier);

  if (!record) {
    record = {
      tokens: maxTokens,
      lastRefill: now,
      violations: 0,
      blockedUntil: 0,
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

  if (record.tokens < tokensToConsume) {
    record.violations++;
    const backoffSeconds = Math.min(Math.pow(2, record.violations - 1), 300);
    record.blockedUntil = now + backoffSeconds * 1000;

    return {
      allowed: false,
      retryAfter: backoffSeconds,
    };
  }

  record.tokens -= tokensToConsume;

  if (record.violations > 0 && elapsed > 600) {
    record.violations = Math.max(0, record.violations - 1);
  }

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
    maxTokens: 300,  // Raised from 100 to prevent legitimate multi-step form users from being blocked
    refillRate: 5,   // Raised from 2 to recover faster between form steps
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

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  nonTextTags: ['style', 'script', 'textarea', 'noscript', 'option', 'xmp'],
};

export function sanitizeInput(input: unknown, depth: number = 0): unknown {
  if (depth > 10) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Input too deeply nested",
    });
  }

  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    const sanitized = sanitizeHtml(input, SANITIZE_OPTIONS)
      .trim()
      .slice(0, 10000);

    if (hasInjectionPattern(sanitized)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid input",
      });
    }

    return sanitized;
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid number",
      });
    }
    return input;
  }

  if (typeof input === 'boolean') {
    return input;
  }

  if (Array.isArray(input)) {
    if (input.length > 500) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Array too large",
      });
    }
    return input.map(item => sanitizeInput(item, depth + 1));
  }

  if (typeof input === 'object') {
    const keys = Object.keys(input as object);
    if (keys.length > 50) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Object too complex",
      });
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as object)) {
      if (!/^[\w.-]{1,100}$/.test(key)) {
        continue;
      }
      sanitized[key] = sanitizeInput(value, depth + 1);
    }
    return sanitized;
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Invalid input type",
  });
}

function hasInjectionPattern(str: string): boolean {
  const patterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|into|table|database)\b)/i,
    /(--|#|\/\*)/,
    /(\bor\b|\band\b)\s*[\d\w]+\s*=\s*[\d\w]+/i,
    /\$where/i,
    /\$gt|\$lt|\$ne|\$eq/i,
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
  ];

  return patterns.some(pattern => pattern.test(str));
}

export function validateEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
}

export function validateUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) && url.length <= 2048;
  } catch {
    return false;
  }
}

export function validateUUID(uuid: string): boolean {
  if (typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export type SecurityEvent = {
  type: 'rate_limit' | 'injection_attempt' | 'auth_failure' | 'validation_error';
  identifier: string;
  details?: string;
  timestamp: number;
};

const securityLog: SecurityEvent[] = [];
const MAX_LOG_SIZE = 1000;

import { db, auditLogs } from "@query/db";

const flushQueue: Omit<SecurityEvent, 'timestamp'>[] = [];
const FLUSH_INTERVAL = 5000;
// Keep batch size small enough that PG parameter count (5 cols × N rows) never approaches the 65535 limit
const MAX_BATCH_SIZE = 25;
// Prevent unbounded queue growth during log storms
const MAX_QUEUE_SIZE = 500;
// Deduplication: track last log time per rate_limit identifier to suppress storms
const rateLimitLogCooldown = new Map<string, number>();
const RATE_LIMIT_LOG_COOLDOWN_MS = 10_000; // only log once per 10s per identifier

async function flushLogs() {
  if (flushQueue.length === 0) return;

  const batch = flushQueue.splice(0, MAX_BATCH_SIZE);

  if (!db) {
    // DB unavailable — re-queue events (up to the cap) so they are not silently dropped
    const requeue = batch.slice(0, MAX_QUEUE_SIZE - flushQueue.length);
    flushQueue.unshift(...requeue);
    console.error(`[Security] CRITICAL: DB unavailable, ${batch.length - requeue.length} security logs dropped (queue full). ${requeue.length} re-queued.`);
    try {
      const fs = await import("fs");
      const errorLog = `[${new Date().toISOString()}] [Security] CRITICAL: DB unavailable, ${batch.length} security logs affected.\n`;
      fs.appendFile("packages/api/src/.security-errors.log", errorLog, { encoding: "utf8" }, () => {});
    } catch {
      // Ignore fs errors
    }
    return;
  }

  try {
    const values = batch.map(event => {
      const safeDetails = event.details ? event.details.replace(/(password|token|secret)=[^&]*/gi, '$1=***') : undefined;
      const severity = event.type === 'injection_attempt' ? 'critical' :
        event.type === 'auth_failure' ? 'warn' : 'info';

      // identifier can be a raw userId UUID, 'user:UUID', or an IP address
      let resolvedUserId: string | null = null;
      if (event.identifier.startsWith('user:')) {
        resolvedUserId = event.identifier.split(':')[1] ?? null;
      } else if (event.identifier.startsWith('ip-') || event.identifier.includes('.') || event.identifier.includes(':')) {
        // IP address — no userId
        resolvedUserId = null;
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.identifier)) {
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
    console.log(`[Security] Flushed ${batch.length} security events to audit logs`);
  } catch (err) {
    const errorMsg = `[Security] Error flushing ${batch.length} logs: ${String(err)}`;
    console.error(errorMsg);

    // Re-queue failed events so they are retried on the next flush interval.
    // Only re-queue up to the remaining capacity to prevent unbounded growth.
    const requeue = batch.slice(0, MAX_QUEUE_SIZE - flushQueue.length);
    if (requeue.length > 0) {
      flushQueue.unshift(...requeue);
    }
    const dropped = batch.length - requeue.length;
    if (dropped > 0) {
      console.error(`[Security] ${dropped} log(s) permanently dropped (queue at capacity).`);
    }

    try {
      const fs = await import("fs");
      const errorLog = new Date().toISOString() + "\n" + errorMsg + "\n";
      fs.appendFile("packages/api/src/.security-errors.log", errorLog, { encoding: "utf8" }, () => {});
    } catch {
      // Ignore fs errors
    }
  }
}

// Start flush timer
setInterval(() => {
  void flushLogs();
}, FLUSH_INTERVAL);

export function logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>) {
  const now = Date.now();

  // Deduplicate rate_limit events: suppress repeat logs for the same identifier
  // within the cooldown window to prevent audit log storms under heavy rate limiting.
  if (event.type === 'rate_limit') {
    const lastLogged = rateLimitLogCooldown.get(event.identifier);
    if (lastLogged && now - lastLogged < RATE_LIMIT_LOG_COOLDOWN_MS) {
      return; // Suppressed — already logged recently for this identifier
    }
    rateLimitLogCooldown.set(event.identifier, now);

    // Prune cooldown map periodically to prevent memory leak
    if (rateLimitLogCooldown.size > 10000) {
      for (const [id, ts] of rateLimitLogCooldown.entries()) {
        if (now - ts > RATE_LIMIT_LOG_COOLDOWN_MS) rateLimitLogCooldown.delete(id);
      }
    }
  }

  // Keep in-memory for immediate/short-term checks
  securityLog.push({ ...event, timestamp: now });
  if (securityLog.length > MAX_LOG_SIZE) {
    securityLog.shift();
  }

  // Queue for DB persistence — respect the cap
  if (flushQueue.length < MAX_QUEUE_SIZE) {
    flushQueue.push(event);
  } else {
    console.warn(`[Security] Flush queue at capacity (${MAX_QUEUE_SIZE}). Event dropped: ${event.type}/${event.identifier}`);
  }

  // Instant flush if critical or queue is at batch threshold
  if (event.type === 'injection_attempt' || flushQueue.length >= MAX_BATCH_SIZE) {
    void flushLogs();
  }
}

export function getRecentSecurityEvents(minutes: number = 60): SecurityEvent[] {
  const cutoff = Date.now() - minutes * 60 * 1000;
  return securityLog.filter(e => e.timestamp > cutoff);
}

export function ddosProtection(clientIp: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();

  // Get or create IP record
  let record = ipTrackingStore.get(clientIp);
  if (!record) {
    record = {
      requests: 0,
      firstRequest: now,
      suspiciousActivity: 0,
      isBlocked: false,
      blockedUntil: 0,
    };
    ipTrackingStore.set(clientIp, record);
  }

  // Check if IP is blocked
  if (record.isBlocked && now < record.blockedUntil) {
    logSecurityEvent({
      type: 'rate_limit',
      identifier: clientIp,
      details: `Blocked IP attempted access`,
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
  if (elapsed < DDOS_CONFIG.burstWindowMs && record.requests > DDOS_CONFIG.burstThreshold) {
    record.suspiciousActivity++;
    record.isBlocked = true;
    record.blockedUntil = now + DDOS_CONFIG.blockDurationMs;

    logSecurityEvent({
      type: 'rate_limit',
      identifier: clientIp,
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
      type: 'rate_limit',
      identifier: clientIp,
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

export function validateRequestSize(payload: unknown, maxSizeBytes: number = 1024 * 100): boolean {
  try {
    const jsonString = JSON.stringify(payload);
    return new TextEncoder().encode(jsonString).length <= maxSizeBytes;
  } catch {
    return false;
  }
}

export function getDdosStats(): {
  totalTrackedIPs: number;
  blockedIPs: number;
  suspiciousIPs: number;
} {
  let blockedCount = 0;
  let suspiciousCount = 0;

  for (const record of ipTrackingStore.values()) {
    if (record.isBlocked) blockedCount++;
    if (record.suspiciousActivity > 0) suspiciousCount++;
  }

  return {
    totalTrackedIPs: ipTrackingStore.size,
    blockedIPs: blockedCount,
    suspiciousIPs: suspiciousCount,
  };
}
