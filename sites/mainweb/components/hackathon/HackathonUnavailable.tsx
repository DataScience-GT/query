"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

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
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <div>
          <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Hackathon not found
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md">
            {message ??
              "The link may be wrong, or the event is no longer listed."}
          </p>
        </div>
        <Link
          href="/hackathons"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-accent/10 border border-accent/25 text-accent text-xs font-bold uppercase tracking-widest hover:bg-accent/20 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Back to hackathons
        </Link>
      </div>
    </div>
  );
}
