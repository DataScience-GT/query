import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@query/api';
import { applySecurityHeaders, getClientIp } from '@query/api/middleware/http-security';

const handler = async (req: Request) => {
  // Get client IP for logging/monitoring
  const clientIp = getClientIp(req);

  // Create TRPC response
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: (opts) => createContext({ ...opts, clientIp }),
    onError: ({ error, path }) => {
      console.error(`[TRPC Error] ${path}:`, error.message);
    },
  });

  // Apply security headers to response
  return applySecurityHeaders(response, {
    cacheable: false, // TRPC responses are dynamic
  });
};

export { handler as GET, handler as POST };