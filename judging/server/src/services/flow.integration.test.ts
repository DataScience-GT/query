import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createDb,
  criterion,
  databaseUrl,
  event,
  eventLog,
  migrate,
  project,
  rubric,
  seedDemo,
} from "@panel/db";
import { arrive } from "./arrive";
import { dispatchNext } from "./dispatch";
import { feedbackCard } from "./catalog";
import { computeResults, publishResults } from "./results";
import { castVote } from "./vote";

const url = databaseUrl();

describe.skipIf(!url)("a full visit", () => {
  it("scores a table, publishes, and opens that project's feedback", async () => {
    const { db, pool } = createDb(url as string);
    try {
      await migrate(pool);
      const { eventId } = await seedDemo(db);
      const { judge } = await import("@panel/db");
      const [person] = await db.select().from(judge).where(eq(judge.eventId, eventId));
      if (!person) throw new Error("demo judge missing");
      const now = new Date("2027-02-28T13:00:00Z");

      const handed = await dispatchNext(db, { eventId, judgeId: person.id, now });
      expect(handed.done).toBe(false);
      if (handed.done) return;

      await arrive(db, {
        eventId,
        judgeId: person.id,
        tableNumber: handed.tableNumber ?? undefined,
        now: new Date(now.getTime() + 30_000),
      });

      const [rub] = await db
        .select({ id: rubric.id })
        .from(rubric)
        .where(and(eq(rubric.eventId, eventId), eq(rubric.isDefault, true)));
      if (!rub) throw new Error("demo rubric missing");
      const criteria = await db
        .select()
        .from(criterion)
        .where(eq(criterion.rubricId, rub.id));

      await castVote(db, {
        eventId,
        judgeId: person.id,
        visitId: handed.visitId,
        scores: criteria.map((item) => ({ criterionId: item.id, value: 8 })),
        comment: null,
        now: new Date(now.getTime() + 60_000),
      });

      await db.update(event).set({ phase: "judging_closed" }).where(eq(event.id, eventId));
      const run = await computeResults(db, {
        eventId,
        actorEmail: "organizer@demo.panel",
        now: new Date(now.getTime() + 120_000),
      });
      await publishResults(db, {
        eventId,
        runId: run.runId,
        actorEmail: "organizer@demo.panel",
        now: new Date(now.getTime() + 130_000),
      });

      const [scored] = await db
        .select({ token: project.feedbackToken })
        .from(project)
        .where(eq(project.id, handed.projectId));
      if (!scored?.token) throw new Error("feedback token was not minted");

      const card = await feedbackCard(db, scored.token);
      expect(card.status).toBe("ok");
      if (card.status === "ok") {
        expect(card.criteria.length).toBeGreaterThan(0);
        expect(card.criteria[0]?.mean).toBe(8);
      }
      expect((await feedbackCard(db, "00000000-0000-0000-0000-000000000000")).status).toBe(
        "forbidden",
      );

      const kinds = [
        "visit.handed_out",
        "visit.arrived",
        "vote.cast",
        "results.computed",
        "results.published",
      ] as const;
      for (const kind of kinds) {
        const rows = await db
          .select({ id: eventLog.id })
          .from(eventLog)
          .where(and(eq(eventLog.eventId, eventId), eq(eventLog.kind, kind)));
        expect(rows, kind).toHaveLength(1);
      }
    } finally {
      await pool.end();
    }
  });
});
