import React from "react";

interface LiquidGlassProps {
  children: React.ReactNode;
  className?: string;
  variant?: "medium" | "large";
  as?: React.ElementType;
}

export function LiquidGlass({
  children,
  className = "",
  variant = "medium",
  as: Component = "div",
}: LiquidGlassProps) {
  const baseClass = variant === "large" ? "liquid-glass-lg" : "liquid-glass";

  return (
    <Component className={`${baseClass} ${className}`}>{children}</Component>
  );
}
