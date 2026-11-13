"use client";

import React from "react";
import { Spinner } from "@query/ui/Spinner";

interface LoadingScreenProps {
  message?: string;
}

/**
 * Backs the loading state of 21 portal pages, so the semantics live here: a
 * screen reader announces the wait instead of reading a blank page, and the
 * spinner itself is hidden from it because a spinning border says nothing.
 *
 * Deliberately quiet: no backdrop of its own, so the page ground shows through
 * in either theme and the wait reads as a pause, not a separate screen.
 */
export function LoadingScreen({ message = "Loading…" }: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="min-h-[60vh] flex items-center justify-center px-5"
    >
      <div className="flex items-center gap-3">
        <Spinner tone="track" />
        <p className="text-[15px] text-[var(--text-muted)]">{message}</p>
      </div>
    </div>
  );
}
