"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { canViewAdmin, usePortalContext } from "@/lib/use-portal-context";
import {
  body,
  btnSecondary,
  fieldLabel,
  input,
  meta,
  page,
  pageDek,
} from "@/components/portal/ui";
import { ScanAccess } from "@/components/portal/ScanAccess";
import { ClubScannerTab } from "@/components/portal/ClubScannerTab";
import { ClubAttendanceMetrics } from "@/components/portal/ClubAttendanceMetrics";
import { EventAttendanceModal } from "@/components/portal/EventAttendanceModal";

/** Staff pages carry a smaller headline than member pages. */
const adminTitle =
  "font-[family-name:var(--font-display)] text-[32px] md:text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] text-balance";

/**
 * Club meeting attendance, with the pass scanner one click away.
 *
 * Scans a member pass, not a hackathon badge. Kept off /scan so club
 * gatherings are not a mode of the hackathon desk. Volunteers can scan here
 * but the metrics are a staff query, so they get the scanner open instead.
 */
export default function ClubScanPage() {
  const { data: portalContext } = usePortalContext();
  const [clubEventId, setClubEventId] = useState("");
  // Null until toggled: open by default only for those without the metrics.
  const [scannerToggle, setScannerToggle] = useState<boolean | null>(null);
  const [openEvent, setOpenEvent] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Staff and read-only bug testers; the server refuses volunteers either way.
  const canViewMetrics = canViewAdmin(portalContext);
  const scannerOpen = scannerToggle ?? !canViewMetrics;

  const { data: clubEvents } = trpc.events.list.useQuery(undefined, {
    enabled: !!portalContext?.isScanner,
  });

  const showScanner = () => {
    setScannerToggle(true);
    document
      .getElementById("club-scanner")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <ScanAccess>
      <main className={page}>
        <header>
          <h1 className={adminTitle}>Club attendance</h1>
          <p className={pageDek}>
            Who comes to club meetings, and how often. Scan member passes from
            here too; hackathon check-in has its own desk.
          </p>
        </header>

        <div className="mt-8 flex flex-wrap items-end gap-4">
          <div className="w-full sm:max-w-sm">
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
          <button
            type="button"
            onClick={() => setScannerToggle(!scannerOpen)}
            aria-expanded={scannerOpen}
            aria-controls="club-scanner"
            className={`min-h-11 ${btnSecondary}`}
          >
            {scannerOpen ? "Hide scanner" : "Scan passes"}
          </button>
        </div>

        <div id="club-scanner" className="scroll-mt-6">
          {scannerOpen && (
            <div className="mt-8 border-t border-[var(--border-subtle)] pt-8">
              {clubEventId ? (
                <ClubScannerTab eventId={clubEventId} />
              ) : (
                <p className={body}>
                  Choose a club event above to start scanning.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-12 border-t border-[var(--border-subtle)] pt-6">
          {canViewMetrics ? (
            <ClubAttendanceMetrics
              onOpenEvent={(event) => {
                setClubEventId(event.id);
                setOpenEvent(event);
              }}
              onScan={showScanner}
            />
          ) : (
            <p className={meta}>
              Attendance figures are for club officers. Scanning works the same
              either way.
            </p>
          )}
        </div>

        {openEvent && (
          <EventAttendanceModal
            eventId={openEvent.id}
            eventTitle={openEvent.title}
            onClose={() => setOpenEvent(null)}
          />
        )}
      </main>
    </ScanAccess>
  );
}
