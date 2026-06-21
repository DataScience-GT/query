import { mergeRouters } from "../../trpc";
import { judgePortalRouter } from "./portal";
import { judgeRankingsRouter } from "./rankings";
import { judgeAdminRouter } from "./admin";

export const judgeRouter = mergeRouters(
  judgePortalRouter,
  judgeRankingsRouter,
  judgeAdminRouter,
);
