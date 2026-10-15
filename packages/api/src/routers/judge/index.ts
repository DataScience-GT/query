import { mergeRouters } from "../../trpc";
import { judgePortalRouter } from "./portal";
import { judgeAdminRouter } from "./admin";

// The judge roster: applications, approval and the "am I a judge" lookup.
// Judging itself (rooms, schedule, desk, results) is routers/judging.
export const judgeRouter = mergeRouters(judgePortalRouter, judgeAdminRouter);
