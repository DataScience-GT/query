import { initTRPC, TRPCError } from "@trpc/server";
import type { TRPCDefaultErrorShape } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import { rateLimit, RATE_LIMITS, sanitizeInput, logSecurityEvent, ddosProtection, validateRequestSize } from "./middleware/security";

export const errorFormatter = ({ shape, error }: {
  shape: TRPCDefaultErrorShape;
  error: TRPCError;
}) => {
  const isDev = process.env.NODE_ENV === 'development';
  return {
    ...shape,
    message: error.code === 'INTERNAL_SERVER_ERROR' && !isDev ? 'An unexpected error occurred' : shape.message,
    data: {
      ...shape.data,
      zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      stack: isDev ? shape.data.stack : undefined, // Mask stack in production
    },
  };
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter,
});

export const createTRPCRouter = t.router;

const requiresDb = t.middleware(async ({ ctx, next }) => {
  if (!ctx.db) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Database unavailable",
    });
  }

  return next({
    ctx: {
      ...ctx,
      db: ctx.db,
    },
  });
});

const sanitizeInputs = t.middleware(async ({ next, ctx, getRawInput }) => {
  const rawInput = await getRawInput();

  if (rawInput != null) {
    if (!validateRequestSize(rawInput)) {
      logSecurityEvent({
        type: 'validation_error',
        identifier: ctx.userId ?? ctx.clientIp,
        details: 'Request payload too large',
      });
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: "Request payload is too large",
      });
    }
    sanitizeInput(rawInput);
  }

  return next();
});

const enforceContentType = t.middleware(async ({ ctx, next, type }) => {
  if (type === 'mutation' && ctx.req) {
    const contentType = ctx.req.headers.get('content-type') || '';
    const isJson = contentType.toLowerCase().includes('application/json');
    const isMultipart = contentType.toLowerCase().includes('multipart/form-data');
    if (contentType && !isJson && !isMultipart) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid Content-Type for mutation request",
      });
    }
  }
  return next();
});

const uploadSanitizeInputs = t.middleware(async ({ next, ctx, getRawInput }) => {
  // Allow up to 2MB for base64 image uploads
  const rawInput = await getRawInput();

  if (rawInput && !validateRequestSize(rawInput, 2 * 1024 * 1024)) {
    logSecurityEvent({
      type: 'validation_error',
      identifier: ctx.userId ?? ctx.clientIp,
      details: 'Upload payload too large (max 2MB)',
    });
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "Image payload is too large (>2MB)",
    });
  }

  // We intentionally skip the recursive `sanitizeInput` here because it truncates
  // strings longer than 10,000 characters (base64 strings are much larger).
  // The zod validator on the procedure will ensure it's a valid data URI structure.

  const result = await next();

  if (!result.ok) {
    logSecurityEvent({
      type: 'validation_error',
      identifier: ctx.userId ?? 'unknown',
      details: 'Upload Procedure failed',
    });
  }

  return result;
});

/**
 * Surgical cache invalidation: each mutation path maps to the exact cache key
 * patterns it should evict, rather than blindly wiping an entire namespace.
 * Unmapped routes fall back to namespace-level eviction.
 */
