"use client";

import { useEffect } from "react";

/**
 * Last-resort screen when the root layout itself fails. It replaces the whole
 * document, so it cannot use the site's nav, fonts or Tailwind layer.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#050505",
          color: "#a3a3a3",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "0 16px",
        }}
      >
        <main style={{ maxWidth: 560 }}>
          <p
            style={{
              color: "#00a8a8",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            DS@GT
          </p>
          <h1
            style={{
              color: "#fff",
              fontSize: 44,
              lineHeight: 1,
              margin: "16px 0",
            }}
          >
            The site didn&apos;t load
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6 }}>
            Something broke on our side. Try again in a moment.
          </p>
          <div
            style={{
              display: "flex",
              gap: 24,
              marginTop: 32,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={retry}
              style={{
                background: "#00a8a8",
                color: "#050505",
                border: 0,
                borderRadius: 6,
                padding: "12px 20px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* oxlint-disable-next-line nextjs/no-html-link-for-pages -- the router may be the thing that broke */}
            <a href="/" style={{ color: "#00a8a8" }}>
              Home
            </a>
          </div>
          {error.digest && (
            <p
              style={{
                marginTop: 24,
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
