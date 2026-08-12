"use client";

import React, { useState, useCallback, useMemo, useId } from "react";

// ── Reusable Form Primitives ── //

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  error?: string;
}

export function FormInput({
  label,
  required,
  error,
  className = "",
  ...props
}: FormInputProps) {
  const autoId = useId();
  const id = props.id ?? autoId;
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] uppercase tracking-widest font-semibold text-[var(--text-primary)]/50 mb-2"
      >
        {label}
        {required && " *"}
      </label>
      <input
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full px-4 py-3.5 bg-[var(--bg-input)] border rounded-none text-[var(--text-primary)] text-sm font-medium placeholder:text-[var(--text-primary)]/20 focus:border-emerald-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-ui ${error ? "border-rose-500/50" : "border-[var(--border-subtle)]"} ${className}`}
      />
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-rose-400 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

interface FormTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  required?: boolean;
  error?: string;
}

export function FormTextarea({
  label,
  required,
  error,
  className = "",
  ...props
}: FormTextareaProps) {
  const autoId = useId();
  const id = props.id ?? autoId;
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] uppercase tracking-widest font-semibold text-[var(--text-primary)]/50 mb-2"
      >
        {label}
        {required && " *"}
      </label>
      <textarea
        {...props}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full px-4 py-3.5 bg-[var(--bg-input)] border rounded-none text-[var(--text-primary)] text-sm font-medium placeholder:text-[var(--text-primary)]/20 focus:border-emerald-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-ui resize-none ${error ? "border-rose-500/50" : "border-[var(--border-subtle)]"} ${className}`}
      />
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-rose-400 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

interface FormChipSelectProps {
  label: string;
  required?: boolean;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  allowDeselect?: boolean;
}

