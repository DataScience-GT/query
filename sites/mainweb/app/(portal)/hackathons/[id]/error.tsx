"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
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
    console.error("Hackathon Detail Page Error:", error);
  }, [error]);

  return (
    <div className="relative min-h-screen bg-[var(--bg-tertiary)] text-[var(--text-muted)] overflow-x-hidden flex items-center justify-center">
      <main className="relative z-10 w-full max-w-xl px-6">
        <LiquidGlass printed className="p-10 text-center">
          <AlertTriangle
            className="w-6 h-6 text-red-400 mx-auto mb-4"
            aria-hidden="true"
          />

          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-wider font-oswald uppercase mb-2">
            {isChunkError ? "New version available" : "Couldn't load this hackathon"}
          </h2>

          <p className="text-sm text-[var(--text-muted)] mb-6">
            {isChunkError
              ? "The app was updated while this tab was open, so part of the old version is no longer on the server. Reloading picks up the new build."
              : "Something went wrong loading this page. Try again, and if it keeps happening, let an organiser know."}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              onClick={() => (isChunkError ? window.location.reload() : reset())}
              className="px-6 py-3 bg-accent text-[var(--text-on-accent)] rounded-sm font-bold text-sm uppercase tracking-widest hover:bg-[var(--accent-secondary)] transition-ui disabled:opacity-50"
            >
              {isChunkError ? "Reload page" : "Try again"}
            </button>
            <Link
              href="/hackathons"
              className="px-5 py-2.5 rounded-sm border border-[var(--border-medium)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)] transition-ui text-xs font-bold uppercase tracking-widest"
            >
              Back to hackathons
            </Link>
          </div>
        </LiquidGlass>
      </main>
    </div>
  );
}
