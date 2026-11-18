"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useChunkErrorRecovery } from "@/lib/chunk-error";

// Classes are written out instead of imported from @query/ui/classes: that is
// one module, so importing it here would send it to every page under this
// segment that does not already use it.
const BUTTON =
  "inline-flex items-center justify-center rounded-[var(--radius-sm)] text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default function AdminJudgingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The console loads its sections on demand, so a tab left open across a
  // deploy asks for a chunk that is gone. reset() cannot fix that; a reload can.
  const isChunkError = useChunkErrorRecovery(error);

  useEffect(() => {
    console.error("Admin Judging Error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16">
      <h2 className="font-[family-name:var(--font-display)] text-[28px] leading-tight font-semibold text-[var(--text-primary)]">
        {isChunkError ? "New version available" : "Couldn't load judging"}
      </h2>

      <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">
        {isChunkError
          ? "The app was updated while this tab was open, so part of the old version is no longer on the server. Reloading picks up the new build. Your data is unaffected."
          : "Something went wrong. Try again; if it persists, the message below will help whoever debugs it."}
      </p>

      <p className="mt-4 border-l-2 border-[var(--danger)] pl-3 text-[13px] break-words text-[var(--danger)]">
        {error.message || "No error message"}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => (isChunkError ? window.location.reload() : reset())}
          className={`${BUTTON} bg-accent px-5 py-2.5 text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)]`}
        >
          {isChunkError ? "Reload page" : "Try again"}
        </button>
        <Link
          href="/admin/judging"
          className={`${BUTTON} border border-[var(--border-medium)] px-4 py-2.5 text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-secondary)]`}
        >
          All editions
        </Link>
      </div>
    </div>
  );
}
