"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A draft saves a quarter second after the judge stops typing, and once a
// second while they keep going, so a deadline never catches more than a second
// of work unsaved. Saves run one at a time: each carries the revision the last
// one returned, and two in flight would refuse each other.

const QUIET_MS = 250;
const SWEEP_MS = 1000;
const MAX_FAILURES = 5;

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "retrying"; message: string }
  | { kind: "stopped"; message: string };

export function useDraftAutosave({
  answersKey,
  enabled,
  revision: openedRevision,
  save,
}: {
  /** The answers, serialised. A change is what calls for a save. */
  answersKey: string;
  enabled: boolean;
  /** The draft revision the editor opened with, 0 for none. */
  revision: number;
  /** Sends the current answers; resolves with the draft's new revision. */
  save: (revision: number) => Promise<{ revision: number; savedAt: Date }>;
}) {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const revision = useRef(openedRevision);
  // Opening a project is not an edit: what it opened with counts as saved.
  const savedKey = useRef(answersKey);
  const latest = useRef({ key: answersKey, save });
  const inFlight = useRef<Promise<void> | null>(null);
  const failures = useRef(0);
  const held = useRef(false);

  useEffect(() => {
    latest.current = { key: answersKey, save };
  });

  const saveNow = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const { key, save: send } = latest.current;
    if (
      held.current ||
      failures.current >= MAX_FAILURES ||
      key === savedKey.current
    ) {
      return Promise.resolve();
    }

    setStatus({ kind: "saving" });
    const attempt = send(revision.current)
      .then(
        (saved) => {
          revision.current = saved.revision;
          savedKey.current = key;
          failures.current = 0;
          setStatus({ kind: "saved", at: saved.savedAt });
        },
        (error: unknown) => {
          failures.current += 1;
          const message =
            error instanceof Error && error.message
              ? error.message
              : "The connection dropped.";
          setStatus(
            failures.current >= MAX_FAILURES
              ? { kind: "stopped", message }
              : { kind: "retrying", message },
          );
        },
      )
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = attempt;
    return attempt;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const quiet = setTimeout(() => void saveNow(), QUIET_MS);
    return () => clearTimeout(quiet);
  }, [answersKey, enabled, saveNow]);

  useEffect(() => {
    if (!enabled) return;
    const sweep = setInterval(() => void saveNow(), SWEEP_MS);
    return () => clearInterval(sweep);
  }, [enabled, saveNow]);

  // Leaving the project mid-sentence still sends the last keystrokes.
  useEffect(() => () => void saveNow(), [saveNow]);

  /** Stops saving and waits out a save under way; submit sends the answers itself. */
  const hold = useCallback(async () => {
    held.current = true;
    await inFlight.current;
  }, []);

  const release = useCallback(() => {
    held.current = false;
  }, []);

  /** Starts again after saving stopped. */
  const retry = useCallback(() => {
    failures.current = 0;
    void saveNow();
  }, [saveNow]);

  return { status, hold, release, retry };
}