const CACHE_INVALIDATION_MAP: Record<string, string[]> = {
  // Hackathon mutations — scope by what actually changed
  "hackathon.register":              ["hackathon:*:participants", "hackathon:*:analytics"],
  "hackathon.updateParticipantStatus": ["hackathon:*:participants", "hackathon:*:analytics"],
  "hackathon.batchUpdateParticipantStatus": ["hackathon:*:participants", "hackathon:*:analytics"],
  "hackathon.scanParticipantPass":   ["hackathon:*:participants"],
  "hackathon.create":                ["hackathons:list"],
  "hackathon.update":                ["hackathons:list", "hackathon:*"],
  "hackathon.delete":                ["hackathons:list", "hackathon:*"],
  "hackathon.createEvent":           ["hackathon:*:events"],
  "hackathon.updateEvent":           ["hackathon:*:events"],
  "hackathon.deleteEvent":           ["hackathon:*:events"],
  // Judge mutations — only invalidate judging-related keys
  "judge.submitVote":                ["hackathon:*:rankings", "hackathon:*:judge-analytics"],
  "judge.completeAndNext":           ["hackathon:*:rankings", "hackathon:*:judge-analytics"],
  "judge.toggleJudging":             ["hackathon:*"],
  "judge.assignJudgesToProjects":    ["hackathon:*:rankings", "hackathon:*:judge-analytics"],
  "judge.assignToHackathon":         ["judge:*"],
  // Member mutations
  "member.update":                   ["member:*", "user:*:profile"],
  // Stripe — invalidate member status after linking
  "stripe.attemptAutoLink":          ["member:*"],
  "stripe.linkAccount":              ["member:*"],
  // Events (club check-ins)
  "events.create":                   ["events:list"],
  "events.delete":                   ["events:list"],
  "events.toggleCheckIn":            ["events:list"],
  "events.checkIn":                  ["events:list", "member:*"],
};

const cacheInvalidationMiddleware = t.middleware(async ({ ctx, next, type, path }) => {
  const result = await next();

  if (type === 'mutation' && result.ok) {
    const patterns = CACHE_INVALIDATION_MAP[path];
    if (patterns) {
      for (const pattern of patterns) ctx.cache.deletePattern(pattern);
    } else {
      // Fallback: evict the whole namespace (safe but broad)
      const namespace = path.split('.')[0];
      if (namespace) ctx.cache.deletePattern(`${namespace}:*`);
    }
  }

  return result;
});

export const publicProcedure = t.procedure
  .use(sanitizeInputs)
  .use(enforceContentType)
  .use(async ({ ctx, next, type }) => {
    // DDoS Protection - check IP-based limits first
    const ddosCheck = ddosProtection(ctx.clientIp);
    if (!ddosCheck.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests from your IP. Please try again in ${ddosCheck.retryAfter} seconds.`,
      });
    }

    const identifier = ctx.userId || `ip-${ctx.clientIp}`;
    const config = RATE_LIMITS.public;
    const tokens = type === 'mutation' ? config.mutationTokens : config.queryTokens;

    const result = rateLimit(identifier, config.maxTokens, config.refillRate, tokens);

    if (!result.allowed) {
      logSecurityEvent({
        type: 'rate_limit',
        identifier,
        details: `Public ${type} blocked, retry after ${result.retryAfter}s`,
      });

      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Please try again in ${result.retryAfter} seconds.`,
      });
    }

    return next();
  });

const isAuthed = t.middleware(async ({ ctx, next, type }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  const config = RATE_LIMITS.authenticated;
  const tokens = type === 'mutation' ? config.mutationTokens : config.queryTokens;

  const result = rateLimit(`auth-${ctx.userId}`, config.maxTokens, config.refillRate, tokens);

  if (!result.allowed) {
    logSecurityEvent({
      type: 'rate_limit',
      identifier: ctx.userId,
      details: `Authenticated ${type} blocked, retry after ${result.retryAfter}s`,
    });

    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many requests. Please try again in ${result.retryAfter} seconds.`,
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

export const protectedProcedure = t.procedure
  .use(requiresDb)
  .use(isAuthed)
  .use(sanitizeInputs)
  .use(enforceContentType)
  .use(cacheInvalidationMiddleware);

export const uploadProcedure = t.procedure
  .use(requiresDb)
  .use(isAuthed)
  .use(uploadSanitizeInputs)
  .use(enforceContentType)
  .use(cacheInvalidationMiddleware);

export const judgeProcedure = t.procedure
  .use(requiresDb)
  .use(isAuthed)
  .use(sanitizeInputs)
  .use(enforceContentType)
  .use(cacheInvalidationMiddleware);

export const adminProcedure = t.procedure
  .use(requiresDb)
  .use(isAuthed)
  .use(sanitizeInputs)
  .use(enforceContentType)
  .use(cacheInvalidationMiddleware);
