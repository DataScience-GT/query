"use client";

import { useSyncExternalStore } from "react";

// One shared tick for every clock on the desk, so a list of countdowns
// re-renders once a second rather than once per row. The second is cached
// between ticks: React reads it more than once per render and needs the same
// answer each time.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let second = 0;

const currentSecond = () => Math.floor(Date.now() / 1000) * 1000;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    second = currentSecond();
    timer = setInterval(() => {
      second = currentSecond();
      for (const notify of listeners) notify();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      second = 0;
    }
  };
}

const getSecond = () => second;
const beforeHydration = () => 0;

/**
 * The server's clock, ticking each second, or null until there is a reading.
 * Deadlines are the server's: a phone whose clock runs fast must not cut a
 * judge short, nor a slow one give them extra time. `receivedAt` is when the
 * response carrying `serverNow` arrived (React Query's `dataUpdatedAt`).
 */
export function useServerNow(
  serverNow: Date | undefined,
  receivedAt: number,
): number | null {
  const tick = useSyncExternalStore(subscribe, getSecond, beforeHydration);
  if (!serverNow || tick === 0 || receivedAt === 0) return null;
  return tick + (serverNow.getTime() - receivedAt);
}
