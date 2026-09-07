"use client";

import { useEffect, useState } from "react";

/**
 * Fetch the PDF as a blob and frame that, rather than pointing the iframe at
 * `/api/resume/...` itself. That URL is behind `X-Frame-Options: DENY` from
 * the edge proxy, so Chrome's viewer reports "Failed to load PDF document"
 * even when the bytes are fine.
 */
export function ResumePreview({ src, title }: { src: string; title: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;

    setBlobUrl(null);
    setError(null);

    fetch(src, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Could not load that resume.");
        }
        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("pdf")) {
          throw new Error("Could not load that resume.");
        }
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load that resume.",
        );
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (error) {
    return (
      <p className="px-4 py-8 rounded-sm border border-red-500/20 bg-red-500/10 text-red-400 text-sm text-center">
        {error}
      </p>
    );
  }

  if (!blobUrl) {
    return (
      <div
        className="w-full h-[70vh] min-h-[420px] rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)] animate-pulse"
        aria-hidden
      />
    );
  }

  return (
    <iframe
      src={blobUrl}
      title={title}
      className="w-full h-[70vh] min-h-[420px] rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
    />
  );
}
