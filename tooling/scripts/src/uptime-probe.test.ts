import { describe, expect, it } from "vitest";
import { applyProbe, emptyData } from "./uptime-probe.ts";
import type { UptimeData } from "./uptime-probe.ts";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const up = { ok: true, ms: 80, code: 200 };
const down = { ok: false, ms: 10000, code: 0 };

describe("applyProbe", () => {
  it("starts a fresh file from nothing", () => {
    const data = applyProbe(null, up, NOW);
    expect(data.version).toBe(1);
    expect(data.updatedAt).toBe(NOW);
    expect(data.recent).toEqual([{ t: NOW, ...up }]);
    expect(data.days).toEqual([]);
    expect(data.deploy).toBeNull();
  });

  it("starts over on an unknown version", () => {
    const stale = { version: 9, recent: [1], days: [1] };
    const data = applyProbe(stale as unknown as UptimeData, up, NOW);
    expect(data.recent).toHaveLength(1);
    expect(data.days).toEqual([]);
  });

  it("rolls probes older than 24 hours into their UTC day", () => {
    const start = applyProbe(null, up, NOW - 25 * HOUR);
    const mid = applyProbe(start, down, NOW - 25 * HOUR + 1000);
    const data = applyProbe(mid, up, NOW);
    expect(data.recent).toEqual([{ t: NOW, ...up }]);
    expect(data.days).toEqual([
      { day: "2026-06-14", probes: 2, up: 1, worstMs: 10000 },
    ]);
  });

  it("merges into an existing day instead of duplicating it", () => {
    const old = {
      ...emptyData(),
      days: [{ day: "2026-06-14", probes: 10, up: 10, worstMs: 120 }],
      recent: [{ t: NOW - 25 * HOUR, ...up }],
    };
    const data = applyProbe(old, up, NOW);
    expect(data.days).toEqual([
      { day: "2026-06-14", probes: 11, up: 11, worstMs: 120 },
    ]);
  });

  it("keeps 90 days and drops older ones", () => {
    const days = Array.from({ length: 95 }, (_, i) => ({
      day: new Date(NOW - (94 - i) * 24 * HOUR).toISOString().slice(0, 10),
      probes: 288,
      up: 288,
      worstMs: 100,
    }));
    const data = applyProbe({ ...emptyData(), days }, up, NOW);
    expect(data.days).toHaveLength(90);
    expect(data.days[0].day).toBe("2026-03-18");
  });

  it("stays bounded under a burst of probes", () => {
    let data = emptyData();
    for (let i = 0; i < 500; i++) data = applyProbe(data, up, NOW + i * 1000);
    expect(data.recent.length).toBeLessThanOrEqual(400);
  });

  it("keeps the previous deploy unless a new one is given", () => {
    const deploy = {
      sha: "abc",
      committedAt: "2026-06-15T11:00:00Z",
      rollout: "success",
    };
    const first = applyProbe(null, up, NOW, deploy);
    expect(applyProbe(first, up, NOW + 1000).deploy).toEqual(deploy);
    const next = { ...deploy, sha: "def" };
    expect(applyProbe(first, up, NOW + 1000, next).deploy).toEqual(next);
  });
});
