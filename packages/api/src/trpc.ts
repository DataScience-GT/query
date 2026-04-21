import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";
import type { Context } from "./context";
import { rateLimit, RATE_LIMITS, sanitizeInput, logSecurityEvent, ddosProtection, validateRequestSize } from "./middleware/security";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const isDev = process.env.NODE_ENV === 'development';
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
        stack: isDev ? shape.data.stack : undefined, // Mask stack in production
      },
    };
  },
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

const cacheInvalidationMiddleware = t.middleware(async ({ ctx, next, type, path }) => {
  const result = await next();

  // Only invalidate on successful mutations — no-op on failures or queries
  if (type === 'mutation' && result.ok) {
    const namespace = path.split('.')[0];
    if (namespace) {
      ctx.cache.deletePattern(`${namespace}:*`);
    }
  }

  return result;
});

export const publicProcedure = t.procedure
  .use(sanitizeInputs)
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

export const protectedProcedure = t.procedure
  .use(requiresDb)
  .use(isAuthed)
  .use(sanitizeInputs)
  .use(cacheInvalidationMiddleware);

export const uploadProcedure = t.procedure
  .use(requiresDb)
  .use(isAuthed)
  .use(uploadSanitizeInputs)
  .use(cacheInvalidationMiddleware);

export const judgeProcedure = t.procedure
  .use(requiresDb)
  .use(async ({ ctx, next, type }) => {
    if (!ctx.session?.user || !ctx.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const judge = await ctx.db.query.judges.findFirst({
      where: (j, { eq }) => eq(j.userId, ctx.userId!),
    });

    if (!judge || !judge.isActive) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Judge access required",
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
  .use(requiresDb)
  .use(async ({ ctx, next, type }) => {
    if (!ctx.session?.user || !ctx.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const admin = await ctx.db.query.admins.findFirst({
      where: (a, { eq }) => eq(a.userId, ctx.userId!),
    });

    if (!admin || !admin.isActive) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
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
