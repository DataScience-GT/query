"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

/** How long the form is left alone before its draft is sent. */
export const DRAFT_QUIET_MS = 1500;

export type DraftSaveStatus = "idle" | "saving" | "saved" | "failed";

/**
 * Keeps the application draft on the server. `answersKey` is the draft as JSON;
 * a save goes out `DRAFT_QUIET_MS` after it last changed, and `flush` sends it
 * now, for the places a person leaves a step (Continue, Back, Cancel).
 *
 * Opening the form is not an edit: the key it opened with counts as saved. One
 * save runs at a time, so a slow one cannot land after a newer one, and what
 * changed while it ran goes out right after it. A failed save is not retried on
 * a timer; the next change or step sends it again, and the browser copy holds
 * the answers meanwhile. The only effect is the debounce timer, which has to
 * outlive the render that started it and is cleared by the next change.
 */
export function useDraftSave({
  hackathonId,
  answersKey,
  enabled,
}: {
  hackathonId: string;
  answersKey: string;
  enabled: boolean;
}) {
  const [status, setStatus] = useState<DraftSaveStatus>("idle");
  const { mutateAsync } = trpc.hackathon.saveMyDraft.useMutation();
  const savedKey = useRef(answersKey);
  const latestKey = useRef(answersKey);
  const inFlight = useRef(false);

  const send = useCallback(
    async function run() {
      if (inFlight.current) return;
      const key = latestKey.current;
      if (key === savedKey.current) return;
      inFlight.current = true;
      setStatus("saving");
      try {
        await mutateAsync({
          hackathonId,
          data: JSON.parse(key) as Record<string, unknown>,
        });
        savedKey.current = key;
        setStatus("saved");
      } catch {
        setStatus("failed");
        return;
      } finally {
        inFlight.current = false;
      }
      if (latestKey.current !== savedKey.current) void run();
    },
    [hackathonId, mutateAsync],
  );

  useEffect(() => {
    latestKey.current = answersKey;
    if (!enabled || answersKey === savedKey.current) return;
    const timer = setTimeout(() => void send(), DRAFT_QUIET_MS);
    return () => clearTimeout(timer);
  }, [answersKey, enabled, send]);

  const flush = useCallback(() => {
    if (enabled) void send();
  }, [enabled, send]);

  return { status, flush };
}
