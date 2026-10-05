"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePortalContext } from "@/lib/use-portal-context";
import {
  body,
  fieldLabel,
  input,
  kicker,
  page,
  pageDek,
  pageTitle,
} from "@/components/portal/ui";
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
      <main className={page}>
        <header>
          <p className={kicker}>Club staff</p>
          <h1 className={`mt-1 ${pageTitle}`}>Club meeting check-in</h1>
          <p className={pageDek}>
            Scan member passes into a club meeting. This desk is separate from
            hackathon check-in.
          </p>
        </header>

        <div className="mt-8 max-w-md">
          <label htmlFor="scan-club-event" className={fieldLabel}>
            Club event
          </label>
          <select
            id="scan-club-event"
            value={clubEventId}
            onChange={(e) => setClubEventId(e.target.value)}
            className={`min-h-11 ${input}`}
          >
            <option value="">Select a club event…</option>
            {clubEvents?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-8 border-t border-[var(--border-subtle)] pt-8">
          {clubEventId ? (
            <ClubScannerTab eventId={clubEventId} />
          ) : (
            <p className={body}>
              Choose a club event above to start scanning.
            </p>
          )}
        </div>
      </main>
    </ScanAccess>
  );
}
