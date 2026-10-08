import { createHmac } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import type { PanelDb } from "@panel/db";
import { outbox, webhook } from "@panel/db";

/** Delivers pending outbox rows. A topic with no active webhook is delivered. */
export async function drainOutbox(db: PanelDb, now = new Date()): Promise<number> {
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
    await db
      .update(outbox)
      .set({ deliveredAt: now, attempts: row.attempts + 1 })
      .where(eq(outbox.id, row.id));
    delivered += 1;
  }
  return delivered;
}
