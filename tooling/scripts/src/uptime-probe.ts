/**
 * External uptime probe, run by .github/workflows/uptime.yml every 5 minutes.
 *
 *   UPTIME_FILE=data/uptime.json node tooling/scripts/src/uptime-probe.ts
 *
 * Probes the DB-free /api/ping, appends the result to uptime.json and keeps the
 * file bounded: the last 24 hours of probes in full, then one aggregate per UTC
 * day for 90 days. /status reads the file; it never calls GitHub itself.
 * Plain Node (built-in type stripping), no dependencies, so the workflow
 * needs no install step.
 *
 * Environment:
 *   UPTIME_URL               probe target (default: production /api/ping)
 *   UPTIME_FILE              file to read and write (default: uptime.json)
 *   UPTIME_RETRY_DELAY_MS    pause between attempts (default: 2000)
 *   DEPLOY_SHA, DEPLOY_COMMITTED_AT, DEPLOY_ROLLOUT
 *                            latest main commit and its rollout result; unset
 *                            keeps the previous value in the file
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const DEFAULT_URL = "https://datasciencegt.org/api/ping";
export const ATTEMPTS = 3;
export const TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 90;
/** One probe every 5 minutes is 288; the cap only guards against a burst. */
const MAX_RECENT = 400;

/**
 * The shape of uptime.json. sites/mainweb/lib/uptime.ts declares the same
 * types for the read side; the probe must not import from the web app, so the
 * two are kept in sync by hand.
 */
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

/** The outcome of one probe, before it is stamped with a time. */
export type ProbeResult = Omit<Probe, "t">;

export type ProbeOptions = {
  attempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
};

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export function emptyData(): UptimeData {
  return { version: 1, updatedAt: 0, recent: [], days: [], deploy: null };
}

/**
 * One probe: up to ATTEMPTS tries, a non-2xx or a timeout is down. Records the
 * first success, else the last failure. `code` is 0 when no response arrived.
 */
export async function probe(
  url: string,
  {
    attempts = ATTEMPTS,
    timeoutMs = TIMEOUT_MS,
    retryDelayMs = 2000,
  }: ProbeOptions = {},
): Promise<ProbeResult> {
  let last: ProbeResult = { ok: false, ms: 0, code: 0 };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    const started = performance.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "dsgt-uptime-probe" },
        cache: "no-store",
      });
      await res.arrayBuffer();
      last = {
        ok: res.status >= 200 && res.status < 300,
        ms: Math.round(performance.now() - started),
        code: res.status,
      };
    } catch {
      last = {
        ok: false,
        ms: Math.round(performance.now() - started),
        code: 0,
      };
    }
    if (last.ok) break;
  }
  return last;
}

/**
 * Pure update. Appends the probe, moves probes older than 24 hours into their
 * UTC day, and drops days beyond 90. Returns a new object.
 */
export function applyProbe(
  previous: UptimeData | null,
  result: ProbeResult,
  now: number,
  deploy?: Deploy | null,
): UptimeData {
  const data = previous && previous.version === 1 ? previous : emptyData();
  const cutoff = now - DAY_MS;
  const all = [...data.recent, { t: now, ...result }].sort((a, b) => a.t - b.t);
  const recent = all.filter((p) => p.t > cutoff).slice(-MAX_RECENT);

  const byDay = new Map(data.days.map((d) => [d.day, { ...d }]));
  for (const p of all.filter((p) => p.t <= cutoff)) {
    const key = dayOf(p.t);
    const day = byDay.get(key) ?? { day: key, probes: 0, up: 0, worstMs: 0 };
    day.probes += 1;
    day.up += p.ok ? 1 : 0;
    day.worstMs = Math.max(day.worstMs, p.ms);
    byDay.set(key, day);
  }
  const oldest = dayOf(now - (KEEP_DAYS - 1) * DAY_MS);
  const days = [...byDay.values()]
    .filter((d) => d.day >= oldest)
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    version: 1,
    updatedAt: now,
    recent,
    days,
    deploy: deploy ?? data.deploy ?? null,
  };
}

async function readData(file: string): Promise<UptimeData | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as UptimeData | null;
  } catch {
    // First run, or a file that cannot be read: start over rather than fail
    // the probe. The history is a convenience, not a record.
    return null;
  }
}

async function main() {
  const url = process.env.UPTIME_URL || DEFAULT_URL;
  const file = process.env.UPTIME_FILE || "uptime.json";
  const result = await probe(url, {
    retryDelayMs: Number(process.env.UPTIME_RETRY_DELAY_MS ?? 2000),
  });
  const { DEPLOY_SHA, DEPLOY_COMMITTED_AT, DEPLOY_ROLLOUT } = process.env;
  const deploy: Deploy | null = DEPLOY_SHA
    ? {
        sha: DEPLOY_SHA,
        committedAt: DEPLOY_COMMITTED_AT || null,
        rollout: DEPLOY_ROLLOUT || "none",
      }
    : null;
  const next = applyProbe(await readData(file), result, Date.now(), deploy);
  await writeFile(file, JSON.stringify(next) + "\n");
  console.log(
    `probe ${result.ok ? "up" : "DOWN"} code=${result.code} ms=${result.ms}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
