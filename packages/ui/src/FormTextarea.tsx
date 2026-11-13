"use client";

import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { fieldHint, fieldLabel, input } from "./classes";

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

export function FormTextarea({
  label,
  required,
  error,
  hint,
  className = "",
  ...props
}: FormTextareaProps) {
  const autoId = useId();
  const id = props.id ?? autoId;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}
        {required && " *"}
      </label>
      <textarea
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${input} resize-none ${error ? "border-[var(--danger)]" : ""} ${className}`}
      />
      {hint && <p className={fieldHint}>{hint}</p>}
      {error && (
        <p id={errorId} className="mt-1.5 text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
