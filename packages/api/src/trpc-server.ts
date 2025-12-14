import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { getSessionFromRequest } from '@enigma/auth';
import { getJudgeSessionFromCookie, isDiscordAdmin, isJudgeAdmin, userHasCheckIn, userHasFullAdmin, userIsOfficer } from './utils';

/**
 * Create the server-side request context.
 * Accepts a Request-like object (we only need headers/cookies) and returns session info.
 */
export const createTRPCContext = async (opts: { headers: Headers; req?: Request }) => {
  const headers = opts.headers;
  // construct a Request so we can reuse auth helpers which expect a Request
  const req = opts.req ?? new Request('http://localhost', { headers });

  const session = (await getSessionFromRequest(req)) ?? null; // { session, user } | null

  const source = headers.get('x-trpc-source') ?? 'unknown';
  console.log('>>> tRPC Request from', source, 'by', session?.user?.email ?? 'anonymous');

  return {
    session: session?.user ?? null,
    sessionToken: session?.session ?? null,
    headers,
    req,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
    },
  }),
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  if (t._config.isDev) {
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  const result = await next();
  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);
  return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);

export const protectedProcedure = t.procedure.use(timingMiddleware).use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { session: ctx.session } });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const isValid = await isDiscordAdmin(ctx.session);
  if (!isValid) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session } });
});

export const fullAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const hasFullAdmin = await userHasFullAdmin(ctx.session);
  if (!hasFullAdmin) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session } });
});

export const checkInProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const ok = await userHasCheckIn(ctx.session);
  if (!ok) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session } });
});

export const officerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const ok = await userIsOfficer(ctx.session);
  if (!ok) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { session: ctx.session } });
});

export const judgeProcedure = publicProcedure.use(async ({ ctx, next }) => {
  let isAdmin = false;
  if (ctx.session) isAdmin = await isDiscordAdmin(ctx.session);
  const isJudge = await isJudgeAdmin();
  if (!isAdmin && !isJudge) throw new TRPCError({ code: 'UNAUTHORIZED' });
  const judgeSession = await getJudgeSessionFromCookie();
  return next({ ctx: { ...ctx, judgeSession } });
});

export type TrpcContext = Awaited<ReturnType<typeof createTRPCContext>>;
