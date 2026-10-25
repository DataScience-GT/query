import { createTRPCRouter } from "../../trpc";
import { seatingProcedures } from "./desk/seating";
import { projectProcedures } from "./desk/projects";
import { gradingProcedures } from "./desk/grading";
import { deliberationRouter } from "./desk/deliberation";

// Kept at the old import path.
export { judgeProcedure } from "./desk/shared";

// The judge desk, for member and guest judges: where they sit, what they
// judge, the evaluation editor, and their private deliberation shortlist.
// Every read is polled (desk 15s, announcements 30s, heartbeat 60s), so
// nothing here goes through ctx.cache, and reads start by submitting any
// drafts whose time ran out.

export const judgingDeskRouter = createTRPCRouter({
  ...seatingProcedures,
  ...projectProcedures,
  ...gradingProcedures,
  deliberation: deliberationRouter,
});
