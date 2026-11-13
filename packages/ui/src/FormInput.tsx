"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import { fieldHint, fieldLabel, input } from "./classes";

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

export function FormInput({
  label,
  required,
  error,
  hint,
  className = "",
  ...props
}: FormInputProps) {
  const autoId = useId();
  const id = props.id ?? autoId;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}
        {required && " *"}
      </label>
      <input
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${input} ${error ? "border-[var(--danger)]" : ""} ${className}`}
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
