// packages/api/src/trpc.ts
import { initTRPC } from '@trpc/server';
import { Context } from './root';

export const t = initTRPC.context<Context>().create();

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure;