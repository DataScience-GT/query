"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { QrCode } from "lucide-react";
import {
  body,
  btnPrimary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  meta,
  sectionRule,
  sectionTitle,
} from "@/components/portal/ui";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { ScanResultModal } from "@/components/portal/ScanResultModal";

export function ScannerTab({ hackathonId }: { hackathonId: string }) {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    eventTitle?: string;
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    data: events,
    isLoading,
    isError,
    refetch,
  } = trpc.hackathon.getEvents.useQuery({
    hackathonId,
  });
  const utils = trpc.useUtils();

  const roster = trpc.hackathon.getEventAttendees.useQuery(
    { hackathonId, eventId: selectedEventId },
    { enabled: !!selectedEventId },
  );

  const removeAttendance = trpc.hackathon.removeEventAttendance.useMutation({
    onSuccess: () => {
      utils.hackathon.getEventAttendees.invalidate({
        hackathonId,
        eventId: selectedEventId,
      });
      utils.hackathon.getEvents.invalidate({ hackathonId });
    },
    onError: (error) => window.alert(error.message),
  });

  const scanPassMutation = trpc.hackathon.scanParticipantPass.useMutation({
    onSuccess: () => {
      // Keeps the list below the scanner honest as badges come in.
      utils.hackathon.getEventAttendees.invalidate({
        hackathonId,
        eventId: selectedEventId,
      });
    },
  });

  const handleScan = async (detectedCodes: { rawValue: string }[]) => {
    if (isProcessing || !detectedCodes || detectedCodes.length === 0) return;

    const scannedData = detectedCodes[0]?.rawValue;
    if (!scannedData) return;

    setIsPaused(true);
    setIsProcessing(true);

    try {
      const payload = JSON.parse(scannedData) as {
        type?: string;
        participantId?: string;
        hackathonId?: string;
      };
      if (
        payload.type !== "CHECK_IN" ||
        !payload.participantId ||
        !payload.hackathonId
      ) {
        throw new Error("This isn't a hackathon pass. Scan the QR code on their event pass.");
      }
      // A pass from another edition would be looked up against this tab's
      // event and come back as "Event not found", which reads like a setup
      // problem at the door.
      if (payload.hackathonId !== hackathonId) {
        throw new Error("This pass is for a different hackathon.");
      }

      const res = await scanPassMutation.mutateAsync({
        hackathonId,
        eventId: selectedEventId,
        participantId: payload.participantId,
      });

      setScanResult({
        success: true,
        message: res.message,
        eventTitle:
          events?.find(
            (e: NonNullable<typeof events>[number]) => e.id === selectedEventId,
          )?.name || "Hackathon event",
      });
      setShowScanner(false);
    } catch (error: unknown) {
      console.error("Check-in error:", error);
      setScanResult({
        success: false,
        message: error instanceof Error ? error.message : "Check-in failed",
      });
      setShowScanner(false);
    } finally {
      // Re-arm on every exit path. Clearing this only in the modal's onClose
      // meant the scanner took one badge per page load.
      setIsProcessing(false);
      setIsPaused(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {showScanner && (
        <QRScannerModal
          onClose={() => {
            setShowScanner(false);
            setIsPaused(false);
          }}
          onScan={handleScan}
          onError={(e: unknown) => console.error(e)}
          isProcessing={isProcessing}
          isPaused={isPaused}
        />
      )}

      {scanResult && (
        <ScanResultModal
          success={scanResult.success}
          message={scanResult.message}
          eventTitle={scanResult.eventTitle}
          onClose={() => setScanResult(null)}
        />
      )}

      <section>
        <h2 className={sectionTitle}>Check-in scanner</h2>
        <p className={`mt-1 ${body}`}>Pick an event, then scan badges.</p>

        <div className="mt-6">
          <label htmlFor="target-event" className={fieldLabel}>
            Event
          </label>
          {isLoading ? (
            <p className={meta}>Loading events…</p>
          ) : (
            <select
              id="target-event"
              className={input}
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              <option value="" disabled>
                Select an event…
              </option>
              {events?.map((e: NonNullable<typeof events>[number]) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          {/* A failed fetch also leaves events empty; only call it "none yet"
              when the list actually loaded. */}
          {isError && (
            <p role="alert" className="mt-3 text-[15px] text-[var(--danger)]">
              Couldn&apos;t load events.{" "}
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-semibold underline underline-offset-2 hover:text-[var(--text-primary)]"
              >
                Try again
              </button>
            </p>
          )}
          {!isLoading && !isError && (events?.length ?? 0) === 0 && (
            <p className={fieldHint}>
              Create a check-in event under Events first; scans are recorded
              against an event.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowScanner(true)}
          disabled={!selectedEventId || showScanner}
          className={`mt-6 w-full py-4 ${btnPrimary}`}
        >
          <QrCode className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Scan badge</span>
        </button>
      </section>

      {/* Who has been scanned into this event, and the way back out. A station
          left on the wrong event used to produce check-ins nobody could see or
          remove. */}
      {selectedEventId && (
        <section className={`mt-10 ${sectionRule}`}>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className={itemTitle}>Checked in</h3>
            <span className={`tabular-nums ${meta}`}>
              {roster.data?.matching ?? 0} total
            </span>
          </div>

          {roster.isLoading ? (
            <p className={meta}>Loading check-ins…</p>
          ) : (roster.data?.attendees.length ?? 0) === 0 ? (
            <p className={body}>Nobody has scanned into this event yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {roster.data?.attendees.map((row) => {
                const name =
                  row.participant?.user?.name ||
                  [row.participant?.firstName, row.participant?.lastName]
                    .filter(Boolean)
                    .join(" ") ||
                  row.participant?.user?.email ||
                  "Unknown";
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] text-[var(--text-primary)]">
                        {name}
                      </p>
                      <p className={`tabular-nums ${meta}`}>
                        {new Date(row.checkedInAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={removeAttendance.isPending}
                      onClick={() => {
                        if (!row.participant?.id) return;
                        if (
                          !window.confirm(
                            `Remove ${name}'s check-in from this event?`,
                          )
                        )
                          return;
                        removeAttendance.mutate({
                          hackathonId,
                          eventId: selectedEventId,
                          participantId: row.participant.id,
                        });
                      }}
                      className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--danger)]/40 px-2.5 py-1 text-[13px] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-glow)] disabled:opacity-50"
                    >
                      Undo
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
