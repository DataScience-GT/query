// Registration analytics for an edition.

import { z } from "zod";
import { isAdmin } from "../../../middleware/procedures";
import { hackathonParticipants } from "@query/db";
import { eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "@query/db";

export const analyticsProcedures = {
  analytics: isAdmin
    .input(z.object({ hackathonId: z.string().uuid("Invalid hackathon ID") }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as DrizzleDB;
      const scope = eq(hackathonParticipants.hackathonId, input.hackathonId);

      // Counted by the database. This used to load every participant row — all 35
      // columns, essays included — to produce a handful of integers, and it backs
      // both the stat tiles and the analytics page.
      const [byStatus, bySize, byDiet] = await Promise.all([
        db
          .select({
            status: hackathonParticipants.registrationStatus,
            count: sql<number>`count(*)::int`,
          })
          .from(hackathonParticipants)
          .where(scope)
          .groupBy(hackathonParticipants.registrationStatus),
        db
          .select({
            size: hackathonParticipants.shirtSize,
            count: sql<number>`count(*)::int`,
          })
          .from(hackathonParticipants)
          .where(scope)
          .groupBy(hackathonParticipants.shirtSize),
        // unnest so each restriction counts once, rather than pulling every array
        // back to be flattened in JS.
        db
          .select({
            restriction: sql<string>`btrim(restriction)`.as("restriction"),
            count: sql<number>`count(*)::int`,
          })
          .from(hackathonParticipants)
          .innerJoin(
            sql`unnest(${hackathonParticipants.dietaryRestrictions}) as restriction`,
            sql`true`,
          )
          .where(scope)
          .groupBy(sql`btrim(restriction)`),
      ]);

      const statusBreakdown = {
        approved: 0,
        pending: 0,
        rejected: 0,
        waitlisted: 0,
        checked_in: 0,
      };

      let totalRegistrations = 0;
      for (const row of byStatus) {
        totalRegistrations += row.count;
        if (row.status && row.status in statusBreakdown) {
          statusBreakdown[row.status as keyof typeof statusBreakdown] =
            row.count;
        }
      }

      const shirtSizes: Record<string, number> = {};
      for (const row of bySize) {
        if (row.size) shirtSizes[row.size] = row.count;
      }

      const dietaryRestrictions: Record<string, number> = {};
      for (const row of byDiet) {
        if (row.restriction) dietaryRestrictions[row.restriction] = row.count;
      }

      return {
        totalRegistrations,
        statusBreakdown,
        shirtSizes,
        dietaryRestrictions,
      };
    }),
};
