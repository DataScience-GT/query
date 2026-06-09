import { createTRPCRouter } from "./trpc";
import { helloRouter } from "./routers/hello";
import { userRouter } from "./routers/user";
import { adminRouter } from "./routers/admin";
import { memberRouter } from "./routers/member";
import { hackathonRouter } from "./routers/hackathon";
import { eventRouter } from "./routers/events";
import { judgeRouter } from "./routers/judge";
import { stripeRouter } from "./routers/stripe";
import { auditRouter } from "./routers/audit";
import { teamRouter } from "./routers/team";
import { settingsRouter } from "./routers/settings";

export const appRouter = createTRPCRouter({
  hello: helloRouter,
  user: userRouter,
  admin: adminRouter,
  member: memberRouter,
  hackathon: hackathonRouter,
  events: eventRouter,
  judge: judgeRouter,
  stripe: stripeRouter,
  audit: auditRouter,
  team: teamRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;