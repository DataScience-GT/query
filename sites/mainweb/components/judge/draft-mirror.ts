import type { Answer } from "./answers";

// A copy of the answers on the judge's own device. Autosave reaches the server
// over venue wifi; this is what is left when it does not, or when the tab
// closes first. One slot per judge, project and challenge, so a shared phone
// never offers one judge's words to another. It holds only what the server
// does not: it is cleared once a save or a submit lands.

type Stored = { key: string; at: number };

export type MirroredAnswers = {
  ratings: Record<string, number>;
  responses: Record<string, Answer>;
};

export function mirrorKey(
  judgeId: string,
  entryId: string,
  challengeId: string,
) {
  return `query:judge-draft:${judgeId}:${entryId}:${challengeId}`;
}

/** Storage can be missing or full (private tabs); the mirror is a bonus. */
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Keeps `answersKey` (the serialised answers) for `storageKey`. */
export function writeMirror(
  storageKey: string,
  answersKey: string,
  at = Date.now(),
) {
  try {
    const stored: Stored = { key: answersKey, at };
    storage()?.setItem(storageKey, JSON.stringify(stored));
  } catch {
    // Full or blocked: autosave is still the primary copy.
  }
}

export function clearMirror(storageKey: string) {
  try {
    storage()?.removeItem(storageKey);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The answers mirrored under `storageKey`, when they were kept after the
 * server's copy was written; null otherwise. `serverAt` is that write in ms on
 * this device's clock, which stamped the mirror.
 */
export function readMirror(
  storageKey: string,
  serverAt: number,
): MirroredAnswers | null {
  try {
    const raw = storage()?.getItem(storageKey);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<Stored>;
    if (typeof stored.key !== "string" || typeof stored.at !== "number") {
      return null;
    }
    if (stored.at <= serverAt) return null;

    const parsed: unknown = JSON.parse(stored.key);
    if (!Array.isArray(parsed)) return null;
    const [ratings, responses] = parsed as unknown[];
    if (!isRecord(ratings) || !isRecord(responses)) return null;

    const answers: MirroredAnswers = { ratings: {}, responses: {} };
    for (const [id, value] of Object.entries(ratings)) {
      if (typeof value === "number") answers.ratings[id] = value;
    }
    for (const [id, value] of Object.entries(responses)) {
      if (
        isRecord(value) &&
        typeof value.value === "string" &&
        typeof value.isPublic === "boolean"
      ) {
        answers.responses[id] = {
          value: value.value,
          isPublic: value.isPublic,
        };
      }
    }
    return answers;
  } catch {
    return null;
  }
}
