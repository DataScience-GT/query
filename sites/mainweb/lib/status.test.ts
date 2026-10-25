import { describe, it, expect } from "vitest";
import {
  BUCKET_MS,
  DAY_MS,
  dayFromBuckets,
  deriveStatus,
  fillBuckets,
  fillDays,
  isUp,
  uptimePercent,
} from "./status";
import type { Bucket, Day } from "./status";

const NOW = Date.UTC(2026, 5, 15, 12, 7, 0);
const bucket = (over: Partial<Bucket> = {}): Bucket => ({
  t: NOW - (NOW % BUCKET_MS) - BUCKET_MS,
  requests: 100,
  errors: 0,
  p95Ms: 80,
  dbOk: true,
  dbMs: 10,
  ...over,
});
const live = { dbOk: true, dbMs: 12, checkedAt: NOW };

describe("isUp", () => {
  it("needs the database up and an error rate under 5%", () => {
    expect(isUp(bucket())).toBe(true);
    expect(isUp(bucket({ errors: 4 }))).toBe(true);
    expect(isUp(bucket({ errors: 5 }))).toBe(false);
    expect(isUp(bucket({ dbOk: false }))).toBe(false);
  });

  it("treats a bucket with no requests as up when the database answered", () => {
    expect(isUp(bucket({ requests: 0 }))).toBe(true);
  });
});

describe("uptimePercent", () => {
  const day = (up: number, total: number): Day => ({
    day: "2026-01-01",
    requests: 0,
    errors: 0,
    worstP95Ms: 0,
    minutesWithData: total,
    minutesDbDown: 0,
    minutesUp: up,
  });

  it("is up minutes over minutes with data", () => {
    expect(uptimePercent([day(95, 100), day(100, 100)])).toBe(97.5);
  });

  it("is null, not 100, when there is no data", () => {
    expect(uptimePercent([day(0, 0)])).toBeNull();
    expect(uptimePercent([])).toBeNull();
  });
});

describe("fillDays", () => {
  it("returns one entry per day, oldest first, ending today", () => {
    const days = fillDays([], NOW);
    expect(days).toHaveLength(90);
    expect(days.at(-1)?.day).toBe("2026-06-15");
    expect(days.at(0)?.day).toBe(
      new Date(Date.UTC(2026, 5, 15) - 89 * DAY_MS).toISOString().slice(0, 10),
    );
    expect(days.every((d) => d.minutesWithData === 0)).toBe(true);
  });

  it("keeps the rows it is given", () => {
    const row: Day = {
      day: "2026-06-14",
      requests: 9,
      errors: 0,
      worstP95Ms: 5,
      minutesWithData: 10,
      minutesDbDown: 0,
      minutesUp: 10,
    };
    expect(fillDays([row], NOW)[88]).toBe(row);
  });
});

describe("fillBuckets", () => {
  it("returns 288 slots with null where nothing was sampled", () => {
    const b = bucket({ t: NOW - (NOW % BUCKET_MS) });
    const slots = fillBuckets([b], NOW);
    expect(slots).toHaveLength(288);
    expect(slots[287]).toBe(b);
    expect(slots.filter(Boolean)).toHaveLength(1);
  });
});

describe("deriveStatus", () => {
  it("is operational on a healthy ping and healthy traffic", () => {
    expect(deriveStatus(live, [bucket()], NOW).level).toBe("operational");
  });

  it("is operational when it is quiet: no data is not an outage", () => {
    expect(deriveStatus(live, [], NOW).level).toBe("operational");
  });

  it("is down when the live ping fails", () => {
    expect(deriveStatus({ ...live, dbOk: false }, [], NOW).level).toBe("down");
  });

  it("is down when recent traffic is mostly server errors", () => {
    const recent = [bucket({ errors: 80 })];
    expect(deriveStatus(live, recent, NOW).level).toBe("down");
  });

  it("is degraded when a recent bucket broke the rule", () => {
    const recent = [bucket({ errors: 10 })];
    expect(deriveStatus(live, recent, NOW).level).toBe("degraded");
  });

  it("ignores a bad bucket that is older than 15 minutes", () => {
    const old = bucket({ t: NOW - 60 * 60 * 1000, errors: 90 });
    expect(deriveStatus(live, [old], NOW).level).toBe("operational");
  });

  it("is degraded on a slow ping", () => {
    expect(deriveStatus({ ...live, dbMs: 2500 }, [], NOW).level).toBe(
      "degraded",
    );
  });
});

describe("dayFromBuckets", () => {
  const DAY = "2026-06-15";
  const at = (minutes: number, over: Partial<Bucket> = {}) =>
    bucket({ t: Date.UTC(2026, 5, 15, 0, minutes), ...over });

  it("is null when the day has no buckets", () => {
    expect(dayFromBuckets([], DAY)).toBeNull();
    expect(dayFromBuckets([bucket({ t: NOW - DAY_MS })], DAY)).toBeNull();
  });

  it("ignores buckets from other UTC days", () => {
    const rows = [
      bucket({ t: Date.UTC(2026, 5, 14, 23, 55) }),
      at(0),
      bucket({ t: Date.UTC(2026, 5, 16, 0, 0) }),
    ];
    expect(dayFromBuckets(rows, DAY)?.minutesWithData).toBe(5);
  });

  it("sums traffic, takes the worst p95 and counts minutes", () => {
    const rows = [
      at(0, { requests: 100, errors: 1, p95Ms: 80 }),
      at(5, { requests: 50, errors: 5, p95Ms: 400 }),
      at(10, { requests: 0, errors: 0, p95Ms: 0 }),
      at(15, { dbOk: false }),
    ];
    expect(dayFromBuckets(rows, DAY)).toEqual({
      day: DAY,
      requests: 250,
      errors: 6,
      worstP95Ms: 400,
      minutesWithData: 20,
      minutesDbDown: 5,
      // 5 of 50 is 10%, over the limit; the db-down bucket is not up either
      minutesUp: 10,
    });
  });

  it("agrees with isUp at the error-rate boundary", () => {
    const rows = [
      at(0, { requests: 100, errors: 4 }),
      at(5, { requests: 100, errors: 5 }),
      at(10, { requests: 0, errors: 0 }),
    ];
    expect(dayFromBuckets(rows, DAY)?.minutesUp).toBe(rows.filter(isUp).length * 5);
    expect(dayFromBuckets(rows, DAY)?.minutesUp).toBe(10);
  });
});
