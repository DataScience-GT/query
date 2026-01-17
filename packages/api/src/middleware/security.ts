import { TRPCError } from "@trpc/server";
import sanitizeHtml from "sanitize-html";

interface RateLimitRecord {
  tokens: number;
  lastRefill: number;
  violations: number;
  blockedUntil: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.lastRefill + 30 * 60 * 1000 && now > value.blockedUntil) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

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
    maxTokens: 30,
    refillRate: 0.5,
    queryTokens: 1,
    mutationTokens: 3,
  },
  authenticated: {
    maxTokens: 100,
    refillRate: 2,
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
      if (!/^[\w\-\.]{1,100}$/.test(key)) {
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
    /(--|\#|\/\*)/,
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

export function logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>) {
  securityLog.push({ ...event, timestamp: Date.now() });
  if (securityLog.length > MAX_LOG_SIZE) {
    securityLog.shift();
  }
}

export function getRecentSecurityEvents(minutes: number = 60): SecurityEvent[] {
  const cutoff = Date.now() - minutes * 60 * 1000;
  return securityLog.filter(e => e.timestamp > cutoff);
}
