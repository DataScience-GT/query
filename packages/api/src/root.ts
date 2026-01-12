import { createTRPCRouter } from "./trpc";
import { helloRouter } from "./routers/hello";
import { userRouter } from "./routers/user";
import { adminRouter } from "./routers/admin";
import { memberRouter } from "./routers/member";
import { hackathonRouter } from "./routers/hackathon";
import { eventRouter } from "./routers/events"; // Add this

export const appRouter = createTRPCRouter({
  hello: helloRouter,
  user: userRouter,
  admin: adminRouter,
  member: memberRouter,
  hackathon: hackathonRouter,
  events: eventRouter, // Add this
});

export type AppRouter = typeof appRouter;