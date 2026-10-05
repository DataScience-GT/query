"use client";

import React, { useState, useCallback, useMemo, useId } from "react";
import { AlertCircle } from "lucide-react";
import {
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
} from "@/components/portal/ui";

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
      {error && (
        <p id={errorId} className="mt-1.5 text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
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
      {error && (
        <p id={errorId} className="mt-1.5 text-[13px] text-[var(--danger)]">
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
      <span id={groupId} className={fieldLabel}>
        {label}
        {required && " *"}
      </span>
      <div
        role="group"
        aria-labelledby={groupId}
        className="flex flex-wrap gap-2"
      >
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={value === opt}
            onClick={() => onChange(allowDeselect && value === opt ? "" : opt)}
            className={`px-3.5 py-2 rounded-[var(--radius-sm)] text-sm border transition-colors ${
              value === opt
                ? "border-accent bg-[var(--accent-dim)] text-[var(--text-primary)] font-semibold"
                : "border-[var(--border-medium)] text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
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
      <span id={groupId} className={fieldLabel}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={groupId}
        className="flex flex-wrap gap-2"
      >
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={selected.includes(opt)}
            onClick={() => toggle(opt)}
            className={`px-3.5 py-2 rounded-[var(--radius-sm)] text-sm border transition-colors ${
              selected.includes(opt)
                ? "border-accent bg-[var(--accent-dim)] text-[var(--text-primary)] font-semibold"
                : "border-[var(--border-medium)] text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
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
  /** Highlighted row for keyboard use; -1 is "nothing highlighted". */
  const [active, setActive] = useState(-1);

  /**
   * Every typed word has to appear somewhere in the option, in any order — a
   * plain `includes` on the whole query meant "georgia tech" found nothing.
   * Scored so earlier and word-start matches rank first, shortest wins ties.
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options.slice(0, 50);

    const tokens = q.split(/\s+/);
    const scored: { opt: string; score: number }[] = [];

    for (const opt of options) {
      const lower = opt.toLowerCase();
      let score = lower === q ? 100 : 0;
      let matchesAll = true;

      for (const token of tokens) {
        const at = lower.indexOf(token);
        if (at === -1) {
          matchesAll = false;
          break;
        }
        const atWordStart = at === 0 || !/[a-z0-9]/.test(lower[at - 1] ?? "");
        score += at === 0 ? 3 : atWordStart ? 2 : 1;
      }

      if (matchesAll) scored.push({ opt, score });
    }

    scored.sort((a, b) => b.score - a.score || a.opt.length - b.opt.length);
    return scored.slice(0, 50).map((s) => s.opt);
  }, [search, options]);

  // Without this row an unmatched entry just empties the dropdown, which reads
  // as rejection even though the typed value is already accepted.
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
      setActive(-1);
    },
    [onChange],
  );

  /** The custom row sits above the matches, so both share one index space. */
  const rows = useMemo(
    () => (customEntry ? [customEntry, ...filtered] : filtered),
    [customEntry, filtered],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => {
        if (rows.length === 0) return -1;
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(-1, Math.min(next, rows.length - 1));
      });
      return;
    }
    if (e.key === "Enter" && open && active >= 0 && rows[active]) {
      e.preventDefault();
      handleSelect(rows[active]);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  const inputId = useId();
  const listId = `${inputId}-listbox`;

  return (
    <div className="relative">
      <label htmlFor={inputId} className={fieldLabel}>
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
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        onKeyDown={handleKeyDown}
        required={required}
        value={open ? search : value}
        onFocus={() => {
          setOpen(true);
          setSearch(value);
          setActive(-1);
        }}
        onChange={(e) => {
          setSearch(e.target.value);
          setActive(-1);
          if (allowCustom) onChange(e.target.value);
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            setActive(-1);
          }, 200)
        }
        placeholder={placeholder}
        className={input}
      />
      {hint && <p className={fieldHint}>{hint}</p>}
      {open && rows.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--bg-elevated)] border border-[var(--border-medium)] rounded-[var(--radius-sm)] shadow-[var(--shadow-lg)]"
        >
          {rows.map((opt, i) => {
            const isCustom = customEntry !== null && i === 0;
            return (
              <button
                key={isCustom ? `custom:${opt}` : opt}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                aria-selected={value === opt}
                ref={
                  i === active
                    ? (node) => node?.scrollIntoView({ block: "nearest" })
                    : undefined
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(opt)}
                className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                  i === active
                    ? "bg-[var(--bg-secondary)]"
                    : "hover:bg-[var(--bg-secondary)]"
                } ${
                  isCustom
                    ? "font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)]"
                    : value === opt
                      ? "font-semibold text-[var(--text-primary)]"
                      : "text-[var(--text-muted)]"
                }`}
              >
                {isCustom ? `Use “${opt}”` : opt}
              </button>
            );
          })}
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
    <ol className="grid grid-cols-4 gap-2 mb-8">
      {steps.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className={`border-t-2 pt-2 text-[13px] transition-colors ${
            i <= current
              ? "border-accent text-[var(--text-primary)]"
              : "border-[var(--border-subtle)] text-[var(--text-subtle)]"
          } ${i === current ? "font-semibold" : ""}`}
        >
          {label}
        </li>
      ))}
    </ol>
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
    <div
      role="alert"
      className="mt-6 flex items-start gap-2.5 border-l-2 border-[var(--danger)] py-1 pl-3"
    >
      <AlertCircle
        size={16}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0 text-[var(--danger)]"
        aria-hidden="true"
      />
      <p className="text-[15px] text-[var(--danger)]">{message}</p>
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
          {isSubmitting ? "Submitting…" : "Submit application"}
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
