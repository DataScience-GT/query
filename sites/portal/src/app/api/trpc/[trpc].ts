// sites/portal/pages/api/trpc/[trpc].ts
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter, createContext } from '@query/api';

export default createNextApiHandler({
  router: appRouter,
  createContext,
});