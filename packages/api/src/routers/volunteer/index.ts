import { mergeRouters } from "../../trpc";
import { volunteerPortalRouter } from "./portal";
import { volunteerAdminRouter } from "./admin";

// The volunteer application: apply, correct, withdraw, and the organisers'
// roster and decisions. Judging is routers/judge, a different application.
export const volunteerRouter = mergeRouters(
  volunteerPortalRouter,
  volunteerAdminRouter,
);
