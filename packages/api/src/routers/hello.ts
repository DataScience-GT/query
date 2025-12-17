import { createTRPCRouter, publicProcedure } from '../trpc';

export const helloRouter = createTRPCRouter()({
  sayHello: publicProcedure.query(() => {
    return { message: 'Hello, world!' };
  }),
});