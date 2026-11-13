"use client";

interface SwitchProps {
  id: string;
  checked: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (next: boolean) => void;
}

/** An on/off control that applies as soon as it is flipped. */
export function Switch({
  id,
  checked,
  disabled,
  title,
  onChange,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="group flex min-h-11 shrink-0 items-center disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        className={`relative h-6 w-11 rounded-full border transition-colors ${
          checked
            ? "border-accent bg-accent"
            : "border-[var(--border-medium)] bg-[var(--bg-input)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-[left] ${
            checked
              ? "left-[22px] bg-[var(--text-on-accent)]"
              : "left-0.5 bg-[var(--text-subtle)]"
          }`}
        />
      </span>
    </button>
  );
}
