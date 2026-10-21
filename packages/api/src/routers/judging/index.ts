import { createTRPCRouter } from "../../trpc";
import { judgingAdminRouter } from "./admin";
import { judgingScheduleRouter } from "./schedule";
import { judgingDeskRouter } from "./desk";
import { judgingHackerRouter } from "./hacker";
import { judgingResultsRouter } from "./results";

// Room-based project judging: projects imported from Devpost or promoted from
// portal submissions, presented to judges seated in rooms on a schedule.
export const judgingRouter = createTRPCRouter({
  admin: judgingAdminRouter,
  schedule: judgingScheduleRouter,
  desk: judgingDeskRouter,
  hacker: judgingHackerRouter,
  results: judgingResultsRouter,
});
