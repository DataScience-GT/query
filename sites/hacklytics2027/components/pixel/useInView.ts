"use client";

import { useEffect, useRef } from "react";

/**
 * Watches a flower bed and writes two attributes straight onto it, without
 * going through React state (a bed blooming costs no re-render):
 *
 *  - `data-bloom="on"` the first time `threshold` of it is in view. It stays
 *    on; the stylesheet grows and opens the flowers from there (see
 *    .flower-stem in app/globals.css).
 *  - `data-anim="running" | "paused"` whenever it enters or leaves the
 *    viewport, so the breathing neon stops while nobody can see it.
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
        el.dataset.anim = entry.isIntersecting ? "running" : "paused";
        if (entry.intersectionRatio >= threshold) el.dataset.bloom = "on";
      },
      { threshold: [0, threshold] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}
