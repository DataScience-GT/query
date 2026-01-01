import { TRPCError } from "@trpc/server";
import sanitizeHtml from "sanitize-html";
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimit(identifier: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

export function sanitizeInput(input: any): any {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    let sanitized = sanitizeHtml(String(input));

    return sanitized
      .trim()
      .slice(0, 10000);
  }

  if (Array.isArray(input)) {
    if (input.length > 1000) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Array too large",
      });
    }
    return input.map(sanitizeInput);
  }

  if (typeof input === 'object') {
    const keys = Object.keys(input);
    if (keys.length > 100) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Object too complex",
      });
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Sanitize keys too
      const cleanKey = key.replace(/[^\w\-]/g, '').slice(0, 100);
      if (cleanKey) {
        sanitized[cleanKey] = sanitizeInput(value);
      }
    }
    return sanitized;
  }

  return input;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}