// sites/portal/pages/api/trpc/[trpc].ts
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '@query/api';
import { auth } from '@query/auth';
import { db } from '@query/db';
import type { NextApiRequest, NextApiResponse } from 'next';

export default createNextApiHandler({
  router: appRouter,
  createContext: async ({ req, res }: { req: NextApiRequest; res: NextApiResponse }) => {
    const session = await auth();

    return {
      db,
      session,
      userId: session?.user?.id,
    };
  },
});