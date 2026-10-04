"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { QrCode } from "lucide-react";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
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
        throw new Error("Invalid format. Expected a Hackathon Event Pass.");
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
          )?.name || "Hackathon Event",
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
    <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300 h-full">
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

      <LiquidGlass
        printed
        className="p-6 md:p-8 w-full max-w-md mt-4 md:mt-12"
      >
        <div className="mb-8 text-center">
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase">
            Check-in scanner
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Pick an event, then scan badges.
          </p>
        </div>

        <div className="mb-8">
          <label
            htmlFor="target-event"
            className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2"
          >
            Event
          </label>
          {isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading events…</p>
          ) : (
            <select
              id="target-event"
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-sm px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-ui"
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
            <p className="mt-3 text-sm text-rose-400">
              Couldn&apos;t load events.{" "}
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-bold underline underline-offset-2 hover:text-rose-300"
              >
                Try again
              </button>
            </p>
          )}
          {!isLoading && !isError && (events?.length ?? 0) === 0 && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Create a check-in event under Events first; scans are recorded
              against an event.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowScanner(true)}
          disabled={!selectedEventId || showScanner}
          className="w-full px-6 py-8 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50 flex flex-col items-center justify-center gap-3"
        >
          <QrCode className="w-8 h-8" aria-hidden="true" />
          <span>Scan badge</span>
        </button>
      </LiquidGlass>

      {/* Who has been scanned into this event, and the way back out. A station
          left on the wrong event used to produce check-ins nobody could see or
          remove. */}
      {selectedEventId && (
        <LiquidGlass printed className="p-6 w-full max-w-md mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
              Checked in
            </h3>
            <span className="text-xs text-[var(--text-muted)]">
              {roster.data?.matching ?? 0} total
            </span>
          </div>

          {roster.isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">
              Loading check-ins…
            </p>
          ) : (roster.data?.attendees.length ?? 0) === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              Nobody has scanned into this event yet.
            </p>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
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
                    className="flex items-center justify-between gap-3 rounded-sm border border-[var(--border-subtle)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">
                        {name}
                      </p>
                      <p className="text-[11px] text-[var(--text-subtle)]">
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
                      className="px-2.5 py-1 rounded-sm border border-red-500/30 text-red-400 text-[11px] font-bold uppercase tracking-wider hover:bg-red-500/10 transition-colors disabled:opacity-40 shrink-0"
                    >
                      Undo
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </LiquidGlass>
      )}
    </div>
  );
}
