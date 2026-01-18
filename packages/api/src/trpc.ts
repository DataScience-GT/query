import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import { rateLimit, RATE_LIMITS, sanitizeInput, logSecurityEvent, ddosProtection, validateRequestSize } from "./middleware/security";
import { CacheKeys } from "./middleware/cache";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure.use(async ({ ctx, next, type }) => {
  // DDoS Protection - check IP-based limits first
  const ddosCheck = ddosProtection(ctx.clientIp);
  if (!ddosCheck.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many requests from your IP. Please try again in ${ddosCheck.retryAfter} seconds.`,
    });
  }

  // Token-based rate limiting
  const identifier = ctx.userId || `anon-${ctx.session?.user?.id || 'unknown'}`;
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
  // DDoS Protection - check IP-based limits first
  const ddosCheck = ddosProtection(ctx.clientIp);
  if (!ddosCheck.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many requests from your IP. Please try again in ${ddosCheck.retryAfter} seconds.`,
    });
  }

  if (!ctx.session?.user || !ctx.userId) {
    logSecurityEvent({
      type: 'auth_failure',
      identifier: ctx.clientIp,
      details: 'Missing session or userId',
    });

    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
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
      session: { ...ctx.session, user: ctx.session.user },
      userId: ctx.userId,
    },
  });
});

const sanitizeInputs = t.middleware(async ({ next, ctx, getRawInput }) => {
  // Get raw input for validation
  const rawInput = await getRawInput();

  // Validate request size (prevent large payload attacks)
  if (rawInput && !validateRequestSize(rawInput)) {
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

  // Validate the raw input - this throws if invalid patterns are detected
  // We don't modify the input, just validate it for security issues
  sanitizeInput(rawInput);

  // Continue with the original input (Zod validation handles type checking)
  const result = await next();

  if (!result.ok) {
    logSecurityEvent({
      type: 'validation_error',
      identifier: ctx.userId ?? 'unknown',
      details: 'Procedure failed',
    });
  }

  return result;
});

const cacheInvalidationMiddleware = t.middleware(async ({ ctx, next, type, path }) => {
  // Execute the procedure first
  const result = await next();

  // For mutations, invalidate related cache entries
  if (type === 'mutation') {
    const namespace = path.split('.')[0];
    if (namespace) {
      // Invalidate all query cache for this namespace
      ctx.cache.deletePattern(`query:${namespace}.*`);
    }
  }

  return result;
});

export const protectedProcedure = t.procedure
  .use(isAuthed)
  .use(sanitizeInputs)
  .use(cacheInvalidationMiddleware);

export const judgeProcedure = t.procedure
  .use(async ({ ctx, next, type }) => {
    if (!ctx.session?.user || !ctx.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const config = RATE_LIMITS.judge;
    const tokens = type === 'mutation' ? config.mutationTokens : config.queryTokens;

    const result = rateLimit(`judge-${ctx.userId}`, config.maxTokens, config.refillRate, tokens);

    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Please try again in ${result.retryAfter} seconds.`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: { ...ctx.session, user: ctx.session.user },
        userId: ctx.userId,
      },
    });
  })
  .use(sanitizeInputs)
  .use(cacheInvalidationMiddleware);

export const adminProcedure = t.procedure
  .use(async ({ ctx, next, type }) => {
    if (!ctx.session?.user || !ctx.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const config = RATE_LIMITS.admin;
    const tokens = type === 'mutation' ? config.mutationTokens : config.queryTokens;

    const result = rateLimit(`admin-${ctx.userId}`, config.maxTokens, config.refillRate, tokens);

    if (!result.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Please try again in ${result.retryAfter} seconds.`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: { ...ctx.session, user: ctx.session.user },
        userId: ctx.userId,
      },
    });
  })
  .use(sanitizeInputs)
  .use(cacheInvalidationMiddleware);
