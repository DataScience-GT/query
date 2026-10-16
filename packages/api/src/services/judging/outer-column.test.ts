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
      `where "schedule_id" = "judging_schedule"."id"`,
    );
  });

  it("is needed: a plain column loses its table name there", () => {
    const query = db
      .select({
        hasLink: sql<boolean>`exists (select 1 from ${judgingRoomLinks} where ${judgingRoomLinks.roomId} = ${judgingRooms.id})`,
      })
      .from(judgingRooms)
      .toSQL();

    expect(query.sql).toContain(`where "room_id" = "id"`);
  });
});
