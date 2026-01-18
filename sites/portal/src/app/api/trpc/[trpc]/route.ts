import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@query/api';

const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(),
    onError: ({ error, path }) => {
      console.error(`[TRPC Error] ${path}:`, error.message);
    },
  });
};

export { handler as GET, handler as POST };