"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearMirror, writeMirror } from "./draft-mirror";

// A draft saves a quarter second after the judge stops typing, and once a
// second while they keep going, so a deadline never catches more than a second
// of work unsaved. Saves run one at a time: each carries the revision the last
// one returned, and two in flight would refuse each other.
//
// A failed save is tried again after 1, 2, 4 and 8 seconds, then every 15 for
// as long as it takes: venue wifi comes back. Only an error that trying again
// cannot change stops it (a stale revision, a session that ended). Meanwhile
// the answers are mirrored on the device.

const QUIET_MS = 250;
const SWEEP_MS = 1000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15_000];
const FINAL = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "FORBIDDEN",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
  "UNAUTHORIZED",
]);

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "retrying"; message: string }
  | { kind: "stopped"; message: string };

/** Whether the server refused the save in a way that a second try cannot fix. */
function isFinal(error: unknown) {
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code;
  return typeof code === "string" && FINAL.has(code);
}

export function useDraftAutosave({
  answersKey,
  enabled,
  revision: openedRevision,
  save,
  serverKey,
  storageKey,
}: {
  /** The answers, serialised. A change is what calls for a save. */
  answersKey: string;
  enabled: boolean;
  /** The draft revision the editor opened with, 0 for none. */
  revision: number;
  /** Sends the current answers; resolves with the draft's new revision. */
  save: (revision: number) => Promise<{ revision: number; savedAt: Date }>;
  /**
   * The answers the server holds, serialised like `answersKey`. They differ
   * when the editor opened on newer answers kept on the device.
   */
  serverKey: string;
  /** Where to mirror the answers on the device, or null for nowhere. */
  storageKey: string | null;
}) {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const revision = useRef(openedRevision);
  // Opening a project is not an edit: what the server held counts as saved.
  const savedKey = useRef(serverKey);
  const latest = useRef({ key: answersKey, save, storageKey });
  const inFlight = useRef<Promise<void> | null>(null);
  const failures = useRef(0);
  const retryAt = useRef(0);
  const stopped = useRef(false);
  const held = useRef(false);

  useEffect(() => {
    latest.current = { key: answersKey, save, storageKey };
  });

  // What the server lacks is on the device too; what it has is not.
  useEffect(() => {
    if (!enabled || !storageKey) return;
    if (answersKey === savedKey.current) clearMirror(storageKey);
    else writeMirror(storageKey, answersKey);
  }, [answersKey, enabled, storageKey]);

  const saveNow = useCallback((force = false): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const { key, save: send } = latest.current;
    if (
      held.current ||
      stopped.current ||
      key === savedKey.current ||
      (!force && Date.now() < retryAt.current)
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
          retryAt.current = 0;
          // Newer keystrokes may have landed while this one was in flight.
          // They stay on the device, stamped after this save so they still
          // read as newer than the server's copy.
          const { key: current, storageKey: mirror } = latest.current;
          if (mirror) {
            if (current === key) clearMirror(mirror);
            else writeMirror(mirror, current);
          }
          setStatus({ kind: "saved", at: saved.savedAt });
        },
        (error: unknown) => {
          failures.current += 1;
          const message =
            error instanceof Error && error.message
              ? error.message
              : "The connection dropped.";
          if (isFinal(error)) {
            stopped.current = true;
            setStatus({ kind: "stopped", message });
            return;
          }
          const wait =
            BACKOFF_MS[Math.min(failures.current, BACKOFF_MS.length) - 1];
          retryAt.current = Date.now() + wait;
          setStatus({ kind: "retrying", message });
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

  // Leaving the project mid-sentence still sends the last keystrokes, without
  // waiting out a back-off.
  useEffect(() => () => void saveNow(true), [saveNow]);

  /** Stops saving and waits out a save under way; submit sends the answers itself. */
  const hold = useCallback(async () => {
    held.current = true;
    await inFlight.current;
  }, []);

  const release = useCallback(() => {
    held.current = false;
  }, []);

  /** Tries again now, whatever the back-off or a stop says. */
  const retry = useCallback(() => {
    failures.current = 0;
    retryAt.current = 0;
    stopped.current = false;
    void saveNow();
  }, [saveNow]);

  return { status, hold, release, retry };
}
