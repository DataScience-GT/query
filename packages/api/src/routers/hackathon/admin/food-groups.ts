// One-shot backfill of food groups for everyone already accepted.

import { z } from "zod";
import { isAdmin } from "../../../middleware/procedures";
import { recordAdminAction } from "../../../middleware/audit";
import type { DrizzleDB } from "@query/db";
import { assignAllFoodGroups } from "../../../services/discord";
import { refuseBugTester } from "./roster";

export const foodGroupProcedures = {
  assignFoodGroups: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .mutation(async ({ ctx, input }) => {
      refuseBugTester(ctx.admin.role);
      const db = ctx.db as DrizzleDB;
      const assigned = await assignAllFoodGroups(db, input.hackathonId);
      await recordAdminAction(db, {
        userId: ctx.userId,
        action: "hackathon.assignFoodGroups",
        resourceId: input.hackathonId,
        severity: "info",
        metadata: { assigned },
      });
      return { assigned };
    }),
};
