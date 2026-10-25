import { parseUptime } from "@/lib/uptime";
import type { UptimeData } from "@/lib/uptime";

/**
 * Data branch written by .github/workflows/uptime.yml. Read here, not from the
 * browser, so the page costs one cached fetch per five minutes however many
 * people open it.
 */
export const UPTIME_URL =
  "https://raw.githubusercontent.com/DataScience-GT/query/status-data/uptime.json";

/** Same deadline as the database reads: a slow host must not stall the page. */
export const UPTIME_TIMEOUT_MS = 3000;

/** Null on any failure, so the page falls back to the database numbers alone. */
export async function loadUptime(): Promise<UptimeData | null> {
  try {
    const res = await fetch(UPTIME_URL, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(UPTIME_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseUptime(await res.json());
  } catch {
    return null;
  }
}
