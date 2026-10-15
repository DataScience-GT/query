"use client";

import React, { useId, useState } from "react";
import type { RouterOutputs } from "@query/api";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { btnPrimary, fieldHint, fieldLabel, input } from "@/components/portal/ui";
import { pointsLabel } from "./format";

// 20px so iOS does not zoom the page on focus, and so O-less, I-less codes
// read the way they look on the projector.
const codeInput = input.replace("text-[15px]", "text-[20px]");

/**
 * The code shown on the screen at an event, typed by the hacker. Lives on the
 * Points tab, and on the poster-QR landing when the scanned code was refused.
 */
export function CheckInCodeForm({
  hackathonId,
  onCheckedIn,
}: {
  hackathonId: string;
  onCheckedIn?: (result: RouterOutputs["points"]["me"]["checkIn"]) => void;
}) {
  const fieldId = useId();
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");

  const checkIn = trpc.points.me.checkIn.useMutation({
    onSuccess: (result) => {
      setCode("");
      void utils.points.me.invalidate();
      onCheckedIn?.(result);
    },
  });

  const outcome = checkIn.data
    ? {
        ok: true,
        text:
          checkIn.data.pointsAwarded > 0
            ? `Checked into ${checkIn.data.eventName}. ${pointsLabel(checkIn.data.pointsAwarded)} added.`
            : `Checked into ${checkIn.data.eventName}. This one does not award points.`,
      }
    : checkIn.error
      ? {
          ok: false,
          text: trpcErrorMessage(checkIn.error, "That code did not go through."),
        }
      : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!code.trim() || checkIn.isPending) return;
        checkIn.mutate({ hackathonId, code });
      }}
    >
      <label htmlFor={fieldId} className={fieldLabel}>
        Event code
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={fieldId}
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={9}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            // A result from the last code would read as the answer to this one.
            if (!checkIn.isIdle) checkIn.reset();
          }}
          aria-describedby={`${fieldId}-hint ${fieldId}-result`}
          className={`min-h-11 font-mono font-semibold tracking-[0.2em] sm:max-w-56 ${codeInput}`}
        />
        <button
          type="submit"
          disabled={!code.trim() || checkIn.isPending}
          className={`min-h-11 ${btnPrimary}`}
        >
          {checkIn.isPending ? "Checking…" : "Check in"}
        </button>
      </div>
      <p id={`${fieldId}-hint`} className={fieldHint}>
        Six letters and numbers, shown on the screen or poster at the event.
      </p>
      <p
        id={`${fieldId}-result`}
        role="status"
        aria-live="polite"
        className={`mt-3 text-[15px] ${
          outcome?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
        } ${outcome ? "" : "sr-only"}`}
      >
        {outcome?.text}
      </p>
    </form>
  );
}
