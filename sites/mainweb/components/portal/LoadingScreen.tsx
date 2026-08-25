"use client";

import React from "react";

interface LoadingScreenProps {
  message?: string;
}

/**
 * Backs the loading state of 21 portal pages, so the semantics live here: a
 * screen reader announces the wait instead of reading a blank page, and the
 * spinner itself is hidden from it because a spinning border says nothing.
 */
export function LoadingScreen({ message = "Loading…" }: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center"
    >
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div
          aria-hidden="true"
          className="w-8 h-8 rounded-full border-2 border-[var(--border-subtle)] border-t-accent animate-spin"
        />
        <p className="text-[var(--text-muted)] text-sm">{message}</p>
      </div>
    </div>
  );
}
