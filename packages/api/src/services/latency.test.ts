import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { trpcDuration } from "./metrics";
import { publicProcedure, protectedProcedure, uploadProcedure } from "../trpc";
import { appRouter } from "../root";

// p95 and p99 are read off a histogram, so they are only as good as its bucket
// edges: a quantile is interpolated inside whichever bucket it lands in, and a
// threshold with no edge near it is a straight line drawn across the range the
// alert fires on. These tests hold the edges, the interpolation and the rules
// that read them together.

const rules = readFileSync(
  fileURLToPath(
    new URL("../../../../monitoring/rules/payments.yml", import.meta.url),
  ),
  "utf-8",
);

const buckets = (trpcDuration as unknown as { upperBounds: number[] })
  .upperBounds;

/** Prometheus `histogram_quantile`, over cumulative bucket counts. */
function histogramQuantile(
  q: number,
  counts: { le: number; count: number }[],
  total: number,
) {
  const rank = q * total;
  for (let i = 0; i < counts.length; i += 1) {
    const bucket = counts[i]!;
    if (bucket.count < rank) continue;

    const lower = i === 0 ? 0 : counts[i - 1]!.le;
    const lowerCount = i === 0 ? 0 : counts[i - 1]!.count;
    if (!Number.isFinite(bucket.le)) return lower;

    const span = bucket.count - lowerCount;
    if (span === 0) return bucket.le;
    return lower + (bucket.le - lower) * ((rank - lowerCount) / span);
  }
  return counts[counts.length - 1]!.le;
}

/** Cumulative counts for a set of observed durations, in this metric's buckets. */
function observe(durations: number[]) {
  const edges = [...buckets, Number.POSITIVE_INFINITY];
  return edges.map((le) => ({
    le,
    count: durations.filter((d) => d <= le).length,
  }));
}

/**
 * Every `> N` threshold in seconds, from the alerts that read this histogram.
 * Split per alert so a counter alert next door cannot be mistaken for one.
 */
function latencyThresholds() {
  return (
    rules
      .split(/^\s*- alert:/m)
      .slice(1)
      .filter((block) => /dsgt_trpc_duration_seconds/.test(block))
      .flatMap((block) => [...block.matchAll(/>\s*([\d.]+)/g)])
      .map((match) => Number(match[1]))
      // The error-rate alert compares a ratio, not seconds.
      .filter((threshold) => threshold >= 1)
  );
}

describe("histogram buckets", () => {
  it("climb, and never repeat an edge", () => {
    expect(buckets.length).toBeGreaterThan(0);
    for (let i = 1; i < buckets.length; i += 1) {
      expect(buckets[i]!).toBeGreaterThan(buckets[i - 1]!);
    }
  });

  it("puts an edge on every latency threshold that is alerted on", () => {
    const thresholds = latencyThresholds();
    expect(thresholds.length).toBeGreaterThan(0);

    // Without an edge at the threshold, the alert fires on an interpolation
    // across the bucket the threshold sits inside.
    for (const threshold of thresholds) {
      expect(buckets).toContain(threshold);
    }
  });

  it("does not more than double across the tail", () => {
    // Below 0.5 the resolution does not matter — nothing alerts there.
    const tail = buckets.filter((edge) => edge >= 0.5);
    for (let i = 1; i < tail.length; i += 1) {
      expect(tail[i]! / tail[i - 1]!).toBeLessThanOrEqual(2);
    }
  });
});

