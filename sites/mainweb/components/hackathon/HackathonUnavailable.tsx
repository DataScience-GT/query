"use client";

import React from "react";
import Link from "next/link";
import { page, pageDek, pageTitle, textLink } from "@/components/portal/ui";

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
    <div className={page}>
      <h1 className={pageTitle}>Hackathon not found</h1>
      <p className={pageDek}>
        {message ?? "The link may be wrong, or the event is no longer listed."}
      </p>
      <div className="mt-8">
        <Link href="/hackathons" className={textLink}>
          Back to hackathons
        </Link>
      </div>
    </div>
  );
}
