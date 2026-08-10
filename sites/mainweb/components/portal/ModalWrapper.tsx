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

  useEffect(() => {
    const returnFocusTo = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* A real button, so closing by backdrop is reachable from the keyboard
          too rather than being mouse-only. */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--bg-primary)]/95 backdrop-blur-md cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative w-full ${maxWidthClasses[maxWidth]} bg-[var(--bg-card)] border border-accent/30 rounded-none p-8 shadow-[0_0_50px_rgba(16,185,129,0.2)] animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto overscroll-contain focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
