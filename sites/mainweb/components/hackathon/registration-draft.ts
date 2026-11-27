/**
 * The application draft kept in this browser, and the choice between it and the
 * one the server holds. The browser copy is the offline fallback: it is written
 * on every change, where the server copy follows a moment later.
 */

/** The answers as the form holds them, with when this browser last wrote them. */
type LocalDraft = {
  answers: Record<string, unknown>;
  savedAt: number;
};

/** What `hackathon.getMyDraft` returns. */
export type ServerDraft = {
  data: Record<string, unknown>;
  updatedAt: Date | string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * The saved draft, or null: one that is missing, unreadable or not an object is
 * the same as none. A draft from before drafts were stamped is a bare object of
 * answers; it reads as written at time 0, so any server draft outranks it.
 */
export function readLocalDraft(key: string): LocalDraft | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!isRecord(parsed)) return null;
    if (isRecord(parsed.answers) && typeof parsed.savedAt === "number") {
      return { answers: parsed.answers, savedAt: parsed.savedAt };
    }
    return { answers: parsed, savedAt: 0 };
  } catch {
    return null;
  }
}

/** Keeps the answers, stamped. `answersJson` is the form's draft, already serialised. */
export function writeLocalDraft(
  key: string,
  answersJson: string,
  now: number = Date.now(),
) {
  try {
    localStorage.setItem(key, `{"savedAt":${now},"answers":${answersJson}}`);
  } catch {
    // Storage full or blocked: the form still works, it just is not kept.
  }
}

export function clearLocalDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}

/**
 * The answers a new registration opens on: whichever copy was saved later, the
 * server's when they tie. Either may be missing.
 */
export function newestDraft(
  local: LocalDraft | null,
  server: ServerDraft | null | undefined,
): Record<string, unknown> {
  if (!server) return local?.answers ?? {};
  if (!local) return server.data;
  return local.savedAt > new Date(server.updatedAt).getTime()
    ? local.answers
    : server.data;
}
