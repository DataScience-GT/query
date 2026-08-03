"use client";

import { useEffect, useRef } from "react";

/**
 * Pauses sprite animations inside an element while it is off-screen.
 *
 * A swaying sprite costs compositor work every frame even when nobody can see
 * it, and there are dozens of them down the page. The observer writes the
 * `data-anim` attribute directly rather than going through React state —
 * routing this through a re-render made scrolling markedly more expensive.
 */
export function usePauseOffscreen<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        el.dataset.anim = entry.isIntersecting ? "running" : "paused";
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return ref;
}
