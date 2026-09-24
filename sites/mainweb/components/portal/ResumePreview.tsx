"use client";

import { useEffect, useState } from "react";
import { looksLikePdf } from "@/lib/resume-file";

/**
 * Fetch the PDF as a blob and frame that, rather than pointing the iframe at
 * `/api/resume/...` itself. That URL is behind `X-Frame-Options: DENY` from
 * the edge proxy, so Chrome's viewer reports "Failed to load PDF document"
 * even when the bytes are fine.
 */
export function ResumePreview({ src, title }: { src: string; title: string }) {
  // Keyed by src, so a new src starts from the loading state instead of
  // briefly showing the previous resume or its error.
  const [loaded, setLoaded] = useState<{
    src: string;
    blobUrl: string | null;
    error: string | null;
  }>({ src, blobUrl: null, error: null });
  const blobUrl = loaded.src === src ? loaded.blobUrl : null;
  const error = loaded.src === src ? loaded.error : null;

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;

    fetch(src, { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Could not load that resume.");
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!looksLikePdf(bytes)) {
          throw new Error("Could not load that resume.");
        }
        // Force the PDF MIME. `res.blob()` keeps whatever Content-Type the
        // proxy sent, and Chrome's viewer refuses anything else.
        return new Blob([bytes], { type: "application/pdf" });
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ src, blobUrl: objectUrl, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoaded({
          src,
          blobUrl: null,
          error:
            err instanceof Error ? err.message : "Could not load that resume.",
        });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (error) {
    return (
      <p className="px-4 py-8 rounded-sm border border-red-500/20 bg-red-500/10 text-red-400 text-sm text-center">
        {error}{" "}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-red-300"
        >
          Open in a new tab
        </a>
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
