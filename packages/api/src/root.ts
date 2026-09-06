import { createTRPCRouter } from "./trpc";
import { userRouter } from "./routers/user";
import { adminRouter } from "./routers/admin";
import { memberRouter } from "./routers/member";
import { resumeRouter } from "./routers/resume";
import { hackathonRouter } from "./routers/hackathon";
import { eventRouter } from "./routers/events";
import { judgeRouter } from "./routers/judge";
import { stripeRouter } from "./routers/stripe";
import { teamRouter } from "./routers/team";
import { initiativeRouter } from "./routers/initiative";
import { bootcampRouter } from "./routers/bootcamp";

export const appRouter = createTRPCRouter({
  user: userRouter,
  admin: adminRouter,
  member: memberRouter,
  resume: resumeRouter,
  hackathon: hackathonRouter,
  events: eventRouter,
  judge: judgeRouter,
  stripe: stripeRouter,
  team: teamRouter,
  initiative: initiativeRouter,
  bootcamp: bootcampRouter,
});

export type AppRouter = typeof appRouter;
