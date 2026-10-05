"use client";

import React from "react";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import { ModalWrapper } from "./ModalWrapper";
import {
  btnDanger,
  btnSecondary,
  itemTitle,
  label,
  meta,
  status,
} from "./ui";

const closeButton =
  "shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-semibold text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]";

const infoRow =
  "flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle)] py-3";

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
  const readOnly = useReadOnly();
  const handleCopyCode = () => {
    navigator.clipboard.writeText(event.qrCode);
    alert("Check-in code copied.");
  };

  const handleRegenerate = () => {
    if (
      confirm(
        "Replace this QR code? The current code, and anything printed with it, stops working.",
      )
    ) {
      onRegenerate();
    }
  };

  return (
    <ModalWrapper onClose={onClose} maxWidth="lg">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="min-w-0">
          <h3 className={itemTitle}>Check-in QR code</h3>
          <p className={`${meta} mt-1`}>{event.title}</p>
        </div>
        <button type="button" onClick={onClose} className={closeButton}>
          Close
        </button>
      </div>

      <div className="space-y-6">
        {/* QR Code Display - literal white in both themes so scanners keep the
            contrast the code needs */}
        <div className="mx-auto max-w-sm rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[#ffffff] p-6">
          {qrCodeDataURL && (
            <img
              src={qrCodeDataURL}
              alt="Event QR Code"
              className="w-full h-auto"
            />
          )}
        </div>

        {/* Event Info */}
        <dl className="border-t border-[var(--border-subtle)]">
          <div className={infoRow}>
            <dt className={label}>Event</dt>
            <dd className="text-right text-[15px] text-[var(--text-primary)]">
              {event.title}
            </dd>
          </div>
          <div className={infoRow}>
            <dt className={label}>Checked in</dt>
            <dd className="text-right text-[15px] tabular-nums text-[var(--text-primary)]">
              {event.currentCheckIns}{" "}
              {event.maxCheckIns ? `of ${event.maxCheckIns}` : "(no limit)"}
            </dd>
          </div>
          <div className={infoRow}>
            <dt className={label}>Check-in</dt>
            <dd>
              <span
                className={status(event.checkInEnabled ? "accent" : "neutral")}
              >
                {event.checkInEnabled ? "Open" : "Closed"}
              </span>
            </dd>
          </div>
        </dl>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onDownload} className={btnSecondary}>
            Download PNG
          </button>
          <button
            type="button"
            onClick={handleCopyCode}
            className={btnSecondary}
          >
            Copy code
          </button>
        </div>

        {/* Regenerate Button */}
        <div className="border-t border-[var(--border-subtle)] pt-5">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={readOnly || isRegenerating}
            title={readOnly ? READ_ONLY_TITLE : undefined}
            className={`${btnDanger} w-full`}
          >
            {isRegenerating ? "Replacing…" : "Replace QR code"}
          </button>
          <p className={`${meta} mt-2`}>
            The current code, and anything printed with it, stops working.
          </p>
        </div>
      </div>
    </ModalWrapper>
  );
}
