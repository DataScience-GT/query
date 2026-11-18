"use client";

import { useEffect } from "react";
import { useChunkErrorRecovery } from "@/lib/chunk-error";

// Classes are written out instead of imported from @query/ui/classes: that is
// one module, so importing it here would send it to every page under this
// segment that does not already use it.
export default function JudgeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The desk loads the project sheet and its other views on demand, so a tab
  // left open across a deploy asks for a chunk that is gone. reset() cannot fix
  // that; a reload can.
  const isChunkError = useChunkErrorRecovery(error);

  useEffect(() => {
    console.error("Judge Desk Error:", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-6 pb-10 sm:px-8 md:pt-12">
      <h1 className="font-[family-name:var(--font-display)] text-[40px] leading-[1.02] font-semibold tracking-[-0.025em] text-balance text-[var(--text-primary)]">
        {isChunkError ? "A new version is available" : "The desk did not load"}
      </h1>
      <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-[var(--text-muted)]">
        {isChunkError
          ? "The app was updated while this page was open. Reload to pick up the new version. Evaluations you already submitted are unaffected."
          : "Something went wrong. Check your connection, then try again."}
      </p>
      <div className="mt-8">
        <button
          type="button"
          onClick={() => (isChunkError ? window.location.reload() : reset())}
          className="bg-accent focus-visible:outline-accent inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] px-5 py-2.5 text-sm font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {isChunkError ? "Reload page" : "Try again"}
        </button>
      </div>
    </main>
  );
}
