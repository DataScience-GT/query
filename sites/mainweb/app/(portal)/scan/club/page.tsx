"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { ScanAccess } from "@/components/portal/ScanAccess";
import { ClubScannerTab } from "@/components/portal/ClubScannerTab";

/**
 * Club meeting check-in.
 *
 * Scans a member pass, not a hackathon badge. Kept off /scan so club
 * gatherings are not a mode of the hackathon desk.
 */
export default function ClubScanPage() {
  const { data: portalContext } = usePortalContext();
  const [clubEventId, setClubEventId] = useState("");

  const { data: clubEvents } = trpc.events.list.useQuery(undefined, {
    enabled: !!portalContext?.isScanner,
  });

  return (
    <ScanAccess>
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-[10px] font-mono text-accent/80 uppercase tracking-[0.2em] mb-2">
            Club
          </p>
          <h1 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tighter mb-1">
            Club <span className="text-accent italic">Check-In</span>
          </h1>
          <p className="text-sm font-mono text-[var(--text-subtle)]">
            Scan member passes into a club meeting. Not part of a hackathon
            weekend.
          </p>
        </div>

        <div className="mb-6">
          <label
            htmlFor="scan-club-event"
            className="block text-xs uppercase tracking-[0.15em] font-bold text-[var(--text-subtle)] mb-2 font-mono"
          >
            Club Event
          </label>
          <select
            id="scan-club-event"
            value={clubEventId}
            onChange={(e) => setClubEventId(e.target.value)}
            className="w-full min-h-11 px-4 py-3 bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-mono focus:border-accent/50 focus:outline-none transition-colors"
          >
            <option value="">Select a club event…</option>
            {clubEvents?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>

        {clubEventId ? (
          <ClubScannerTab eventId={clubEventId} />
        ) : (
          <LiquidGlass className="p-12 text-center border-[var(--border-subtle)]">
            <p className="text-sm text-[var(--text-subtle)] font-mono">
              Choose a club event above to start scanning.
            </p>
          </LiquidGlass>
        )}
      </div>
    </ScanAccess>
  );
}
