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
      className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center relative overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-accent/10 rounded-sm blur-[40px] pointer-events-none"
      />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div
          aria-hidden="true"
          className="w-12 h-12 rounded-none border-2 border-[var(--border-subtle)] border-t-emerald-500 animate-spin shadow-[0_0_15px_rgba(16,185,129,0.2)]"
        />
        <p className="font-mono text-accent font-bold uppercase tracking-[0.3em] text-xs">
          {message}
        </p>
      </div>
    </div>
  );
}
