"use client";

import { useEffect, useRef, useState } from "react";

export interface JudgingSnapshot {
  hackathonId: string;
  timestamp: number;
  totalProjects: number;
  totalQueueItems: number;
  completedQueueItems: number;
  completionPct: number;
  judgesActive: number;
  topProjects: { projectId: string; votes: number; avg: number }[];
}

/**
 * Subscribes to the /api/judge-stream/:hackathonId SSE endpoint and returns
 * the latest snapshot. Reconnects automatically on drop (up to maxRetries).
 *
 * @example
 * const { snapshot, connected } = useJudgingStream(hackathonId);
 */
export function useJudgingStream(
  hackathonId: string | null | undefined,
  {
    enabled = true,
    maxRetries = 5,
  }: { enabled?: boolean; maxRetries?: number } = {},
) {
  const [snapshot, setSnapshot] = useState<JudgingSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !hackathonId) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // onerror can fire after unmount (closing the socket can trigger it), which
    // would schedule a reconnect the cleanup has already run past.
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const es = new EventSource(`/api/judge-stream/${hackathonId}`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
        retryCount.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as JudgingSnapshot;
          setSnapshot(data);
        } catch {
          // skip malformed frames
        }
      };

      es.onerror = () => {
        es.close();
        if (cancelled) return;
        setConnected(false);

        if (retryCount.current < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s …
          const delay = Math.min(2 ** retryCount.current * 1000, 30_000);
          retryCount.current++;
          retryTimer = setTimeout(connect, delay);
        } else {
          setError("Live stream unavailable — refresh to retry.");
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      esRef.current?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [hackathonId, enabled, maxRetries]);

  return { snapshot, connected, error };
}
