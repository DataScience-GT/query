import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  judgingAppointments,
  judgingRoomLinks,
  judgingRooms,
  judgingSchedules,
} from "@query/db";
import { outerColumn } from "./outer-column";

const db = drizzle.mock();

describe("outerColumn", () => {
  it("keeps the outer table's name in a one-table select", () => {
    const query = db
      .select({
        appointments: sql<number>`(select count(*)::int from ${judgingAppointments} where ${judgingAppointments.scheduleId} = ${outerColumn(judgingSchedules, judgingSchedules.id)})`,
      })
      .from(judgingSchedules)
      .toSQL();

    expect(query.sql).toContain(
      `where "judging_appointment"."schedule_id" = "judging_schedule"."id"`,
    );
  });

  // Drizzle 0.x dropped the table name from a plain column in this shape, and
  // outerColumn existed for that. 1.0 keeps it, so the helper is now belt and
  // braces; this pins that a plain column is still correlated correctly.
  it("keeps the table name on a plain column too", () => {
    const query = db
      .select({
        hasLink: sql<boolean>`exists (select 1 from ${judgingRoomLinks} where ${judgingRoomLinks.roomId} = ${judgingRooms.id})`,
      })
      .from(judgingRooms)
      .toSQL();

    expect(query.sql).toContain(
      `where "judging_room_link"."room_id" = "judging_room"."id"`,
    );
  });
});
