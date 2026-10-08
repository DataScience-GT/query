import { Counter, Gauge, Histogram, Registry } from "prom-client";

export function createMetrics() {
  const register = new Registry();
  const dispatchSeconds = new Histogram({
    name: "panel_dispatch_seconds",
    help: "Time to choose and record the next table",
    registers: [register],
  });
  const votes = new Counter({
    name: "panel_votes_total",
    help: "Votes stored",
    registers: [register],
  });
  const outboxPending = new Gauge({
    name: "panel_outbox_pending",
    help: "Outbox rows not yet delivered",
    registers: [register],
  });
  const wsConnections = new Gauge({
    name: "panel_ws_connections",
    help: "Open websocket clients",
    registers: [register],
  });
  const liveJudges = new Gauge({
    name: "panel_live_judges",
    help: "Judges with a visit that is still open",
    registers: [register],
  });
  const coverage = new Histogram({
    name: "panel_project_looks",
    help: "How many scores a project had when the latest one landed",
    buckets: [1, 2, 3, 4, 5, 8, 13],
    labelNames: ["event_id"],
    registers: [register],
  });
  return { register, dispatchSeconds, votes, outboxPending, wsConnections, liveJudges, coverage };
}

export type Metrics = ReturnType<typeof createMetrics>;
