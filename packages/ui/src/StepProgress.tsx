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
