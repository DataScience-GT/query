import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from './trpc-server';

const portalRouter = createTRPCRouter({
  getDashboard: publicProcedure.query(() => ({
    title: 'Demo Dashboard',
    widgets: [],
    stats: {
      users: 1234,
      revenue: 9876,
      growth: 12,
    },
  })),

  updateProfile: publicProcedure
    .input(z.object({ name: z.string(), email: z.string() }))
    .mutation(({ input }) => {
      // No-op mutation for demo purposes
      return { success: true, input };
    }),
});

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => ({ ok: true })),
  portal: portalRouter,
});

export type AppRouter = typeof appRouter;

export default appRouter;
