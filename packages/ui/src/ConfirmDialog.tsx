"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { body, btnDanger, btnPrimary, btnSecondary, itemTitle } from "./classes";

interface ConfirmOptions {
  title?: string;
  body: string;
  confirmLabel?: string;
  tone?: "danger" | "default";
}

interface ConfirmDialogProps extends ConfirmOptions {
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title = "Are you sure?",
  body: message,
  confirmLabel = "Confirm",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={busy ? () => undefined : onCancel} maxWidth="sm" label={title}>
      <h2 className={itemTitle}>{title}</h2>
      <p className={`mt-3 whitespace-pre-line ${body}`}>{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={btnSecondary}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={tone === "danger" ? btnDanger : btnPrimary}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

const DANGER_VERBS = new Set([
  "delete",
  "remove",
  "ban",
  "replace",
  "retire",
  "archive",
  "pull",
  "take",
  "reopen",
  "turn",
  "end",
]);
const DEFAULT_VERBS = new Set([
  "accept",
  "admit",
  "approve",
  "close",
  "issue",
  "mark",
  "open",
  "publish",
  "reload",
  "send",
]);
const LABELS: Record<string, string> = {
  take: "Remove",
  turn: "Turn on",
  sending: "Send",
  lift: "Lift ban",
};

/** A bare message that starts with a known action verb reuses it as the button; anything else reads "Confirm". */
function fromMessage(message: string): ConfirmOptions {
  const verb = (message.split(/\s/, 1)[0] ?? "").toLowerCase();
  const known = DANGER_VERBS.has(verb) || DEFAULT_VERBS.has(verb);
  const word = known
    ? verb.charAt(0).toUpperCase() + verb.slice(1)
    : "Confirm";
  return {
    body: message,
    confirmLabel: LABELS[verb] ?? word,
    tone: DANGER_VERBS.has(verb) ? "danger" : "default",
  };
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((pending: Pending) => void) | null = null;

/**
 * Promise form of the confirm dialog: `if (!(await confirmDialog("...")))
 * return;`. A bare string is the message. ConfirmHost must be mounted once
 * high in the tree; without it the answer is "no", never a silent "yes".
 */
export function confirmDialog(
  options: string | ConfirmOptions,
): Promise<boolean> {
  const opts = typeof options === "string" ? fromMessage(options) : options;
  return new Promise((resolve) => {
    if (!show) return resolve(false);
    show({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    show = (next) => {
      setPending((current) => {
        current?.resolve(false);
        return next;
      });
    };
    return () => {
      show = null;
    };
  }, []);

  if (!pending) return null;
  const answer = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };
  return (
    <ConfirmDialog
      {...pending}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );
}
