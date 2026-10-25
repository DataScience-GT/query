import { createTRPCRouter } from "../../trpc";
import { rosterProcedures } from "./admin/roster";
import { statusProcedures } from "./admin/status";
import { analyticsProcedures } from "./admin/analytics";
import { checkInProcedures } from "./admin/check-in";

// Registration calls these when it changes who holds a seat.
export { evictParticipantCaches, syncCurrentParticipants } from "./admin/seats";

export const hackathonAdminRouter = createTRPCRouter({
  ...rosterProcedures,
  ...statusProcedures,
  ...analyticsProcedures,
  ...checkInProcedures,
});
