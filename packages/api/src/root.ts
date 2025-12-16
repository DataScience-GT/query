import { createTRPCRouter } from './trpc';
import { helloRouter } from './routers/hello';

// Context type
export type Context = {};

// Context creator
export const createContext = async (): Promise<Context> => {
  return {};
};

// Root app router
export const appRouter = createTRPCRouter({
  hello: helloRouter,
});

// Export API type
export type AppRouter = typeof appRouter;