"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useChunkErrorRecovery } from "@/lib/chunk-error";
import { body, btnPrimary, btnSecondary, sectionTitle } from "@/components/portal/ui";

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
    <div className="relative min-h-screen bg-[var(--bg-primary)] text-[var(--text-muted)] flex items-center justify-center">
      <main className="relative z-10 w-full max-w-xl px-6">
        <h2 className={sectionTitle}>
          {isChunkError ? "New version available" : "Couldn't load this page"}
        </h2>

        <p className={`mt-3 ${body}`}>
          {isChunkError ? (
            <>
              The app was updated while this tab was open, so part of the old
              version is no longer on the server. Reloading picks up the new
              build — your data is unaffected.
            </>
          ) : (
            <>
              Something went wrong. Try again; if it persists, the message
              below will help whoever debugs it.
            </>
          )}
        </p>

        <p className="mt-4 border-l-2 border-[var(--danger)] pl-3 text-[13px] text-[var(--danger)] break-words">
          {error.message || "No error message"}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() =>
              isChunkError ? window.location.reload() : reset()
            }
            className={btnPrimary}
          >
            {isChunkError ? "Reload page" : "Try again"}
          </button>
          <Link href="/dashboard" className={btnSecondary}>
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
