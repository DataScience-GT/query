"use client";

import { useRouter } from "next/navigation";
import { btnSecondary } from "@query/ui/classes";

/** Asks the server for the page again after the edition failed to load. */
export function RetryButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className={`mt-4 ${btnSecondary}`}
    >
      Try again
    </button>
  );
}