export function FormChipSelect({
  label,
  required,
  options,
  value,
  onChange,
  allowDeselect = false,
}: FormChipSelectProps) {
  const groupId = useId();

  return (
    <div>
      {/* A chip group is a set of buttons, not a single control, so it gets a
          labelled group rather than a <label> with nothing to point at. */}
      <span
        id={groupId}
        className="block text-[11px] uppercase tracking-widest font-semibold text-[var(--text-primary)]/50 mb-2"
      >
        {label}
        {required && " *"}
      </span>
      <div
        role="group"
        aria-labelledby={groupId}
        className="flex flex-wrap gap-2.5"
      >
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={value === opt}
            onClick={() => onChange(allowDeselect && value === opt ? "" : opt)}
            className={`px-4 py-2.5 rounded-none text-sm font-bold border transition-ui ${
              value === opt
                ? "bg-emerald-500/20 border-emerald-500/50 text-accent shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-primary)]/60 hover:bg-white/5"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FormMultiChipSelectProps {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  noneOption?: string;
}

export function FormMultiChipSelect({
  label,
  options,
  selected,
  onChange,
  noneOption,
}: FormMultiChipSelectProps) {
  function toggle(opt: string) {
    if (opt === noneOption) {
      onChange([]);
      return;
    }
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt],
    );
  }
  const groupId = useId();

  return (
    <div>
      <span
        id={groupId}
        className="block text-[11px] uppercase tracking-widest font-semibold text-[var(--text-primary)]/50 mb-2"
      >
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={groupId}
        className="flex flex-wrap gap-2.5"
      >
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={selected.includes(opt)}
            onClick={() => toggle(opt)}
            className={`px-4 py-2 rounded-none text-sm font-medium border transition-ui ${
              selected.includes(opt)
                ? "bg-emerald-500/20 border-emerald-500/50 text-accent shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "bg-[var(--bg-input)] border-[var(--border-subtle)] text-[var(--text-primary)]/60 hover:bg-white/5"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Searchable Combobox (Forge-inspired) ── //

interface SearchableSelectProps {
  label: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  allowCustom?: boolean;
  hint?: string;
}

export function SearchableSelect({
  label,
  required,
  placeholder,
  value,
  onChange,
  options,
  allowCustom = true,
  hint,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return options.slice(0, 50);
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 50);
  }, [search, options]);

  /**
   * A typed value is already committed on every keystroke, but with nothing in
   * the list matching it the dropdown simply disappeared — which reads as "that
   * answer was rejected". This row says out loud that the entry counts.
   */
  const customEntry =
    allowCustom &&
    search.trim().length > 0 &&
    !options.some((o) => o.toLowerCase() === search.trim().toLowerCase())
      ? search.trim()
      : null;

  const handleSelect = useCallback(
    (opt: string) => {
      onChange(opt);
      setSearch("");
      setOpen(false);
    },
    [onChange],
  );

  const inputId = useId();
  const listId = `${inputId}-listbox`;

  return (
    <div className="relative">
      <label
        htmlFor={inputId}
        className="block text-[11px] uppercase tracking-widest font-semibold text-[var(--text-primary)]/50 mb-2"
      >
        {label}
        {required && " *"}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        required={required}
        value={open ? search : value}
        onFocus={() => {
          setOpen(true);
          setSearch(value);
        }}
        onChange={(e) => {
          setSearch(e.target.value);
          if (allowCustom) onChange(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className="w-full px-4 py-3.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-none text-[var(--text-primary)] text-sm font-medium placeholder:text-[var(--text-primary)]/20 focus:border-emerald-500/50 focus:bg-white/[0.02] focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-ui"
      />
      {hint && (
        <p className="mt-1.5 text-[11px] text-[var(--text-primary)]/30">
          {hint}
        </p>
      )}
      {open && (filtered.length > 0 || customEntry) && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-2 w-full max-h-48 overflow-y-auto bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-none shadow-2xl backdrop-blur-xl"
        >
          {customEntry && (
            <button
              type="button"
              role="option"
              aria-selected={value === customEntry}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(customEntry)}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-accent hover:bg-white/5 transition-colors border-b border-[var(--border-subtle)]"
            >
              Use “{customEntry}”
            </button>
          )}
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={value === opt}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(opt)}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors ${value === opt ? "text-accent bg-emerald-500/5" : "text-[var(--text-primary)]/70"}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step Progress Indicator ── //

interface StepProgressProps {
  steps: readonly string[];
  current: number;
}

export function StepProgress({ steps, current }: StepProgressProps) {
  return (
    <div className="flex items-center gap-1 mb-10">
      {steps.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-2">
          <div className="w-full flex items-center">
            <div
              className={`flex-1 h-1 rounded-sm transition-ui duration-500 ${i <= current ? "bg-emerald-500" : "bg-white/10"}`}
            />
          </div>
          <span
            className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${i <= current ? "text-accent" : "text-[var(--text-primary)]/30"}`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Step Container ── //

export function StepContainer({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <h4 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
        {title}
      </h4>
      {children}
    </div>
  );
}

// ── Form Error Alert ── //

export function FormErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-none flex items-center gap-3">
      <svg
        className="w-5 h-5 text-rose-400 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="text-rose-400 text-sm font-medium">{message}</p>
    </div>
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
}

export function FormNavigation({
  step,
  totalSteps,
  onBack,
  onNext,
  onSubmit,
  onCancel,
  isSubmitting,
}: FormNavigationProps) {
  const isLastStep = step >= totalSteps - 1;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 pt-8">
      {step > 0 && (
        <button
          onClick={onBack}
          type="button"
          className="w-full sm:w-auto px-6 py-4 rounded-none bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)]/60 hover:text-[var(--text-primary)] hover:bg-white/10 font-bold text-sm uppercase tracking-widest transition-ui"
        >
          Back
        </button>
      )}
      {!isLastStep ? (
        <button
          onClick={onNext}
          type="button"
          className="w-full sm:w-auto px-8 py-4 rounded-none bg-emerald-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-ui duration-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:-translate-y-0.5"
        >
          Continue
        </button>
      ) : (
        <button
          onClick={onSubmit}
          type="button"
          disabled={isSubmitting}
          className="w-full sm:w-auto px-8 py-4 rounded-none bg-emerald-500 text-[#020202] font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-ui duration-300 disabled:opacity-50 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:-translate-y-0.5"
        >
          {isSubmitting ? "Submitting…" : "Submit Application"}
        </button>
      )}
      <button
        onClick={onCancel}
        type="button"
        className="w-full sm:w-auto px-6 py-4 text-[var(--text-primary)]/40 hover:text-[var(--text-primary)] text-sm font-bold uppercase tracking-widest transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
