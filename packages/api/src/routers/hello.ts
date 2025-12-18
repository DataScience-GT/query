import { createTRPCRouter, publicProcedure } from '../trpc';

export const helloRouter = createTRPCRouter({
  sayHello: publicProcedure.mutation(() => {
    return { message: 'hello is this thing on hellooooo' };
  }),
});