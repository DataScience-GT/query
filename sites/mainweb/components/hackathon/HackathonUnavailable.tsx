"use client";

import React from "react";
import Link from "next/link";

interface HackathonUnavailableProps {
  message?: string;
}

/**
 * Terminal state for a hackathon page that has nothing to render — a link to a
 * deleted event, a mistyped id, or one the viewer is not allowed to see. The
 * pages used to fall through to their loading guard in this case and spin
 * forever, so there has to be a way out of the screen.
 */
export function HackathonUnavailable({ message }: HackathonUnavailableProps) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center relative overflow-hidden px-6">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-accent/10 rounded-sm blur-[40px] pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <p className="font-mono text-accent font-bold uppercase tracking-[0.3em] text-xs">
          Hackathon Unavailable
        </p>
        <p className="font-mono text-text-muted text-sm max-w-md">
          {message ?? "This hackathon could not be found."}
        </p>
        <Link
          href="/hackathons"
          className="font-mono uppercase tracking-[0.2em] text-xs px-6 py-3 border border-[var(--border-subtle)] text-accent hover:bg-accent/10 transition-colors"
        >
          Back to Hackathons
        </Link>
      </div>
    </div>
  );
}
