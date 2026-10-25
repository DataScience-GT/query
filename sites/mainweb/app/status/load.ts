import { unstable_cache } from "next/cache";
import { db, sql } from "@query/db";
import {
  BUCKET_MS,
  DAY_MS,
  ERROR_RATE_LIMIT,
  dayFromBuckets,
  deriveStatus,
  fillBuckets,
  fillDays
  
  
  
  
} from "@/lib/status";
import type {Bucket, Day, Live, StatusSummary} from "@/lib/status";

export type StatusData = {
  generatedAt: number;
  live: Live;
  summary: StatusSummary;
  /** False when the history query failed; the charts then say so. */
  historyOk: boolean;
  hours: (Bucket | null)[];
  days: Day[];
};

/** A connection that stops answering must read as Down, not hang the page. */
export const DB_TIMEOUT_MS = 3000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("database timeout")),
      DB_TIMEOUT_MS,
    );
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

async function pingDatabase(): Promise<Live> {
  const checkedAt = Date.now();
  if (!db) return { dbOk: false, dbMs: 0, checkedAt };
  const started = performance.now();
  try {
    await withTimeout(db.execute(sql`select 1`));
    return {
      dbOk: true,
      dbMs: Math.round(performance.now() - started),
      checkedAt,
    };
  } catch {
    return {
      dbOk: false,
      dbMs: Math.round(performance.now() - started),
      checkedAt,
    };
  }
}

// Instances are summed per bucket first, because the uptime rule applies to
// the bucket, not to a single instance. The slowest instance's p95 stands in
// for the bucket's: an average of percentiles is not a percentile.
const perBucket = (since: Date, until?: Date) => sql`
  select
    bucket_start,
    sum(requests)::int as requests,
    sum(errors)::int as errors,
    max(p95_ms)::int as p95_ms,
    bool_and(db_ok) as db_ok,
    max(db_ms)::int as db_ms
  from status_sample
  where bucket_start >= ${since}${until ? sql` and bucket_start < ${until}` : sql``}
  group by bucket_start`;

type BucketRow = {
  bucket_start: Date;
  requests: number;
  errors: number;
  p95_ms: number;
  db_ok: boolean;
  db_ms: number;
};

type DayRow = {
  day: string;
  requests: number;
  errors: number;
  worst_p95_ms: number;
  buckets: number;
  buckets_db_down: number;
  buckets_up: number;
};

/** Finished days do not change, so they are read once and kept for hours. */
const DAILY_REVALIDATE_S = 6 * 60 * 60;

async function queryDays(todayStart: number): Promise<Day[]> {
  if (!db) throw new Error("no database");
  const since90d = new Date(todayStart - 89 * DAY_MS);
  const until = new Date(todayStart);
  const daily = await withTimeout(
    db.execute<DayRow>(sql`
        select
          to_char(date_trunc('day', bucket_start at time zone 'UTC'), 'YYYY-MM-DD') as day,
          sum(requests)::int as requests,
          sum(errors)::int as errors,
          max(p95_ms)::int as worst_p95_ms,
          count(*)::int as buckets,
          (count(*) filter (where not db_ok))::int as buckets_db_down,
          (count(*) filter (
            where db_ok and (requests = 0 or errors::float / requests < ${ERROR_RATE_LIMIT})
          ))::int as buckets_up
        from (${perBucket(since90d, until)}) b
        group by 1
        order by 1`),
  );
  return daily.rows.map((row) => ({
    day: row.day,
    requests: row.requests,
    errors: row.errors,
    worstP95Ms: row.worst_p95_ms,
    minutesWithData: row.buckets * 5,
    minutesDbDown: row.buckets_db_down * 5,
    minutesUp: row.buckets_up * 5,
  }));
}

// A thrown error is never cached, so a failed read is retried on the next
// render. The key carries the UTC day, so the entry rolls over at midnight.
const completedDays = (todayStart: number) =>
  unstable_cache(queryDays, ["status-days", String(todayStart)], {
    revalidate: DAILY_REVALIDATE_S,
  })(todayStart);

async function loadHistory(now: number) {
  if (!db) throw new Error("no database");
  const lastBucket = now - (now % BUCKET_MS);
  const since24h = new Date(lastBucket - 287 * BUCKET_MS);
  const todayStart = now - (now % DAY_MS);

  const [recent, past] = await Promise.all([
    withTimeout(
      db.execute<BucketRow>(sql`${perBucket(since24h)} order by bucket_start`),
    ),
    completedDays(todayStart),
  ]);

  const hours: Bucket[] = recent.rows.map((row) => ({
    t: new Date(row.bucket_start).getTime(),
    requests: row.requests,
    errors: row.errors,
    p95Ms: row.p95_ms,
    dbOk: row.db_ok,
    dbMs: row.db_ms,
  }));
  // Today is read from the 24 hour rows, not scanned again.
  const today = dayFromBuckets(
    hours,
    new Date(todayStart).toISOString().slice(0, 10),
  );
  const days = today ? [...past, today] : past;
  return { hours, days };
}

/**
 * Everything /status renders. Aggregates only. A database that is asleep or
 * unreachable gives an empty history and a Down status rather than a failed
 * page, the same as /events.
 */
export async function loadStatus(): Promise<StatusData> {
  const now = Date.now();
  const live = await pingDatabase();

  let history: { hours: Bucket[]; days: Day[] } = { hours: [], days: [] };
  let historyOk = true;
  if (live.dbOk) {
    try {
      history = await loadHistory(now);
    } catch (error) {
      historyOk = false;
      console.error("Failed to load status history", error);
    }
  } else {
    historyOk = false;
  }

  return {
    generatedAt: now,
    live,
    summary: deriveStatus(live, history.hours, now),
    historyOk,
    hours: fillBuckets(history.hours, now),
    days: fillDays(history.days, now),
  };
}
