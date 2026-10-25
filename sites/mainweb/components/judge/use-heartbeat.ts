"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

/**
 * Keeps beating in a hidden tab: a judge reading Devpost in another tab is
 * still in the room, and 10 quiet minutes would get their presentations moved.
 * Window focus is handled by `beatOnReturn`, so react-query's own is off.
 */
export const HEARTBEAT_POLL = {
  refetchInterval: 60_000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: false,
  staleTime: 0,
  retry: false,
} as const;

/** Calls `beat` as soon as the tab is shown again or the window regains focus. */
export function beatOnReturn(
  doc: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >,
  win: Pick<Window, "addEventListener" | "removeEventListener">,
  beat: () => void,
) {
  const onVisible = () => {
    if (doc.visibilityState === "visible") beat();
  };
  doc.addEventListener("visibilitychange", onVisible);
  win.addEventListener("focus", beat);
  return () => {
    doc.removeEventListener("visibilitychange", onVisible);
    win.removeEventListener("focus", beat);
  };
}

/** Tells organisers the judge is still in their room. */
export function useHeartbeat(hackathonId: string) {
  const utils = trpc.useUtils();
  const { refetch } = useQuery({
    queryKey: ["judging", "desk", "heartbeat", hackathonId],
    queryFn: () => utils.client.judging.desk.heartbeat.mutate({ hackathonId }),
    ...HEARTBEAT_POLL,
  });
  useEffect(
    () => beatOnReturn(document, window, () => void refetch()),
    [refetch],
  );
}
