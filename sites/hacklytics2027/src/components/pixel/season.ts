import { useSyncExternalStore } from "react";
import { BED_SIZE } from "./beds";

// When the 2027 season opened. Beds fill in from here to the event's start: a
// tenth of each in bloom at the start, all of it on the day.
const SEASON_START = new Date("2026-09-01T00:00:00-04:00");

/** How many of a bed's flowers are in bloom at `now`: at least one, all from `eventStart` on. */
function bloomCount(now: number, eventStart: number) {
  const span = eventStart - SEASON_START.getTime();
  const progress = Math.min(1, Math.max(0.1, (now - SEASON_START.getTime()) / span));
  return Math.max(1, Math.round(progress * BED_SIZE));
}

const subscribeNoop = () => () => {};

/**
 * The season's bloom count, the one number every bed draws from. 0 in the
 * static HTML (all dormant), then the real count after hydration: a build-time
 * count would be stale by the time anyone loads the page. `eventStart` is the
 * event's start in epoch milliseconds, passed in as a prop so the island does
 * not bundle the whole event config.
 */
export const useInBloom = (eventStart: number) =>
  useSyncExternalStore(subscribeNoop, () => bloomCount(Date.now(), eventStart), () => 0);
