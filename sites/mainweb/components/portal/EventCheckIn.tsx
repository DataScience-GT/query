"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRScannerModal } from "@/components/portal/QRScannerModal";
import { ScanResultModal } from "@/components/portal/ScanResultModal";
import { trpc } from "@/lib/trpc";

// A hackathon event poster is a link to this site's own check-in page, not a
// club event code. Returns where that page is, or null for anything else.
function hackathonCheckInPath(scanned: string): string | null {
  try {
    const url = new URL(scanned);
    if (url.origin !== window.location.origin) return null;
    return /^\/hackathons\/[^/]+\/checkin\/?$/.test(url.pathname)
      ? `${url.pathname}${url.search}`
      : null;
  } catch {
    return null;
  }
}

/**
 * Self check-in at an event door: scan the event QR, record attendance for the
 * signed-in user. Open to everyone signed in, member or not, so it is shared
 * by the Club Portal and /checkin.
 *
 * Render `modals` somewhere in the page and call `openScanner` from a button.
 */
export function useEventCheckIn() {
  const utils = trpc.useUtils();
  const router = useRouter();

  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    eventTitle?: string;
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());

  const checkInMutation = trpc.events.checkIn.useMutation({
    onSuccess: async (data) => {
      setScanResult({
        success: true,
        message: "Your attendance is recorded.",
        eventTitle: data.eventTitle,
      });
      setShowScanner(false);
      setIsProcessing(false);

      utils.events.myStats.setData(undefined, (old) => {
        if (!old) return { totalEvents: 1 };
        return { totalEvents: old.totalEvents + 1 };
      });

      utils.events.myEvents.invalidate();
      utils.events.myStats.invalidate();
    },
    onError: (error) => {
      setScanResult({
        success: false,
        message: error.message || "We couldn't record your check-in.",
      });
      setShowScanner(false);
      setIsProcessing(false);
    },
  });

  // Closing the scanner forgets what it saw, so reopening can scan the same
  // code again.
  const [scannerWasOpen, setScannerWasOpen] = useState(showScanner);
  if (showScanner !== scannerWasOpen) {
    setScannerWasOpen(showScanner);
    if (!showScanner) setScannedCodes(new Set());
  }

  const handleScan = async (detectedCodes: { rawValue: string }[]) => {
    if (isProcessing || !detectedCodes || detectedCodes.length === 0) return;
    const scannedData = detectedCodes[0]?.rawValue;
    if (!scannedData) return;
    if (scannedCodes.has(scannedData)) return;
    setScannedCodes((prev) => new Set(prev).add(scannedData));
    const hackathonPath = hackathonCheckInPath(scannedData);
    if (hackathonPath) {
      setShowScanner(false);
      router.push(hackathonPath);
      return;
    }
    setIsPaused(true);
    setIsProcessing(true);
    try {
      await checkInMutation.mutateAsync({ qrCode: scannedData });
    } catch (error) {
      console.error("Check-in error:", error);
    } finally {
      // Re-arm for the next code; otherwise the scanner takes one per load.
      setIsProcessing(false);
      setIsPaused(false);
    }
  };

  const handleError = (error: unknown) => {
    console.error("Scanner error:", error);
  };

  const modals = (
    <>
      {showScanner && (
        <QRScannerModal
          onClose={() => {
            setShowScanner(false);
            setIsPaused(false);
          }}
          onScan={handleScan}
          onError={handleError}
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
    </>
  );

  return {
    openScanner: () => setShowScanner(true),
    scannerOpen: showScanner,
    modals,
  };
}
