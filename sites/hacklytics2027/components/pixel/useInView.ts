"use client";

import { useEffect, useRef } from "react";

/**
 * Watches a flower bed and writes `data-bloom="on"` straight onto it the first
 * time `threshold` of it is in view, without going through React state (a bed
 * blooming costs no re-render). It stays on; the stylesheet grows and opens
 * the flowers from there (see .flower-stem in app/globals.css).
 *
 * Under prefers-reduced-motion the CSS shows every flower open from the first
 * paint, so flipping the attribute changes nothing visible.
 */
export function useBloomInView<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.bloom = "on";
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < threshold) return;
        el.dataset.bloom = "on";
        observer.disconnect();
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}
