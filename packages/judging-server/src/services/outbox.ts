import { createHmac } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import type { PanelDb } from "@query/judging-db";
import { outbox, webhook } from "@query/judging-db";

/**
 * Delivers pending outbox rows. A topic with no active webhook is delivered.
 * A delivered row is deleted: event_log already keeps the history, and on a
 * 0.5 GB database a second copy of every vote is not worth keeping.
 */
export async function drainOutbox(db: PanelDb): Promise<number> {
  const pending = await db
    .select()
    .from(outbox)
    .where(isNull(outbox.deliveredAt))
    .limit(50);
  if (pending.length === 0) return 0;

  const hooks = await db.select().from(webhook).where(eq(webhook.isActive, true));
  let delivered = 0;

  for (const row of pending) {
    const targets = hooks.filter((hook) => hook.topics?.includes(row.topic));
    let ok = true;
    for (const hook of targets) {
      const body = JSON.stringify(row.payload);
      const signature = createHmac("sha256", hook.secret).update(body).digest("hex");
      try {
        const response = await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-panel-signature": signature,
          },
          body,
        });
        if (!response.ok) ok = false;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      await db
        .update(outbox)
        .set({ attempts: row.attempts + 1 })
        .where(eq(outbox.id, row.id));
      continue;
    }
    await db.delete(outbox).where(eq(outbox.id, row.id));
    delivered += 1;
  }
  return delivered;
}
