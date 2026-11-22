"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useChunkErrorRecovery } from "@/lib/chunk-error";
import {
  body,
  btnPrimary,
  page,
  pageDek,
  pageTitle,
  textLink,
} from "@query/ui/classes";

interface PortalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  hint?: string;
  backHref?: string;
  backLabel?: string;
}

/** The one error screen for portal routes; a route passes copy only when it has something specific to say. */
export function PortalError({
  error,
  reset,
  title = "This page didn't load",
  hint = "Something went wrong. Try again, and if it keeps happening, let an organizer know.",
  backHref = "/dashboard",
  backLabel = "Back to dashboard",
}: PortalErrorProps) {
  // A stale chunk after a deploy cannot be fixed by reset(); this reloads.
  const isChunkError = useChunkErrorRecovery(error);

  useEffect(() => {
    console.error("Portal error:", error);
  }, [error]);

  return (
    <main className={page}>
      <h1 className={pageTitle}>
        {isChunkError ? "A new version is available" : title}
      </h1>
      <p className={pageDek}>
        {isChunkError
          ? "The portal was updated while this tab was open. Reload to pick up the new version. Your data is unaffected."
          : hint}
      </p>

      {!isChunkError && process.env.NODE_ENV !== "production" && (
        <p className="mt-4 max-w-2xl border-l-2 border-[var(--danger)] pl-3 text-[13px] break-words text-[var(--danger)]">
          {error.message || "No error message"}
        </p>
      )}
      {error.digest && (
        <p className={`mt-4 ${body} text-[13px]`}>
          Reference code: <code>{error.digest}</code>
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-6">
        <button
          type="button"
          onClick={() => (isChunkError ? window.location.reload() : reset())}
          className={btnPrimary}
        >
          {isChunkError ? "Reload page" : "Retry"}
        </button>
        <Link href={backHref} className={textLink}>
          {backLabel}
        </Link>
      </div>
    </main>
  );
}
