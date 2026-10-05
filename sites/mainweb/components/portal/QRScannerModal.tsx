"use client";

import React from "react";
import dynamic from "next/dynamic";
import { ModalWrapper } from "./ModalWrapper";
import { itemTitle, label, meta } from "./ui";

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="h-[350px] flex items-center justify-center bg-[var(--bg-secondary)]">
        <p className={meta}>Starting camera…</p>
      </div>
    ),
  },
);

interface QRScannerModalProps {
  onClose: () => void;
  onScan: (detectedCodes: { rawValue: string }[]) => void;
  onError?: (error: unknown) => void;
  isProcessing?: boolean;
  isPaused?: boolean;
}

export function QRScannerModal({
  onClose,
  onScan,
  onError,
  isProcessing = false,
  isPaused = false,
}: QRScannerModalProps) {
  const handleClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  return (
    <ModalWrapper onClose={handleClose} maxWidth="md">
      {/* Header */}
      <div className="flex justify-between items-start gap-4 mb-5">
        <div>
          <h3 className={itemTitle}>Scan a QR code</h3>
          <p className={`${meta} mt-1`}>Point your camera at the code.</p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          disabled={isProcessing}
          className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
        >
          Close
        </button>
      </div>

      {/* Camera Feed */}
      <div className="relative rounded-[var(--radius-sm)] overflow-hidden border border-[var(--border-medium)]">
        {isProcessing && (
          <div className="absolute inset-0 bg-[var(--bg-primary)]/85 z-10 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                Checking the code…
              </p>
            </div>
          </div>
        )}
        <Scanner
          onScan={onScan}
          onError={onError}
          paused={isPaused || isProcessing}
          constraints={{
            facingMode: "environment",
          }}
          formats={["qr_code"]}
          components={{
            torch: true,
            finder: true,
          }}
          styles={{
            container: {
              width: "100%",
              height: "350px",
            },
          }}
          scanDelay={500}
        />
      </div>

      {/* Instructions */}
      <div className="mt-5">
        <p className={label}>Tips</p>
        <ul className="mt-1.5 list-disc pl-5 space-y-1 text-[13px] text-[var(--text-muted)] marker:text-[var(--text-subtle)]">
          <li>Hold the phone steady over the code.</li>
          <li>Find good light; glare on a screen can block the scan.</li>
          <li>The scan happens on its own, no button needed.</li>
        </ul>
      </div>
    </ModalWrapper>
  );
}
