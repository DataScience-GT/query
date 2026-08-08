"use client";

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
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

  const { data: events, isLoading } = trpc.hackathon.getEvents.useQuery({
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

      const res = await scanPassMutation.mutateAsync({
        hackathonId: payload.hackathonId,
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

      <LiquidGlass className="p-8 w-full max-w-md mt-4 md:mt-12 rounded-none border-t-4 border-t-accent/50 shadow-[0_20px_50px_rgba(16,185,129,0.1)]">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight">
            Access Control
          </h2>
          <p className="text-xs text-[var(--text-subtle)] font-mono mt-2">
            Select an event and scan badges.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <label
            htmlFor="target-event"
            className="text-[10px] font-mono text-accent uppercase tracking-widest font-bold"
          >
            Target Event
          </label>
          {isLoading ? (
            <div className="w-full bg-[var(--bg-primary)]/50 border border-[var(--border-subtle)] rounded-none px-4 py-3 text-[var(--text-subtle)] text-sm font-mono animate-pulse">
              Loading Events...
            </div>
          ) : (
            <select
              id="target-event"
              className="w-full bg-accent/5 border border-accent/30 rounded-none px-4 py-4 text-[var(--text-primary)] focus:outline-none focus:border-accent transition-colors font-medium text-lg shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              <option value="" disabled>
                Select active event...
              </option>
              {events?.map((e: NonNullable<typeof events>[number]) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowScanner(true)}
          disabled={!selectedEventId || showScanner}
          className="w-full h-32 md:h-40 bg-accent text-black font-black text-xl uppercase tracking-[0.2em] rounded-none hover:bg-white transition-ui active:scale-95 disabled:opacity-30 disabled:scale-100 shadow-[0_0_50px_rgba(16,185,129,0.3)] flex flex-col items-center justify-center gap-2 group"
        >
          <svg
            className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
          <span>Scan User</span>
        </button>
      </LiquidGlass>

      {/* Who has been scanned into this event, and the way back out. A station
          left on the wrong event used to produce check-ins nobody could see or
          remove. */}
      {selectedEventId && (
        <LiquidGlass className="p-6 w-full max-w-md mt-6 rounded-none border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">
              Checked In
            </h3>
            <span className="text-xs font-mono text-[var(--text-subtle)]">
              {roster.data?.matching ?? 0} total
            </span>
          </div>

          {roster.isLoading ? (
            <p className="text-xs font-mono text-[var(--text-subtle)] animate-pulse">
              Loading...
            </p>
          ) : (roster.data?.attendees.length ?? 0) === 0 ? (
            <p className="text-xs font-mono text-[var(--text-subtle)]">
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
                    className="flex items-center justify-between gap-3 border border-[var(--border-subtle)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">
                        {name}
                      </p>
                      <p className="text-[10px] font-mono text-[var(--text-subtle)]">
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
                      className="px-2 py-1 border border-red-500/30 text-red-400 text-[10px] font-mono uppercase tracking-wider hover:bg-red-500/10 transition-colors disabled:opacity-40 shrink-0"
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
