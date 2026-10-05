"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  btnPrimary,
  page,
  pageDek,
  pageTitle,
  textLink,
} from "@/components/portal/ui";
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
    <main className={page}>
      <h1 className={pageTitle}>
        {isChunkError ? "A new version is available" : "Hackathons didn't load"}
      </h1>
      <p className={pageDek}>
        {isChunkError
          ? "The portal was updated while this tab was open. Reload to pick up the new version."
          : "Something went wrong loading this page. Try again, and if it keeps happening, let an organiser know."}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-6">
        <button
          type="button"
          onClick={() => (isChunkError ? window.location.reload() : reset())}
          className={btnPrimary}
        >
          {isChunkError ? "Reload page" : "Try again"}
        </button>
        <Link href="/dashboard" className={textLink}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
