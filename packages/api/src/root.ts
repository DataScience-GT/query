import { createTRPCRouter } from "./trpc";
import { helloRouter } from "./routers/hello";
import { userRouter } from "./routers/user";
import { adminRouter } from "./routers/admin";
import { memberRouter } from "./routers/member";
import { hackathonRouter } from "./routers/hackathon";
import { eventRouter } from "./routers/events";
import { judgeRouter } from "./routers/judge";

export const appRouter = createTRPCRouter({
  hello: helloRouter,
  user: userRouter,
  admin: adminRouter,
  member: memberRouter,
  hackathon: hackathonRouter,
  events: eventRouter,
  judge: judgeRouter,
});

export type AppRouter = typeof appRouter;