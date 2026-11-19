"use client";

import { ArrowLeft } from "lucide-react";
import { ICON_STROKE } from "./desk";

/**
 * Back to the project list. Its own file so the desk can show it while the
 * project sheet's chunk is still loading, without importing the sheet.
 */
export function BackButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
    >
      <ArrowLeft
        className="h-4 w-4"
        strokeWidth={ICON_STROKE}
        aria-hidden="true"
      />
      Projects
    </button>
  );
}
