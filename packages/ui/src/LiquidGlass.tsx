import type { ReactNode } from "react";

export function LiquidGlass({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`liquid-glass ${className}`}>{children}</div>;
}
