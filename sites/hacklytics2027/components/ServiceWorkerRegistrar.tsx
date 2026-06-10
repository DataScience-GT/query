"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds.
 * Renders nothing — drop this component anywhere in the tree
 * (e.g. inside RootLayout) to enable offline caching.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => {})
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("[SW] Service worker registration failed:", error);
      });
  }, []);

  return null;
}