describe("p95 and p99 over these buckets", () => {
  it("keeps a healthy service well under both alert thresholds", () => {
    const counts = observe(Array.from({ length: 1000 }, () => 0.04));

    expect(histogramQuantile(0.95, counts, 1000)).toBeLessThan(0.1);
    expect(histogramQuantile(0.99, counts, 1000)).toBeLessThan(0.1);
  });

  it("puts p99 above p95, which is the reason both are recorded", () => {
    // 970 fast calls, 30 slow ones: the tail moves, the median does not.
    const counts = observe([
      ...Array.from({ length: 970 }, () => 0.04),
      ...Array.from({ length: 30 }, () => 4),
    ]);

    const p95 = histogramQuantile(0.95, counts, 1000);
    const p99 = histogramQuantile(0.99, counts, 1000);

    expect(p95).toBeLessThan(p99);
    // The p95 alert stays quiet at 2s; the p99 alert is what catches this.
    expect(p95).toBeLessThan(2);
    expect(p99).toBeGreaterThan(2.5);
  });

  it("catches a service that is slow for everybody", () => {
    const counts = observe(Array.from({ length: 1000 }, () => 6));

    expect(histogramQuantile(0.95, counts, 1000)).toBeGreaterThan(2);
    expect(histogramQuantile(0.99, counts, 1000)).toBeGreaterThan(5);
  });

  it("reports a quantile inside the bucket it lands in, never outside it", () => {
    for (const trueValue of [0.03, 0.3, 0.9, 1.7, 3, 7]) {
      const counts = observe(Array.from({ length: 100 }, () => trueValue));
      const reported = histogramQuantile(0.99, counts, 100);

      const upper = buckets.find((edge) => edge >= trueValue);
      const lower =
        [...buckets].reverse().find((edge) => edge < trueValue) ?? 0;

      // Interpolation is allowed to be wrong, but only within one bucket.
      expect(reported).toBeGreaterThanOrEqual(lower);
      if (upper !== undefined) expect(reported).toBeLessThanOrEqual(upper);
    }
  });

  it("cannot report above the last finite edge", () => {
    // Everything past 10s falls in +Inf, which has no upper bound to
    // interpolate towards, so 10 is the largest number this can ever say.
    const counts = observe(Array.from({ length: 100 }, () => 120));

    expect(histogramQuantile(0.99, counts, 100)).toBe(10);
  });
});

describe("the rules that read them", () => {
  it("takes its quantiles from the bucket series, grouped by le", () => {
    const quantileExprs = rules
      .split("histogram_quantile(")
      .slice(1)
      .map((chunk) => chunk.slice(0, 200));

    expect(quantileExprs.length).toBeGreaterThan(0);

    for (const expr of quantileExprs) {
      // histogram_quantile over anything but `_bucket` grouped by `le` returns
      // nothing at all — a silent no-data alert that never fires.
      expect(expr).toContain("_bucket");
      expect(expr).toMatch(/sum by \(le[,)]/);
    }
  });

  it("records p99 for the whole API and per procedure", () => {
    expect(rules).toContain("record: job:dsgt_trpc_duration_seconds:p99");
    expect(rules).toContain("record: procedure:dsgt_trpc_duration_seconds:p99");

    const perProcedure = rules.slice(
      rules.indexOf("record: procedure:dsgt_trpc_duration_seconds:p99"),
    );
    expect(perProcedure).toMatch(/sum by \(le, procedure\)/);
  });

  it("alerts only on recorded names that exist", () => {
    const recorded = [...rules.matchAll(/record:\s*(\S+)/g)].map((m) => m[1]!);
    const referenced = [
      ...rules.matchAll(/expr:\s*(job|procedure):(\S+)/g),
    ].map((m) => `${m[1]}:${m[2]}`);

    for (const name of referenced) {
      expect(recorded).toContain(name);
    }
  });
});

describe("what gets measured", () => {
  // The timer is the first middleware on every base builder, so this is the
  // same function object each procedure should carry.
  const timer = (
    publicProcedure as unknown as { _def: { middlewares: unknown[] } }
  )._def.middlewares[0];

  const chainOf = (procedure: unknown) =>
    (procedure as { _def: { middlewares: unknown[] } })._def.middlewares;

  it("times every base builder with the same middleware", () => {
    expect(timer).toBeTruthy();
    expect(chainOf(protectedProcedure)).toContain(timer);
    expect(chainOf(uploadProcedure)).toContain(timer);
  });

  it("times every procedure the router exposes", () => {
    const procedures = Object.entries(
      (
        appRouter as unknown as {
          _def: { procedures: Record<string, unknown> };
        }
      )._def.procedures,
    );

    // A vacuous pass here would be worse than a failure.
    expect(procedures.length).toBeGreaterThan(100);

    // A procedure with no timer contributes to no percentile: it is invisible
    // in both p95 and p99 no matter how slow it is.
    const untimed = procedures
      .filter(([, procedure]) => !chainOf(procedure).includes(timer))
      .map(([name]) => name);

    expect(untimed).toEqual([]);
  });

  it("labels each observation with a path from that fixed set", () => {
    const names = Object.keys(
      (
        appRouter as unknown as {
          _def: { procedures: Record<string, unknown> };
        }
      )._def.procedures,
    );

    // The label is bounded because the paths are; an unbounded label value is
    // what turns a histogram into a cardinality incident.
    for (const name of names) {
      expect(name).toMatch(/^[a-zA-Z0-9.]+$/);
    }
  });
});
