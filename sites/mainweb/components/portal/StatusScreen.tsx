"use client";

import React from "react";

type StatusVariant = "denied" | "waiting" | "success";

interface StatusScreenProps {
  variant: StatusVariant;
  title: string;
  subtitle?: string;
  message?: string;
  onAction?: () => void;
  actionLabel?: string;
  actionVariant?: "primary" | "danger" | "default";
}

const variantConfig = {
  denied: {
    iconBg: "bg-red-500/10 border-red-500/30",
    iconColor: "text-red-500",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
  },
  waiting: {
    iconBg: "bg-yellow-500/10 border-yellow-500/30",
    iconColor: "text-yellow-500",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  success: {
    iconBg: "bg-accent/10 border-accent/30",
    iconColor: "text-accent",
    icon: (
      <svg
        className="w-10 h-10"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
  },
};

const actionVariantClasses = {
  primary:
    "px-12 py-5 bg-white text-black font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-accent hover:text-[var(--text-primary)] transition-all active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.1)]",
  danger:
    "px-8 py-3 border border-red-500/20 text-red-500 font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-red-500/10 transition-all",
  default:
    "px-8 py-3 border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono text-[10px] uppercase tracking-[0.3em] hover:bg-white/5 transition-all",
};

export function StatusScreen({
  variant,
  title,
  subtitle,
  message,
  onAction,
  actionLabel = "Continue",
  actionVariant = "default",
}: StatusScreenProps) {
  const config = variantConfig[variant];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[var(--bg-primary)] selection:bg-accent/30">
      <div
        className={`w-16 h-16 ${variant === "success" ? "w-20 h-20" : ""} rounded-sm flex items-center justify-center mb-6 ${variant === "success" ? "mb-8 shadow-[0_0_40px_rgba(16,185,129,0.2)]" : ""} ${config.iconBg} border ${config.iconColor}`}
      >
        {config.icon}
      </div>

      {variant === "success" ? (
        <h1 className="text-4xl font-black text-[var(--text-primary)] uppercase tracking-tighter mb-2">
          {title.split(" ")[0]}
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-[#005a5a] italic">
            {title.split(" ").slice(1).join(" ")}
          </span>
        </h1>
      ) : (
        <h1 className="text-2xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-2">
          {title}
        </h1>
      )}

      {subtitle && (
        <p className="text-[var(--text-subtle)] font-mono text-sm mb-8">
          {subtitle}
        </p>
      )}

      {message && (
        <p className="text-[var(--text-subtle)] font-mono text-sm mb-8">
          {message}
        </p>
      )}

      {onAction && (
        <button
          onClick={onAction}
          className={actionVariantClasses[actionVariant]}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
