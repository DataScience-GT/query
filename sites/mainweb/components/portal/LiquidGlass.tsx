import React from "react";

interface LiquidGlassProps {
  children: React.ReactNode;
  className?: string;
  variant?: "medium" | "large";
  as?: React.ElementType;
  holographic?: boolean;
  printed?: boolean;
}

export function LiquidGlass({
  children,
  className = "",
  variant = "medium",
  as: Component = "div",
  holographic = false,
  printed = false,
}: LiquidGlassProps) {
  const baseClass = variant === "large" ? "liquid-glass-lg" : "liquid-glass";
  const holoClass = holographic ? "card-holographic" : "";
  const printedClass = printed ? "card-printed" : "";

  return (
    <Component className={`${baseClass} ${holoClass} ${printedClass} ${className}`}>
      {children}
    </Component>
  );
}
