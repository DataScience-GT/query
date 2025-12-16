// packages/api/src/index.ts
export { appRouter, createContext } from './root';
export type { AppRouter, Context } from './root';
export { trpc, createTRPCRouter, publicProcedure } from './trpc';