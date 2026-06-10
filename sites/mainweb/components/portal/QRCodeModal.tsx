"use client";

import React from "react";
import { ModalWrapper } from "./ModalWrapper";

interface Event {
  id: string;
  title: string;
  qrCode: string;
  checkInEnabled: boolean;
  currentCheckIns: number;
  maxCheckIns: number | null;
}

interface QRCodeModalProps {
  event: Event;
  qrCodeDataURL: string;
  onClose: () => void;
  onDownload: () => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export function QRCodeModal({
  event,
  qrCodeDataURL,
  onClose,
  onDownload,
  onRegenerate,
  isRegenerating = false,
}: QRCodeModalProps) {
  const handleCopyCode = () => {
    navigator.clipboard.writeText(event.qrCode);
    alert("Access Code copied to buffer.");
  };

  const handleRegenerate = () => {
    if (confirm("Regenerate protocols? Current QR will be deprecated.")) {
      onRegenerate();
    }
  };

  return (
    <ModalWrapper onClose={onClose} maxWidth="lg">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 pb-6 border-b border-[var(--border-subtle)]">
        <div>
          <h3 className="text-3xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter">
            QR Protocols
          </h3>
          <p className="text-sm font-mono text-accent uppercase tracking-widest mt-1">
            {event.title}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-subtle)] hover:text-[var(--text-primary)] transition-colors text-xs uppercase tracking-widest font-mono p-2 hover:bg-white/5 rounded"
        >
          [ Close ]
        </button>
      </div>

      <div className="space-y-8">
        {/* QR Code Display - White background with more padding */}
        <div className="bg-white p-8 rounded-none shadow-lg mx-auto max-w-sm">
          {qrCodeDataURL && (
            <img
              src={qrCodeDataURL}
              alt="Event QR Code"
              className="w-full h-auto"
            />
          )}
        </div>

        {/* Event Info */}
        <div className="bg-[var(--bg-primary)]/40 border border-[var(--border-subtle)] rounded-none p-6 space-y-4">
          <div className="flex justify-between text-sm font-mono">
            <span className="text-gray-600 uppercase">IDENT:</span>
            <span className="text-[var(--text-primary)]">{event.title}</span>
          </div>
          <div className="flex justify-between text-sm font-mono">
            <span className="text-gray-600 uppercase">SYNC COUNT:</span>
            <span className="text-[var(--text-primary)]">
              {event.currentCheckIns}{" "}
              {event.maxCheckIns ? `/ ${event.maxCheckIns}` : "/ Unlimited"}
            </span>
          </div>
          <div className="flex justify-between text-sm font-mono">
            <span className="text-gray-600 uppercase">STATUS:</span>
            <span
              className={
                event.checkInEnabled
                  ? "text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                  : "text-red-500"
              }
            >
              {event.checkInEnabled ? "LINK ACTIVE" : "LINK TERMINATED"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onDownload}
            className="px-6 py-4 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold text-sm uppercase tracking-widest hover:bg-white/10 transition-all rounded-none font-mono"
          >
            SAVE IMG
          </button>
          <button
            onClick={handleCopyCode}
            className="px-6 py-4 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold text-sm uppercase tracking-widest hover:bg-white/10 transition-all rounded-none font-mono"
          >
            COPY VAL
          </button>
        </div>

        {/* Regenerate Button */}
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="w-full px-6 py-4 bg-red-500/5 border border-red-500/20 text-red-500/80 font-bold text-sm uppercase tracking-widest hover:bg-red-500/10 transition-all disabled:opacity-50 rounded-none font-mono"
        >
          {isRegenerating ? "RENEWING..." : "REBOOT QR SYSTEM"}
        </button>
      </div>
    </ModalWrapper>
  );
}
