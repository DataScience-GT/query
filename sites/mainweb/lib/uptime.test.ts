import { describe, expect, it } from "vitest";
import {
  STALE_MS,
  combinedDays,
  externalState,
  foldProbe,
  parseUptime,
  probeDays,
  uptimeWindows,
} from "./uptime";
import type { Probe, UptimeData } from "./uptime";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const MIN = 60 * 1000;
const probe = (agoMin: number, ok = true): Probe => ({
  t: NOW - agoMin * MIN,
  ok,
  ms: 90,
  code: ok ? 200 : 0,
});
const data = (over: Partial<UptimeData> = {}): UptimeData => ({
  version: 1,
  updatedAt: NOW,
  recent: [],
  days: [],
  deploy: null,
  ...over,
});

describe("parseUptime", () => {
  it("rejects anything that is not the file we write", () => {
    expect(parseUptime(null)).toBeNull();
    expect(parseUptime({ version: 2, recent: [], days: [] })).toBeNull();
    expect(parseUptime({ version: 1, recent: [] })).toBeNull();
    expect(parseUptime(data())).not.toBeNull();
  });
});

describe("externalState", () => {
  it("is ok when the newest probe passed", () => {
    expect(
      externalState(data({ recent: [probe(10, false), probe(5)] }), NOW).kind,
    ).toBe("ok");
  });

  it("is ok after a single failure", () => {
    expect(
      externalState(data({ recent: [probe(10), probe(5, false)] }), NOW).kind,
    ).toBe("ok");
  });

  it("is down after two failures in a row", () => {
    expect(
      externalState(data({ recent: [probe(10, false), probe(5, false)] }), NOW)
        .kind,
    ).toBe("down");
  });

  it("is stale past 30 minutes, even if the old probes failed", () => {
    const old = (STALE_MS + MIN) / MIN;
    expect(
      externalState(
        data({ recent: [probe(old + 5, false), probe(old, false)] }),
        NOW,
      ).kind,
    ).toBe("stale");
  });

  it("is stale with no probes at all", () => {
    expect(externalState(data(), NOW)).toEqual({ kind: "stale", last: null });
  });
});

describe("foldProbe", () => {
  const ok = { level: "operational", reason: "db fine" } as const;

  it("overrides to down when two probes failed, whatever the database says", () => {
    const state = externalState(
      data({ recent: [probe(10, false), probe(5, false)] }),
      NOW,
    );
    expect(foldProbe(ok, state).level).toBe("down");
  });

  it("leaves the summary alone otherwise", () => {
    expect(foldProbe(ok, { kind: "ok", last: probe(5) })).toBe(ok);
    expect(foldProbe(ok, { kind: "stale", last: null })).toBe(ok);
    expect(foldProbe(ok, null)).toBe(ok);
  });
});

describe("windows", () => {
  it("combines rolled days with the last 24 hours", () => {
    const d = data({
      days: [{ day: "2026-06-14", probes: 100, up: 90, worstMs: 300 }],
      recent: [probe(10), probe(5, false)],
    });
    expect(combinedDays(d).map((x) => [x.day, x.probes, x.up])).toEqual([
      ["2026-06-14", 100, 90],
      ["2026-06-15", 2, 1],
    ]);
    const w = uptimeWindows(d, NOW);
    expect(w.h24).toBe(50);
    expect(w.d90).toBeCloseTo((91 / 102) * 100);
  });

  it("is null with no probes", () => {
    expect(uptimeWindows(data(), NOW)).toEqual({
      h24: null,
      d30: null,
      d90: null,
    });
  });

  it("gives one entry per day for the strip", () => {
    const days = probeDays(data({ recent: [probe(5)] }), NOW);
    expect(days).toHaveLength(90);
    expect(days[89]).toMatchObject({
      day: "2026-06-15",
      minutesWithData: 1,
      minutesUp: 1,
    });
    expect(days[0].minutesWithData).toBe(0);
  });
});
