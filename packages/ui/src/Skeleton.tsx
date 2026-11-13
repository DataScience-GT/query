export function Skeleton({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-[var(--bg-secondary)] ${className}`}
    />
  );
}
