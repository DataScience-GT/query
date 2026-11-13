"use client";

interface CheckboxProps {
  id: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (checked: boolean) => void;
  label: string;
}

/** A labelled checkbox that applies as soon as it changes. 44px tall so it
 *  works as a tap target on a phone. */
export function Checkbox({
  id,
  checked,
  disabled,
  title,
  onChange,
  label,
}: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      title={title}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-[var(--text-primary)]"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded-sm accent-[var(--accent)] disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}
