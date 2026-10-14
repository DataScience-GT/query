"use client";

import React, { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { Check, QrCode } from "lucide-react";
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
  status,
  tab,
  tabList,
} from "@/components/portal/ui";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { ScanResultModal } from "@/components/portal/ScanResultModal";
import { ManualCheckIn } from "@/components/admin/hackathons/points/ManualCheckIn";

// How a roster row was made, for the volunteer reading the list.
const METHOD_LABEL: Record<string, string> = {
  scan: "Pass",
  code: "Event code",
  manual: "By name",
};

// How long the strip for a good scan stays up, and how long the same badge is
// ignored after a read so one held in front of the camera is not read twice.
const STRIP_MS = 1500;
const REPEAT_MS = 3000;

export function ScannerTab({ hackathonId }: { hackathonId: string }) {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  // Whether the event the desk opens on has been chosen yet.
  const [eventPreselected, setEventPreselected] = useState(false);
  // The clock for "has this event ended", so a desk left open all day follows it.
  const [now, setNow] = useState(() => Date.now());
  // Search is for people without their pass on them.
  const [mode, setMode] = useState<"scan" | "search">("scan");
  const [showScanner, setShowScanner] = useState(false);
  // Only a scan that failed needs a tap; a good one shows as a strip.
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastCheckIn, setLastCheckIn] = useState<{
    name: string;
    firstArrival: boolean;
    points: number;
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastRead = useRef({ value: "", at: 0 });
  const stripTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearInterval(clock);
      clearTimeout(stripTimer.current);
    };
  }, []);

  const {
    data: events,
    isLoading,
    isError,
    refetch,
  } = trpc.hackathon.getEvents.useQuery({
    hackathonId,
  });
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();

  // An ended event refuses every scan, so it is not offered, unless it is the
  // one already selected. The schedule arrives in start order.
  const notEnded = events?.filter((e) => e.endTime.getTime() > now);
  const selectableEvents = events?.filter(
    (e) => e.endTime.getTime() > now || e.id === selectedEventId,
  );

  // The desk opens on the event running now, else the next one. Chosen once:
  // moving on to the next event while someone is scanning would file their
  // badges under the wrong one.
  if (!eventPreselected && notEnded) {
    setEventPreselected(true);
    const opening =
      notEnded.find((e) => e.startTime.getTime() <= now) ?? notEnded[0];
    if (opening) setSelectedEventId(opening.id);
  }

  // Polled: hackers typing the event code land here without this station
  // doing anything.
  const roster = trpc.hackathon.getEventAttendees.useQuery(
    { hackathonId, eventId: selectedEventId },
    { enabled: !!selectedEventId, refetchInterval: 10_000 },
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

    // The camera keeps reading a badge that is still in front of it, and the
    // second read would only come back as "already checked in". Reads of the
    // same badge keep the window open for as long as it is held there.
    const readAt = Date.now();
    const repeat =
      lastRead.current.value === scannedData &&
      readAt - lastRead.current.at < REPEAT_MS;
    lastRead.current = { value: scannedData, at: readAt };
    if (repeat) return;

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

      // The scanner stays open for the next badge.
      setLastCheckIn({
        name: res.name,
        firstArrival: res.checkedIn,
        points: res.pointsAwarded,
      });
      clearTimeout(stripTimer.current);
      stripTimer.current = setTimeout(() => setLastCheckIn(null), STRIP_MS);
    } catch (error: unknown) {
      console.error("Check-in error:", error);
      // A retry of this badge should not be swallowed as a repeat.
      lastRead.current = { value: "", at: 0 };
      // The strip would sit over the modal with the previous badge's name.
      clearTimeout(stripTimer.current);
      setLastCheckIn(null);
      setScanError(error instanceof Error ? error.message : "Check-in failed");
      setShowScanner(false);
    } finally {
      // Re-arm on every exit path. Clearing this only in the modal's onClose
      // meant the scanner took one badge per page load.
      setIsProcessing(false);
      setIsPaused(false);
      // The wait for the server should not eat into the repeat window.
      if (lastRead.current.value) lastRead.current.at = Date.now();
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

      {/* Over the camera, which is a full-screen dialog: a good scan shows here
          and the next badge can follow without a tap. */}
      {lastCheckIn && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-6 z-[110] mx-auto flex max-w-md items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 shadow-[var(--shadow-xl)]"
        >
          <Check
            aria-hidden="true"
            strokeWidth={1.75}
            className="h-5 w-5 shrink-0 text-[var(--success)]"
          />
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--text-primary)]">
            {lastCheckIn.name}
          </p>
          {lastCheckIn.firstArrival && (
            <span className={`shrink-0 ${status("success")}`}>
              First arrival
            </span>
          )}
          {lastCheckIn.points > 0 && (
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
              +{lastCheckIn.points} pts
            </span>
          )}
        </div>
      )}

      {scanError && (
        <ScanResultModal
          success={false}
          message={scanError}
          onClose={() => setScanError(null)}
        />
      )}

      <section>
        <h2 className={sectionTitle}>Check-in scanner</h2>
        <p className={`mt-1 ${body}`}>
          Pick an event, then scan passes or find people by name.
        </p>

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
              {selectableEvents?.map((e) => (
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
          {!isLoading && (events?.length ?? 0) > 0 && !selectableEvents?.length && (
            <p className={fieldHint}>
              Every event has ended, so there is nothing left to scan into.
            </p>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Check-in method"
          className={`mt-6 ${tabList}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "scan"}
            onClick={() => setMode("scan")}
            className={`min-h-11 ${tab(mode === "scan")}`}
          >
            Scan pass
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "search"}
            onClick={() => setMode("search")}
            className={`min-h-11 ${tab(mode === "search")}`}
          >
            Find by name
          </button>
        </div>

        {mode === "scan" ? (
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            disabled={readOnly || !selectedEventId || showScanner}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={`mt-6 w-full py-4 ${btnPrimary}`}
          >
            <QrCode className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Scan badge</span>
          </button>
        ) : selectedEventId ? (
          <div className="mt-6">
            <ManualCheckIn
              // A different event is a different list of who is already in.
              key={selectedEventId}
              hackathonId={hackathonId}
              eventId={selectedEventId}
              readOnly={readOnly}
              onCheckedIn={() =>
                void utils.hackathon.getEventAttendees.invalidate({
                  hackathonId,
                  eventId: selectedEventId,
                })
              }
            />
          </div>
        ) : (
          <p className={`mt-6 ${body}`}>Pick an event first.</p>
        )}
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
                        {row.method && METHOD_LABEL[row.method]
                          ? ` · ${METHOD_LABEL[row.method]}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={readOnly || removeAttendance.isPending}
                      title={readOnly ? READ_ONLY_TITLE : undefined}
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
