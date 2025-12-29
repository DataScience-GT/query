import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import { rateLimit, sanitizeInput } from "./middleware/security";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;

// Public procedure with rate limiting
export const publicProcedure = t.procedure.use(async ({ ctx, next }) => {
  const identifier = ctx.userId || `anon-${ctx.session?.user?.id || 'unknown'}`;

  // 100 requests per 15 minutes for public endpoints
  if (!rateLimit(identifier, 100, 15 * 60 * 1000)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }

  return next();
});

// Authentication middleware
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user || !ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  // 200 requests per 15 minutes for authenticated users
  if (!rateLimit(`auth-${ctx.userId}`, 200, 15 * 60 * 1000)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
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

// Input sanitization middleware - Applied at the input parsing level
const sanitizeInputs = t.middleware(async ({ next, input }) => {
  // Sanitize the parsed input
  const sanitized = sanitizeInput(input);
  return next({ ctx: { sanitizedInput: sanitized } });
});

// Protected procedure with input sanitization
export const protectedProcedure = t.procedure
  .use(isAuthed)
  .use(sanitizeInputs);