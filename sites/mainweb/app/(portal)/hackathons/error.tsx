"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { useChunkErrorRecovery } from "@/lib/chunk-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError = useChunkErrorRecovery(error);
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Hackathons Page Error:", error);
  }, [error]);

  return (
    <div className="relative min-h-screen bg-[var(--bg-secondary)] text-text-muted font-sans selection:bg-emerald-500/30 overflow-x-hidden flex items-center justify-center">
      <main className="relative z-10 w-full max-w-xl px-6">
        <LiquidGlass className="p-12 text-center border-red-500/20">
          <div className="w-16 h-16 rounded-none bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h2 className="text-3xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-4">
            System Failure
          </h2>

          <p className="text-sm font-mono text-[var(--text-muted)] mb-8">
            The hacker terminal encountered an unexpected fault line. We've
            logged the anomaly.
            <br />
            <br />
            <span className="text-red-400/80 text-xs bg-red-500/10 px-3 py-1 rounded border border-red-500/10">
              {error.message || "Unknown rendering exception"}
            </span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => (isChunkError ? window.location.reload() : reset())}
              className="px-6 py-3 bg-emerald-500 text-[var(--bg-primary)] font-black uppercase tracking-widest text-sm rounded-none hover:bg-emerald-400 transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              Reboot System
            </button>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold uppercase tracking-widest text-sm rounded-none hover:bg-white/10 transition-colors"
            >
              Return to Base
            </Link>
          </div>
        </LiquidGlass>
      </main>
    </div>
  );
}
