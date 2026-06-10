import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { systemSettings } from "@query/db";
import { eq } from "drizzle-orm";
import { isSuperAdmin } from "../middleware/procedures";
import type { DrizzleDB } from "@query/db";

export const settingsRouter = createTRPCRouter({
  get: publicProcedure.query(async ({ ctx }) => {
    // If not using db yet, safely return default
    if (!ctx.db) {
      return {
        systemName: 'DSGT Query Engine',
        maintenanceMode: false,
        requireEmailVerification: true,
        maxEventCapacity: 500,
        allowPublicRegistration: true,
      };
    }
    
    let settings = await (ctx.db as DrizzleDB).query.systemSettings.findFirst({
      where: eq(systemSettings.id, "default"),
    });

    if (!settings) {
      // Create defaults if they don't exist
      const inserted = await (ctx.db as DrizzleDB)
        .insert(systemSettings)
        .values({
          id: "default",
          systemName: 'DSGT Query Engine',
          maintenanceMode: false,
          requireEmailVerification: true,
          maxEventCapacity: 500,
          allowPublicRegistration: true,
        })
        .returning();
      settings = inserted[0];
    }

    return settings;
  }),

  update: isSuperAdmin
    .input(
      z.object({
        systemName: z.string().min(1).optional(),
        maintenanceMode: z.boolean().optional(),
        requireEmailVerification: z.boolean().optional(),
        maxEventCapacity: z.number().int().min(1).optional(),
        allowPublicRegistration: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await (ctx.db as DrizzleDB)
        .update(systemSettings)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.id, "default"))
        .returning();

      if (!result.length) {
        // If row doesn't exist yet, insert with input overwriting defaults
        const inserted = await (ctx.db as DrizzleDB)
          .insert(systemSettings)
          .values({
            id: "default",
            ...input,
          })
          .returning();
        return inserted[0];
      }

      return result[0];
    }),
});
