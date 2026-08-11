import { createTRPCRouter } from "./trpc";
import { userRouter } from "./routers/user";
import { adminRouter } from "./routers/admin";
import { memberRouter } from "./routers/member";
import { hackathonRouter } from "./routers/hackathon";
import { eventRouter } from "./routers/events";
import { judgeRouter } from "./routers/judge";
import { stripeRouter } from "./routers/stripe";
import { auditRouter } from "./routers/audit";
import { teamRouter } from "./routers/team";
import { initiativeRouter } from "./routers/initiative";
import { bootcampRouter } from "./routers/bootcamp";

export const appRouter = createTRPCRouter({
  user: userRouter,
  admin: adminRouter,
  member: memberRouter,
  hackathon: hackathonRouter,
  events: eventRouter,
  judge: judgeRouter,
  stripe: stripeRouter,
  audit: auditRouter,
  team: teamRouter,
  initiative: initiativeRouter,
  bootcamp: bootcampRouter,
});

export type AppRouter = typeof appRouter;
