"use client";

import React, { useRef, useState, useEffect, ReactNode } from "react";

/**
 * LazySection — Uses IntersectionObserver to defer rendering of
 * off-screen sections until they're about to enter the viewport.
 * 
 * This prevents the browser from having to parse, layout, and paint
 * all below-fold sections on initial page load.
 * 
 * Once a section becomes visible, it stays rendered (no unloading).
 */
export default function LazySection({
  children,
  rootMargin = "200px",
  minHeight = "400px",
  className = "",
}: {
  children: ReactNode;
  /** How far before the viewport to start loading. Default 200px. */
  rootMargin?: string;
  /** Placeholder height before content loads. */
  minHeight?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If IntersectionObserver isn't available, render immediately
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Once visible, never unload
        }
      },
      {
        rootMargin, // Start loading before it enters viewport
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        // content-visibility: auto tells the browser to skip layout/paint
        // for off-screen content, massive perf win for long pages
        contentVisibility: isVisible ? "visible" : "auto",
        containIntrinsicSize: isVisible ? "auto" : `auto ${minHeight}`,
      }}
    >
      {isVisible ? children : (
        <div 
          style={{ minHeight }} 
          aria-hidden="true"
          className="flex items-center justify-center"
        >
          {/* Subtle loading shimmer */}
          <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-bloom-cyan/50 animate-spin" />
        </div>
      )}
    </div>
  );
}
