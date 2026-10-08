import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, databaseUrl, judge, migrate, seedDemo } from "@query/judging-db";
import { dispatchNext, visitStatus } from "./dispatch";
import { recallJudge, voidVisit } from "./records";

const url = databaseUrl();

describe.skipIf(!url)("visit status", () => {
  it("reports a recall since the hand-out, then a void", async () => {
    const { db, pool } = createDb(url as string);
    try {
      await migrate(pool);
      const { eventId } = await seedDemo(db);
      const [person] = await db.select().from(judge).where(eq(judge.eventId, eventId));
      if (!person) throw new Error("demo judge missing");

      const handed = await dispatchNext(db, { eventId, judgeId: person.id, now: new Date() });
      if (handed.done) throw new Error("demo floor is empty");
      const ask = () => visitStatus(db, { eventId, judgeId: person.id, visitId: handed.visitId });

      expect(await ask()).toEqual({ voided: false, recalledAt: null });

      await recallJudge(db, { eventId, judgeId: person.id, actorEmail: "organizer@example.com" });
      const recalled = await ask();
      expect(recalled.voided).toBe(false);
      expect(recalled.recalledAt).not.toBeNull();

      await voidVisit(db, {
        eventId,
        visitId: handed.visitId,
        now: new Date(),
        actorEmail: "organizer@example.com",
        reason: "test",
      });
      expect((await ask()).voided).toBe(true);
    } finally {
      await pool.end();
    }
  });
});
