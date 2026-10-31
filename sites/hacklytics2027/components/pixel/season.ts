import { useSyncExternalStore } from "react";
import { BED_SIZE } from "./beds";

// Check-in opens 5pm ET (the JSON-LD startDate). Without an offset the string
// meant midnight in each visitor's own timezone.
export const EVENT_START = new Date("2027-02-26T17:00:00-05:00");
// When the 2027 season opened. Beds fill in from here to EVENT_START: a tenth
// of each in bloom at the start, all of it on the day.
const SEASON_START = new Date("2026-09-01T00:00:00-04:00");

/** How many of a bed's flowers are in bloom at `now`: at least one, all from the event on. */
function bloomCount(now: number) {
  const span = EVENT_START.getTime() - SEASON_START.getTime();
  const progress = Math.min(1, Math.max(0.1, (now - SEASON_START.getTime()) / span));
  return Math.max(1, Math.round(progress * BED_SIZE));
}

const subscribeNoop = () => () => {};

/**
 * The season's bloom count, the one number every bed draws from. 0 in the
 * static HTML (all dormant), then the real count after hydration: a build-time
 * count would be stale by the time anyone loads the page.
 */
export const useInBloom = () =>
  useSyncExternalStore(subscribeNoop, () => bloomCount(Date.now()), () => 0);
