import { createTRPCRouter } from "../../trpc";
import { consoleProcedures } from "./admin/console";
import { entryProcedures } from "./admin/entries";
import { challengeProcedures } from "./admin/challenges";
import { roomProcedures } from "./admin/rooms";
import { roomLinkProcedures } from "./admin/room-links";
import { rubricAndStateProcedures } from "./admin/rubric-and-state";
import { announcementProcedures } from "./admin/announcements";
import { resetProcedures } from "./admin/resets";
import { repoCheckProcedures } from "./admin/repo-check";

// Organiser setup and live control of room judging: getting projects in,
// shaping challenges, rooms and the rubric, the switches flipped on judging
// day, and the resets. Reads are open to bug testers (isAdmin lets queries
// through). A write that checks state before changing it takes the edition
// lock (lockEdition in services/judging/challenges) first.

export const judgingAdminRouter = createTRPCRouter({
  ...consoleProcedures,
  ...entryProcedures,
  ...challengeProcedures,
  ...roomProcedures,
  ...roomLinkProcedures,
  ...rubricAndStateProcedures,
  ...announcementProcedures,
  ...resetProcedures,
  ...repoCheckProcedures,
});
