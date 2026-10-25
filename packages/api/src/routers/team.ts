import { createTRPCRouter } from "../trpc";
import { teamProcedures } from "./team/teams";
import { submissionProcedures } from "./team/submissions";
import { teamReadProcedures } from "./team/reads";

export const teamRouter = createTRPCRouter({
  ...teamProcedures,
  ...submissionProcedures,
  ...teamReadProcedures,
});
