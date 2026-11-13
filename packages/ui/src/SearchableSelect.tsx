"use client";

import { useCallback, useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { fieldHint, fieldLabel, input } from "./classes";

/**
 * Every typed word has to appear somewhere in the option, in any order — a
 * plain `includes` on the whole query meant "georgia tech" found nothing.
 * Scored so earlier and word-start matches rank first, shortest wins ties.
 */
export function rankOptions(options: readonly string[], search: string) {
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
}

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

  const filtered = useMemo(
    () => rankOptions(options, search),
    [search, options],
  );

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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
