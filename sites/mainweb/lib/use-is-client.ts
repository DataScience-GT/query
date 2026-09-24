"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and hydration, true on every client render
 * after. Replaces the `useEffect(() => setMounted(true), [])` pattern, which
 * the React Compiler lint rejects as a cascading render.
 */
export function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
