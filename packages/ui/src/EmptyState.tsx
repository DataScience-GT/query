import type { ReactNode } from "react";
import { body } from "./classes";

interface EmptyStateProps {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** The line shown where a list has nothing in it yet. */
export function EmptyState({
  title,
  children,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={className}>
      {title && (
        <p className="text-[15px] font-semibold text-[var(--text-primary)]">
          {title}
        </p>
      )}
      <p className={`${body} ${title ? "mt-1" : ""}`}>{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
