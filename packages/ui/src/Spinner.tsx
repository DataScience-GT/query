const sizes = {
  16: "h-4 w-4",
  32: "h-8 w-8",
} as const;

const tones = {
  current: "border-current border-t-transparent",
  accent: "border-accent border-t-transparent",
  track: "border-[var(--border-medium)] border-t-accent",
} as const;

interface SpinnerProps {
  size?: keyof typeof sizes;
  tone?: keyof typeof tones;
  className?: string;
}

export function Spinner({
  size = 16,
  tone = "current",
  className,
}: SpinnerProps) {
  const classes = [
    "block animate-spin rounded-full border-2",
    sizes[size],
    tones[tone],
    className,
  ];
  return (
    <span aria-hidden="true" className={classes.filter(Boolean).join(" ")} />
  );
}
