"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active`, so a phone does not lock mid-evaluation
 * with the countdown running. Browsers without the Screen Wake Lock API, and
 * ones that refuse it (low battery), just let the screen sleep.
 */
export function useScreenWake(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let held: WakeLockSentinel | null = null;
    let requesting = false;
    let ended = false;

    const acquire = async () => {
      if (requesting || (held && !held.released)) return;
      requesting = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (ended) void lock.release();
        else held = lock;
      } catch {
        // Refused: the screen may dim, which is no worse than before.
      } finally {
        requesting = false;
      }
    };

    // The browser drops the lock whenever the tab is hidden.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ended = true;
      document.removeEventListener("visibilitychange", onVisible);
      void held?.release();
    };
  }, [active]);
}
