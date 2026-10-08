import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, criterion, databaseUrl, event, migrate, rubric } from "@query/judging-db";
import { ensureEvent } from "./event";

const url = databaseUrl();

describe.skipIf(!url)("ensureEvent", () => {
  it("creates an edition's event once, with the default rubric", async () => {
    const { db, pool } = createDb(url as string);
    try {
      await migrate(pool);
      const input = {
        orgSlug: "test-org",
        orgName: "Test",
        eventSlug: randomUUID(),
        name: "Test edition",
      };
      const first = await ensureEvent(db, input);
      const again = await ensureEvent(db, input);
      expect(again.eventId).toBe(first.eventId);

      const [row] = await db.select().from(event).where(eq(event.id, first.eventId));
      expect(row?.phase).toBe("setup");
      const criteria = await db
        .select({ key: criterion.key })
        .from(criterion)
        .innerJoin(rubric, eq(rubric.id, criterion.rubricId))
        .where(and(eq(rubric.eventId, first.eventId), eq(rubric.isDefault, true)));
      expect(criteria.map((item) => item.key).sort()).toEqual(
        ["clarity", "creativity", "impact", "scope", "soundness"],
      );
    } finally {
      await pool.end();
    }
  });
});
