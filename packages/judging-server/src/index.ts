import { serve } from "@hono/node-server";
import type { Server } from "node:http";
import { sql } from "drizzle-orm";
import { boardChannel, judgeChannel } from "@query/judging-core";
import { createDb } from "@query/judging-db";
import { createBus } from "./bus";
import { attachHub } from "./hub";
import { createApp } from "./app";
import { serverEnv } from "./env";
import { log } from "./log";
import { createMetrics } from "./metrics";
import { drainOutbox } from "./services/outbox";
import { loadOpenVisits, visitsOverTarget } from "./services/overtime";

const env = serverEnv();
if (!env.databaseUrl) {
  log({ level: "error", message: "DATABASE_URL is not set" });
  process.exit(1);
}

const { db } = createDb(env.databaseUrl);
const metrics = createMetrics();
const bus = createBus(env.redisUrl);
const app = createApp({
  db,
  metrics,
  jwtSecret: env.jwtSecret,
  jwksUrl: env.jwksUrl,
  devAuth: env.devAuth,
  smtpUrl: env.smtpUrl,
  busMode: env.redisUrl ? "redis" : "memory",
  bus,
});

const notedOvertime = new Set<string>();
const timer = setInterval(() => {
  drainOutbox(db)
    .then(async () => {
      const pending = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from outbox where delivered_at is null`,
      );
      const count = Number(pending.rows[0]?.count ?? 0);
      metrics.outboxPending.set(Number.isFinite(count) ? count : 0);
    })
    .catch((error: unknown) => {
      log({
        level: "error",
        message: error instanceof Error ? error.message : "outbox",
      });
    });
  loadOpenVisits(db)
    .then((rows) => {
      for (const row of visitsOverTarget(rows, new Date())) {
        if (notedOvertime.has(row.visitId)) continue;
        notedOvertime.add(row.visitId);
        const message = { kind: "judge.overtime", eventId: row.eventId, visitId: row.visitId };
        bus.publish(judgeChannel(row.judgeId), message);
        bus.publish(boardChannel(row.eventId), message);
      }
    })
    .catch((error: unknown) => {
      log({
        level: "error",
        message: error instanceof Error ? error.message : "overtime",
      });
    });
}, 2000);
timer.unref();

const server = serve({ fetch: app.fetch, port: env.port }, () => {
  log({ level: "info", message: "listening", port: env.port });
});
attachHub(server as Server, bus, metrics);
