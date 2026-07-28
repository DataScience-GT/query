"use client";

import React from "react";
import dynamic from "next/dynamic";
import { ModalWrapper } from "./ModalWrapper";

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="h-[350px] flex items-center justify-center bg-[var(--bg-secondary)]">
        <p className="text-[10px] text-[var(--text-subtle)] uppercase tracking-widest font-mono">
          Starting camera...
        </p>
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter">
            QR Scanner
          </h3>
          <p className="text-[9px] font-mono text-accent uppercase tracking-widest">
            Event Check-In System
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          disabled={isProcessing}
          className="text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors text-[10px] uppercase tracking-widest disabled:opacity-50"
        >
          [ Close ]
        </button>
      </div>

      {/* Camera Feed */}
      <div className="relative rounded-none overflow-hidden border-2 border-accent/30">
        {isProcessing && (
          <div className="absolute inset-0 bg-[var(--bg-primary)]/80 z-10 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-sm animate-spin mx-auto mb-3" />
              <p className="text-[10px] text-accent uppercase tracking-widest font-mono">
                Verifying...
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
      <div className="mt-4 bg-accent/10 border border-accent/30 rounded-none p-4">
        <p className="text-[9px] text-accent uppercase tracking-widest font-bold mb-2">
          Instructions:
        </p>
        <ul className="text-[8px] text-[var(--text-subtle)] space-y-1 font-mono">
          <li>• Hold phone steady over QR code</li>
          <li>• Ensure good lighting conditions</li>
          <li>• Scan happens automatically</li>
        </ul>
      </div>
    </ModalWrapper>
  );
}
