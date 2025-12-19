import { createTRPCRouter } from "./trpc";
import { helloRouter } from "./routers/hello";
import { userRouter } from "./routers/user";

export const appRouter = createTRPCRouter({
  hello: helloRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;