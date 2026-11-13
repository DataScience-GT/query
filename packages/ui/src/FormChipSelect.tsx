"use client";

import { useId } from "react";
import { fieldLabel } from "./classes";

interface ChipGroupProps {
  label: string;
  required?: boolean;
  options: readonly string[];
  isSelected: (opt: string) => boolean;
  onPick: (opt: string) => void;
}

function ChipGroup({
  label,
  required,
  options,
  isSelected,
  onPick,
}: ChipGroupProps) {
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
        {options.map((opt) => {
          const selected = isSelected(opt);
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(opt)}
              className={`px-3.5 py-2 rounded-[var(--radius-sm)] text-sm border transition-colors ${
                selected
                  ? "border-accent bg-[var(--accent-dim)] text-[var(--text-primary)] font-semibold"
                  : "border-[var(--border-medium)] text-[var(--text-muted)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
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
  return (
    <ChipGroup
      label={label}
      required={required}
      options={options}
      isSelected={(opt) => value === opt}
      onPick={(opt) => onChange(allowDeselect && value === opt ? "" : opt)}
    />
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

  return (
    <ChipGroup
      label={label}
      options={options}
      isSelected={(opt) => selected.includes(opt)}
      onPick={toggle}
    />
  );
}
