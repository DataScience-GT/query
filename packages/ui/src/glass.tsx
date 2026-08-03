import React from "react";

interface GlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  intensity?: "low" | "medium" | "high";
}

export function Glass({
  children,
  className = "",
  intensity = "medium",
  ...props
}: GlassProps) {
  const intensityStyles = {
    low: "bg-black/40 backdrop-blur-md border-white/5",
    medium: "bg-black/60 backdrop-blur-lg border-white/10",
    high: "bg-black/80 backdrop-blur-xl border-white/20",
  };

  return (
    <div
      className={`relative rounded-xl border shadow-xl overflow-hidden ${intensityStyles[intensity]} ${className}`}
      {...props}
    >
      {/* Glossy reflection effect */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x, 0px) var(--mouse-y, 0px), rgba(255,255,255,0.06), transparent 40%)`,
        }}
      />
      {/* Top highlight for glass edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {children}
    </div>
  );
}
