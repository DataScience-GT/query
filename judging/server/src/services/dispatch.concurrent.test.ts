import { describe, expect, it } from "vitest";
import { dispatchNext } from "./dispatch";
import { createDb, databaseUrl, migrate } from "@panel/db";

const url = databaseUrl();

describe.skipIf(!url)("concurrent dispatch", () => {
  it("does not hand two judges the same project", async () => {
    const { db, pool } = createDb(url as string);
    try {
      await migrate(pool);
      const { seedDemo, judge, project } = await import("@panel/db");
      const { eq } = await import("drizzle-orm");
      const { eventId } = await seedDemo(db);
      const judges = await db.select().from(judge).where(eq(judge.eventId, eventId));
      const first = judges[0];
      const second = judges[1];
      if (!first || !second) throw new Error("demo judges missing");
      const now = new Date();
      const [a, b] = await Promise.all([
        dispatchNext(db, { eventId, judgeId: first.id, now }),
        dispatchNext(db, { eventId, judgeId: second.id, now }),
      ]);
      expect(a.done).toBe(false);
      expect(b.done).toBe(false);
      if (!a.done && !b.done) expect(a.projectId).not.toBe(b.projectId);
      const rows = await db.select().from(project).where(eq(project.eventId, eventId));
      expect(rows.length).toBeGreaterThan(1);
    } finally {
      await pool.end();
    }
  });
});
