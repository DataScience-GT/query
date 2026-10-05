"use client";

import React, { useEffect, useRef } from "react";

interface ModalWrapperProps {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Names the dialog for screen readers when the content has no heading. */
  label?: string;
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

/**
 * Every modal in the portal renders through here, so the dialog behaviour
 * people expect lives in one place: Escape closes it, focus moves inside and
 * comes back on close, the page behind stops scrolling, and a screen reader is
 * told a dialog opened rather than reading it as more page content.
 */
export function ModalWrapper({
  children,
  onClose,
  maxWidth = "md",
  label,
}: ModalWrapperProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Read through a ref so the effect below runs once per open. Keyed on
  // onClose, a caller whose handler changes identity (one that depends on a
  // pending flag) ran the cleanup mid-dialog: focus went back to the page and
  // then jumped to the panel, out of whatever control the user was in.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const returnFocusTo = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);

    // The page behind a modal must not scroll with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the panel, not the first control: landing on a destructive button
    // is worse than landing on the container.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusTo?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* A real button, so closing by backdrop is reachable from the keyboard
          too rather than being mouse-only. */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--bg-primary)]/85 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative w-full ${maxWidthClasses[maxWidth]} bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] p-6 sm:p-8 shadow-[var(--shadow-xl)] max-h-[90vh] overflow-y-auto overscroll-contain focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
