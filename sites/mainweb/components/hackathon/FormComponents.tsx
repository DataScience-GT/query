"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert } from "@query/ui/Alert";
import { btnPrimary, btnSecondary, itemTitle } from "@query/ui/classes";

// ── Step Container ── //

export function StepContainer({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <h4 className={itemTitle}>{title}</h4>
      {children}
    </div>
  );
}

// ── Form Error Alert ── //

export function FormErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert rule className="mt-6 flex items-start gap-2.5 py-1">
      <AlertCircle
        size={16}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0 text-[var(--danger)]"
        aria-hidden="true"
      />
      {message}
    </Alert>
  );
}

// ── Navigation Buttons ── //

interface FormNavigationProps {
  step: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  /** The last step's button, when it does not submit a new application. */
  submitLabel?: string;
}

export function FormNavigation({
  step,
  totalSteps,
  onBack,
  onNext,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = "Submit application",
}: FormNavigationProps) {
  const isLastStep = step >= totalSteps - 1;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-8">
      {step > 0 && (
        <button
          onClick={onBack}
          type="button"
          className={`${btnSecondary} w-full sm:w-auto`}
        >
          Back
        </button>
      )}
      {!isLastStep ? (
        <button
          onClick={onNext}
          type="button"
          className={`${btnPrimary} w-full sm:w-auto`}
        >
          Continue
        </button>
      ) : (
        <button
          onClick={onSubmit}
          type="button"
          disabled={isSubmitting}
          className={`${btnPrimary} w-full sm:w-auto`}
        >
          {isSubmitting ? "Submitting…" : submitLabel}
        </button>
      )}
      <button
        onClick={onCancel}
        type="button"
        className="w-full sm:w-auto sm:ml-auto py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
