import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@query/api';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: (opts) => import('@query/api/trpc-server').then(m => m.createTRPCContext({ headers: opts.req.headers, req: opts.req })),
  });

export { handler as GET, handler as POST };
