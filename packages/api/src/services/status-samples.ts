// Uptime history for /status. Real traffic is the only probe: every tRPC call
// is counted into an in-process five-minute bucket, and the first call to land
// in a later bucket writes the finished one to Postgres. There is no timer and
// no worker, so a quiet instance writes nothing and a quiet hour is "no data",
// never "down". Rows are per instance because App Hosting autoscales and
// in-process state dies with the instance; readers sum across instances.
//
// Writes are fire-and-forget: they never delay or fail the request that
// triggered them. A bucket that cannot be written is retried with the next
// flush, up to RETRY_LIMIT buckets, then dropped and counted.
import { randomUUID } from "node:crypto";
import { db, sql, statusSample } from "@query/db";
import { statusSampleWriteFailures } from "./metrics";

export const BUCKET_MS = 5 * 60 * 1000;
export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 24 * 60 * 60 * 1000;
/** Durations kept per bucket. Beyond this, reservoir sampling. */
const MAX_SAMPLES = 500;
/** One hour of failed writes. Past this the oldest is dropped. */
const RETRY_LIMIT = 12;

export type StatusRow = {
  bucketStart: Date;
  instanceId: string;
  requests: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  dbOk: boolean;
  dbMs: number;
};

// 5xx-class tRPC codes. A client error (UNAUTHORIZED, BAD_REQUEST,
// TOO_MANY_REQUESTS, NOT_FOUND ...) is the caller's mistake, not downtime.
const SERVER_ERROR_CODES = new Set([
  "INTERNAL_SERVER_ERROR",
  "NOT_IMPLEMENTED",
  "BAD_GATEWAY",
  "SERVICE_UNAVAILABLE",
  "GATEWAY_TIMEOUT",
]);

export const isServerErrorCode = (code: string) => SERVER_ERROR_CODES.has(code);

export const bucketStartOf = (ms: number) => ms - (ms % BUCKET_MS);

/** Nearest-rank percentile of an unsorted list; 0 for an empty one. */
export function percentile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1]!;
}

type Open = {
  start: number;
  requests: number;
  errors: number;
  samples: number[];
};

type FinishedBucket = Omit<StatusRow, "dbOk" | "dbMs"> & {
  ping?: { ok: boolean; ms: number };
};

export type StatusRecorderDeps = {
  now: () => number;
  instanceId: string;
  /** `select 1`, timed. Must resolve, reporting a failure as ok: false. */
  ping: () => Promise<{ ok: boolean; ms: number }>;
  /** Upsert that adds to an existing row. */
  write: (row: StatusRow) => Promise<void>;
  prune: (cutoff: Date) => Promise<void>;
  onWriteError: () => void;
  random?: () => number;
};

export function createStatusRecorder(deps: StatusRecorderDeps) {
  const random = deps.random ?? Math.random;
  let open: Open | null = null;
  let seen = 0;
  let lastPrune = deps.now();
  const queue: FinishedBucket[] = [];
  let inflight: Promise<void> = Promise.resolve();

  const summarise = (bucket: Open): FinishedBucket => ({
    bucketStart: new Date(bucket.start),
    instanceId: deps.instanceId,
    requests: bucket.requests,
    errors: bucket.errors,
    p50Ms: Math.round(percentile(bucket.samples, 0.5)),
    p95Ms: Math.round(percentile(bucket.samples, 0.95)),
  });

  async function drain() {
    // Oldest first. Stop at the first failure: the database is probably
    // down, and the rest would only fail the same way.
    while (queue.length > 0) {
      const bucket = queue[0]!;
      bucket.ping ??= await deps.ping();
      try {
        const { ping, ...counts } = bucket;
        await deps.write({ ...counts, dbOk: ping.ok, dbMs: ping.ms });
        queue.shift();
      } catch {
        deps.onWriteError();
        return;
      }
    }
  }

  async function prune() {
    const now = deps.now();
    if (now - lastPrune < PRUNE_EVERY_MS) return;
    lastPrune = now;
    try {
      await deps.prune(new Date(now - RETENTION_MS));
    } catch {
      deps.onWriteError();
    }
  }

  function flush(finished: Open) {
    queue.push(summarise(finished));
    while (queue.length > RETRY_LIMIT) {
      queue.shift();
      deps.onWriteError();
    }
    // Serialised, so a slow database queues at most one drain at a time
    // instead of piling up connections.
    inflight = inflight
      .then(drain)
      .then(prune)
      .catch(() => {
        deps.onWriteError();
      });
  }

  return {
    /** Never throws, never awaits the database. */
    record(durationMs: number, serverError: boolean) {
      const start = bucketStartOf(deps.now());
      if (open && start > open.start) {
        flush(open);
        open = null;
      }
      if (!open) {
        open = { start, requests: 0, errors: 0, samples: [] };
        seen = 0;
      }
      open.requests += 1;
      if (serverError) open.errors += 1;
      seen += 1;
      if (open.samples.length < MAX_SAMPLES) {
        open.samples.push(durationMs);
      } else {
        const slot = Math.floor(random() * seen);
        if (slot < MAX_SAMPLES) open.samples[slot] = durationMs;
      }
    },
    /** Resolves when every write started so far has finished. For tests. */
    settled: () => inflight,
    /** Buckets waiting on a retry. For tests. */
    pending: () => queue.length,
  };
}

const instanceId = randomUUID();

async function pingDatabase() {
  if (!db) return { ok: false, ms: 0 };
  const started = performance.now();
  try {
    await db.execute(sql`select 1`);
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - started) };
  }
}

const recorder = createStatusRecorder({
  now: () => Date.now(),
  instanceId,
  ping: pingDatabase,
  write: async (row) => {
    if (!db) throw new Error("no database");
    await db
      .insert(statusSample)
      .values(row)
      .onConflictDoUpdate({
        target: [statusSample.bucketStart, statusSample.instanceId],
        set: {
          requests: sql`${statusSample.requests} + excluded.requests`,
          errors: sql`${statusSample.errors} + excluded.errors`,
          p50Ms: sql`greatest(${statusSample.p50Ms}, excluded.p50_ms)`,
          p95Ms: sql`greatest(${statusSample.p95Ms}, excluded.p95_ms)`,
          dbOk: sql`${statusSample.dbOk} and excluded.db_ok`,
          dbMs: sql`greatest(${statusSample.dbMs}, excluded.db_ms)`,
        },
      });
  },
  prune: async (cutoff) => {
    if (!db) return;
    await db
      .delete(statusSample)
      .where(sql`${statusSample.bucketStart} < ${cutoff}`);
  },
  onWriteError: () => statusSampleWriteFailures.inc(),
});

/** Called by the tRPC timing middleware for every procedure. */
export const recordStatusSample = recorder.record;
