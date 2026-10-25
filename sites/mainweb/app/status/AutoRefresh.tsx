"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 300_000;

/**
 * revalidate = 300 only refreshes the server's saved page. This asks an open
 * tab to fetch it again, every five minutes (one sample bucket) while visible,
 * and on return to the tab if the last refresh was that long ago.
 */
export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let last = Date.now();
    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = setInterval(refresh, REFRESH_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - last >= REFRESH_MS) refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
