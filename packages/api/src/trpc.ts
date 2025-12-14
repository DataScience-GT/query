import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './index';
import { httpBatchLink } from '@trpc/client';

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient(baseUrl = '') {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${baseUrl || ''}/api/trpc`,
      }),
    ],
  });
}

export type Trpc = typeof trpc;
