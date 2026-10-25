// Read side of the external uptime probe (tooling/scripts/src/uptime-probe.ts
// writes uptime.json; .github/workflows/uptime.yml runs it). The types below
// mirror that file's; keep them in sync. Free of React and the
// network so the rules are tested in one place.
//
// The probe hits /api/ping from outside every 5 minutes. Down needs two failed
// probes in a row; a result older than 30 minutes says nothing about now, so
// it is reported as stale instead.

import { DAY_MS } from "./status";
import type { Day, StatusSummary } from "./status";

export type Probe = { t: number; ok: boolean; ms: number; code: number };
export type ProbeDay = {
  day: string;
  probes: number;
  up: number;
  worstMs: number;
};
export type Deploy = {
  sha: string;
  committedAt: string | null;
  rollout: string;
};
export type UptimeData = {
  version: 1;
  updatedAt: number;
  recent: Probe[];
  days: ProbeDay[];
  deploy: Deploy | null;
};

/** A probe older than this no longer says whether the site is up. */
export const STALE_MS = 30 * 60 * 1000;

/** Accepts the file as fetched; null when it is not the shape we wrote. */
export function parseUptime(raw: unknown): UptimeData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<UptimeData>;
  if (data.version !== 1 || !Array.isArray(data.recent)) return null;
  if (!Array.isArray(data.days)) return null;
  if (typeof data.updatedAt !== "number") return null;
  return {
    version: 1,
    updatedAt: data.updatedAt,
    recent: data.recent,
    days: data.days,
    deploy: data.deploy ?? null,
  };
}

/** Probes in the 24 hour window plus the daily rollups, as one list of days. */
export function combinedDays(data: UptimeData): ProbeDay[] {
  const byDay = new Map(data.days.map((d) => [d.day, { ...d }]));
  for (const p of data.recent) {
    const key = new Date(p.t).toISOString().slice(0, 10);
    const day = byDay.get(key) ?? { day: key, probes: 0, up: 0, worstMs: 0 };
    day.probes += 1;
    day.up += p.ok ? 1 : 0;
    day.worstMs = Math.max(day.worstMs, p.ms);
    byDay.set(key, day);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The last `count` UTC days, oldest first, shaped like the traffic days so the
 * same strip draws them. Requests and errors are probes and failed probes;
 * minutes are probe counts, which only matter as a ratio.
 */
export function probeDays(data: UptimeData, now: number, count = 90): Day[] {
  const byDay = new Map(combinedDays(data).map((d) => [d.day, d]));
  const today = now - (now % DAY_MS);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(today - (count - 1 - i) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const mine = byDay.get(day);
    return {
      day,
      requests: mine?.probes ?? 0,
      errors: mine ? mine.probes - mine.up : 0,
      worstP95Ms: mine?.worstMs ?? 0,
      minutesWithData: mine?.probes ?? 0,
      minutesDbDown: 0,
      minutesUp: mine?.up ?? 0,
    };
  });
}

/** Share of probes that succeeded, or null when there were none. */
export function probePercent(probes: { up: number; total: number }) {
  return probes.total === 0 ? null : (probes.up / probes.total) * 100;
}

export type UptimeWindows = {
  h24: number | null;
  d30: number | null;
  d90: number | null;
};

export function uptimeWindows(data: UptimeData, now: number): UptimeWindows {
  const last24 = data.recent.filter((p) => p.t > now - DAY_MS);
  const days = probeDays(data, now);
  const sum = (list: Day[]) => ({
    up: list.reduce((s, d) => s + d.minutesUp, 0),
    total: list.reduce((s, d) => s + d.minutesWithData, 0),
  });
  return {
    h24: probePercent({
      up: last24.filter((p) => p.ok).length,
      total: last24.length,
    }),
    d30: probePercent(sum(days.slice(-30))),
    d90: probePercent(sum(days)),
  };
}

export type ExternalState =
  | { kind: "ok"; last: Probe }
  | { kind: "down"; last: Probe }
  | { kind: "stale"; last: Probe | null };

/**
 * Stale wins over down: two failures from yesterday prove nothing about now.
 * Down is the last two probes both failing; one failure alone is not enough,
 * the probe already retried three times and a single miss can be the network
 * between GitHub and us.
 */
export function externalState(data: UptimeData, now: number): ExternalState {
  const last = data.recent[data.recent.length - 1] ?? null;
  if (!last || now - last.t > STALE_MS) return { kind: "stale", last };
  const previous = data.recent[data.recent.length - 2];
  if (!last.ok && previous && !previous.ok) return { kind: "down", last };
  return { kind: "ok", last };
}

/**
 * Folds the outside view into the headline. Down from outside overrides
 * whatever the database says; every other case leaves the DB-based summary
 * alone, so a stale or healthy probe never hides a database problem.
 */
export function foldProbe(
  summary: StatusSummary,
  state: ExternalState | null,
): StatusSummary {
  if (state?.kind !== "down") return summary;
  return {
    level: "down",
    reason: "The last two outside checks could not reach the site.",
  };
}
