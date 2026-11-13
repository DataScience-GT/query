import { label, meta } from "./classes";

const dividers = {
  sm: "sm:border-l sm:border-[var(--border-subtle)] sm:pl-6 sm:first:border-l-0 sm:first:pl-0",
  lg: "lg:border-l lg:border-[var(--border-subtle)] lg:pl-6 lg:first:border-l-0 lg:first:pl-0",
};

const figure =
  "mt-1 font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tabular-nums text-[var(--text-primary)]";

interface StatTileProps {
  title: string;
  value: string | number;
  subtitle?: string;
  /** Five figures share a row: the divider waits for lg and the figure stays 32px. */
  dense?: boolean;
}

export function StatTile({
  title,
  value,
  subtitle,
  dense = false,
}: StatTileProps) {
  return (
    <div className={dense ? dividers.lg : dividers.sm}>
      <dt className={label}>{title}</dt>
      <dd className={dense ? figure : `${figure} md:text-[36px]`}>{value}</dd>
      {subtitle && <dd className={`mt-1.5 ${meta}`}>{subtitle}</dd>}
    </div>
  );
}

export function StatTileSkeleton({ dense = false }: { dense?: boolean }) {
  return (
    <div className={dense ? dividers.lg : dividers.sm} aria-hidden>
      <div className="h-4 w-24 rounded-[var(--radius-sm)] bg-[var(--bg-secondary)]" />
      <div
        className={`mt-2 ${dense ? "h-8 w-14" : "h-9 w-16"} rounded-[var(--radius-sm)] bg-[var(--bg-secondary)]`}
      />
    </div>
  );
}
