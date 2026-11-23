"use client";

import { useEffect } from "react";
import PublicPage from "@/components/PublicPage";
import { ErrorLinks } from "@/components/PublicPage/ErrorLinks";
import { useChunkErrorRecovery } from "@/lib/chunk-error";

/** Error screen for public pages; portal routes have their own in (portal)/error.tsx. */
export default function PublicError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  // A stale chunk after a deploy cannot be fixed by retry(); this reloads.
  const isChunkError = useChunkErrorRecovery(error);

  useEffect(() => {
    console.error("Public page error:", error);
  }, [error]);

  return (
    <PublicPage
      eyebrow={isChunkError ? "Update" : "Error"}
      title={isChunkError ? "A new version is out" : "This page didn't load"}
      lede={
        isChunkError
          ? "The site was updated while this tab was open. Reload to get the new version."
          : "Something broke on our side. Try again, or head somewhere else for now."
      }
      action={
        <div className="flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => (isChunkError ? window.location.reload() : retry())}
            className="text-dsgt-teal min-h-11 cursor-pointer font-mono text-xs tracking-[0.2em] uppercase transition-colors hover:text-white"
          >
            <span className="border-dsgt-teal/30 border-b pb-1">
              {isChunkError ? "Reload page" : "Try again"}
            </span>
          </button>
          {error.digest && (
            <span className="font-mono text-xs text-gray-500">
              Reference {error.digest}
            </span>
          )}
        </div>
      }
    >
      <ErrorLinks />
    </PublicPage>
  );
}
