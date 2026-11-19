"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const RETRY_MS = [2_000, 10_000, 30_000];

/**
 * Mounted when the server could not read a signed-in visitor's portal context
 * or registrations, so the sidebar was drawn without them. Asks the server to
 * draw the route again a few times; once a read succeeds the layout stops
 * rendering this and the pending retries are cleared.
 */
export function RetryPortalNav() {
  const router = useRouter();
  useEffect(() => {
    const timers = RETRY_MS.map((ms) => setTimeout(() => router.refresh(), ms));
    return () => timers.forEach(clearTimeout);
  }, [router]);
  return null;
}
