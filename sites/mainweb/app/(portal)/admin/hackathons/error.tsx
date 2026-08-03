"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LiquidGlass } from "@/components/portal/LiquidGlass";
import { useChunkErrorRecovery } from "@/lib/chunk-error";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // A stale chunk after a deploy cannot be fixed by reset() — this reloads.
  const isChunkError = useChunkErrorRecovery(error);

  useEffect(() => {
    console.error("Admin Hackathons Error:", error);
  }, [error]);

  return (
    <div className="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-muted)] font-sans selection:bg-accent/30 overflow-x-hidden flex items-center justify-center">
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
            {isChunkError ? "New Version Available" : "Admin Protocol Error"}
          </h2>

          <p className="text-sm font-mono text-[var(--text-muted)] mb-8">
            {isChunkError ? (
              <>
                The app was updated while this tab was open, so part of the old
                version is no longer on the server. Reloading picks up the new
                build — your data is unaffected.
              </>
            ) : (
              <>
                The admin module encountered a critical fault during execution.
                Please verify your clearance and try again.
              </>
            )}
            <br />
            <br />
            <span className="text-red-400/80 text-xs bg-red-500/10 px-3 py-1 rounded border border-red-500/10">
              {error.message || "Unknown execution exception"}
            </span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              onClick={() =>
                isChunkError ? window.location.reload() : reset()
              }
              className="px-6 py-3 bg-accent text-black font-black uppercase tracking-widest text-sm rounded-none hover:bg-white transition-colors"
            >
              {isChunkError ? "Reload Page" : "Retry Execution"}
            </button>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-white/5 border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold uppercase tracking-widest text-sm rounded-none hover:bg-white/10 transition-colors"
            >
              Abort to Dashboard
            </Link>
          </div>
        </LiquidGlass>
      </main>
    </div>
  );
}
