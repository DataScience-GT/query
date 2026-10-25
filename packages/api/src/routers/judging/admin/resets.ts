// Resets. Each takes the hackathon's name typed out.

import type { DrizzleDB } from "@query/db";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import {
  dropEvaluations,
  dropRooms,
  resetAll,
  resetLaunch,
  resetProjects,
  resetSetup,
} from "../../../services/judging/resets";
import { resetInput, evictResults } from "./shared";

export const resetProcedures = {
  dropEvaluations: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await dropEvaluations(db, input);
    evictResults(ctx.cache, input.hackathonId);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.dropEvaluations",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  resetProjects: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await resetProjects(db, input);
    evictResults(ctx.cache, input.hackathonId);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.resetProjects",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  dropRooms: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await dropRooms(db, input);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.dropRooms",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  resetSetup: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await resetSetup(db, input);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.resetSetup",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  resetLaunch: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await resetLaunch(db, input);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.resetLaunch",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),

  resetAll: isAdmin.input(resetInput).mutation(async ({ ctx, input }) => {
    const db = ctx.db as DrizzleDB;
    const result = await resetAll(db, input);
    evictResults(ctx.cache, input.hackathonId);
    await recordAdminAction(db, {
      userId: ctx.userId,
      action: "judging.resetAll",
      resourceId: input.hackathonId,
      severity: "critical",
      metadata: result,
    });
    return result;
  }),
};
