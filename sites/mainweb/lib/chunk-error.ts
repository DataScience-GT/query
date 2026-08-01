"use client";

import { useEffect } from "react";

/**
 * A chunk-load failure means the browser is holding HTML from an older build
 * and asked for a JS chunk whose hash no longer exists on the server. Calling
 * an error boundary's reset() cannot fix it — re-rendering requests the same
 * dead URL. Only a full document reload picks up the new build.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { name?: string; message?: string };
  const message = err.message ?? "";
  return (
    err.name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to load chunk/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

const RELOAD_FLAG = "chunk-reload-attempted";

/**
 * Reloads once when the boundary caught a stale-chunk error. The sessionStorage
 * flag stops a genuinely-missing chunk from causing an endless reload loop.
 */
export function useChunkErrorRecovery(error: unknown): boolean {
  const isChunkError = isChunkLoadError(error);

  useEffect(() => {
    if (!isChunkError) {
      // A clean render means the app recovered; allow a future auto-reload.
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        // sessionStorage can throw in private modes — recovery is best-effort.
      }
      return;
    }

    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === "1";
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {
      // If storage is unavailable, fall through and reload once.
    }

    if (!alreadyTried) {
      window.location.reload();
    }
  }, [isChunkError]);

  return isChunkError;
}
