"use client";

import React from "react";
import { Check, X } from "lucide-react";
import { ModalWrapper } from "./ModalWrapper";
import { btnPrimary, btnSecondary, itemTitle, label } from "./ui";

interface ScanResultModalProps {
  success: boolean;
  message: string;
  eventTitle?: string;
  onClose: () => void;
}

export function ScanResultModal({
  success,
  message,
  eventTitle,
  onClose,
}: ScanResultModalProps) {
  return (
    <ModalWrapper onClose={onClose} maxWidth="md">
      <div className="space-y-6">
        {/* Title */}
        <div className="flex items-start gap-3">
          {success ? (
            <Check
              aria-hidden="true"
              strokeWidth={1.75}
              className="mt-1.5 h-5 w-5 shrink-0 text-[var(--success)]"
            />
          ) : (
            <X
              aria-hidden="true"
              strokeWidth={1.75}
              className="mt-1.5 h-5 w-5 shrink-0 text-[var(--danger)]"
            />
          )}
          <h3 className={itemTitle}>
            {success ? "Checked in" : "Check-in didn’t go through"}
          </h3>
        </div>

        {/* Success Event Details */}
        {success && eventTitle && (
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <p className={label}>Event</p>
            <p className="mt-1 text-[17px] font-semibold text-[var(--text-primary)]">
              {eventTitle}
            </p>
          </div>
        )}

        {/* Error Message */}
        {!success && (
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <p className="text-[15px] text-[var(--danger)]">{message}</p>
            <p className="mt-2 text-[13px] text-[var(--text-subtle)]">
              Close this and scan the code again.
            </p>
          </div>
        )}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className={`w-full ${success ? btnPrimary : btnSecondary}`}
        >
          {success ? "Done" : "Close"}
        </button>
      </div>
    </ModalWrapper>
  );
}
