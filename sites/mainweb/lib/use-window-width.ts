"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/**
 * `window.innerWidth`, kept current on resize. `serverWidth` is what the
 * server render and hydration see, before the real width is known.
 */
export function useWindowWidth(serverWidth: number) {
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => serverWidth,
  );
}
