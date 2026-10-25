// The uptime rules behind /status, kept free of React and the database so the
// definition lives in one place and is tested.
//
// A five-minute bucket (summed across instances) is UP when the database
// answered its ping and fewer than 5% of requests were server errors.
// Uptime % = up minutes / minutes with data. A bucket nobody sent a request
// into does not exist, and counts as neither up nor down.

export const BUCKET_MIN = 5;
export const BUCKET_MS = BUCKET_MIN * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const ERROR_RATE_LIMIT = 0.05;
/** A live ping slower than this is Degraded, not Operational. */
export const SLOW_PING_MS = 1000;

export type Bucket = {
  /** Bucket start, epoch ms. */
  t: number;
  requests: number;
  errors: number;
  /** Slowest instance's p95 for the bucket. */
  p95Ms: number;
  dbOk: boolean;
  dbMs: number;
};

export type Day = {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  requests: number;
  errors: number;
  worstP95Ms: number;
  minutesWithData: number;
  minutesDbDown: number;
  minutesUp: number;
};

export type Live = { dbOk: boolean; dbMs: number; checkedAt: number };

export type Level = "operational" | "degraded" | "down";

export const isUp = (bucket: Bucket) =>
  bucket.dbOk &&
  (bucket.requests === 0 || bucket.errors / bucket.requests < ERROR_RATE_LIMIT);

/** Uptime % over some days, or null when none of them have data. */
export function uptimePercent(
  days: Pick<Day, "minutesUp" | "minutesWithData">[],
) {
  let up = 0;
  let total = 0;
  for (const day of days) {
    up += day.minutesUp;
    total += day.minutesWithData;
  }
  return total === 0 ? null : (up / total) * 100;
}

/**
 * Every day of the window, oldest first, with an empty entry for a day that
 * has no rows, so the strip always has one bar per day.
 */
export function fillDays(rows: Day[], now: number, count = 90): Day[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const today = now - (now % DAY_MS);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(today - (count - 1 - i) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return (
      byDay.get(day) ?? {
        day,
        requests: 0,
        errors: 0,
        worstP95Ms: 0,
        minutesWithData: 0,
        minutesDbDown: 0,
        minutesUp: 0,
      }
    );
  });
}

/** The last 24 hours as 288 slots, oldest first; null where nothing was sampled. */
export function fillBuckets(
  rows: Bucket[],
  now: number,
  count = 288,
): (Bucket | null)[] {
  const byTime = new Map(rows.map((row) => [row.t, row]));
  const last = now - (now % BUCKET_MS);
  return Array.from(
    { length: count },
    (_, i) => byTime.get(last - (count - 1 - i) * BUCKET_MS) ?? null,
  );
}

export type StatusSummary = { level: Level; reason: string };

/**
 * Honest current status. Down needs proof: the live ping failed, or the last
 * quarter hour of real traffic was mostly server errors. Degraded is a slow
 * ping or a recent bucket that broke the uptime rule. Quiet traffic never
 * lowers it.
 */
export function deriveStatus(
  live: Live,
  recent: Bucket[],
  now: number,
): StatusSummary {
  if (!live.dbOk) {
    return {
      level: "down",
      reason: "The database did not answer a check just now.",
    };
  }

  const window = recent.filter((bucket) => bucket.t >= now - 15 * 60 * 1000);
  const requests = window.reduce((sum, b) => sum + b.requests, 0);
  const errors = window.reduce((sum, b) => sum + b.errors, 0);
  if (requests > 0 && errors / requests >= 0.5) {
    return {
      level: "down",
      reason: "Most requests in the last 15 minutes ended in a server error.",
    };
  }

  if (window.some((bucket) => !isUp(bucket))) {
    return {
      level: "degraded",
      reason: "A recent five-minute window broke the uptime rule.",
    };
  }
  if (live.dbMs > SLOW_PING_MS) {
    return {
      level: "degraded",
      reason: `The database took ${live.dbMs} ms to answer.`,
    };
  }

  return {
    level: "operational",
    reason: `The database answered in ${live.dbMs} ms.`,
  };
}
