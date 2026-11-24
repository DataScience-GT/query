interface StepProgressProps {
  steps: readonly string[];
  current: number;
}

export function StepProgress({ steps, current }: StepProgressProps) {
  return (
    // One column per step. A fixed four wrapped a fifth step onto its own row.
    <ol
      className="grid gap-2 mb-8"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
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
