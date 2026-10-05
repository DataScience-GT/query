"use client";

import { useSyncExternalStore } from "react";

/** localStorage key; also read by the pre-paint script in app/layout.tsx. */
export const THEME_KEY = "hl-theme";

type Theme = "light" | "dark";

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
};

// An explicit choice wins; otherwise the system setting decides, which is
// what globals.css does with no data-theme attribute.
const current = (): Theme => {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
};

/**
 * Night / day switch. The greenhouse at night stays the default look for
 * anyone whose system is dark; this lets either side pick the other.
 */
export default function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  // Server render has no theme; the button is drawn as "dark" until hydrated,
  // which only affects the icon, never the page colours (set pre-paint).
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "dark");
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Private mode or blocked storage: the choice lasts this page view.
        }
      }}
      aria-label={
        next === "light" ? "Switch to light mode" : "Switch to dark mode"
      }
      title={next === "light" ? "Light mode" : "Dark mode"}
      className={`w-11 h-11 rounded-full flex items-center justify-center border border-rule hover:border-ink-3 text-ink transition-colors bg-transparent shrink-0 ${className}`}
    >
      {theme === "dark" ? (
        // Sun, drawn on the pixel grid like the rest of the site.
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          shapeRendering="crispEdges"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="6" y="5" width="4" height="6" />
          <rect x="5" y="6" width="6" height="4" />
          <rect x="7" y="1" width="2" height="2" />
          <rect x="7" y="13" width="2" height="2" />
          <rect x="1" y="7" width="2" height="2" />
          <rect x="13" y="7" width="2" height="2" />
          <rect x="3" y="3" width="2" height="2" />
          <rect x="11" y="3" width="2" height="2" />
          <rect x="3" y="11" width="2" height="2" />
          <rect x="11" y="11" width="2" height="2" />
        </svg>
      ) : (
        // Moon.
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          shapeRendering="crispEdges"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="6" y="2" width="5" height="2" />
          <rect x="4" y="4" width="4" height="2" />
          <rect x="3" y="6" width="4" height="4" />
          <rect x="4" y="10" width="4" height="2" />
          <rect x="6" y="12" width="5" height="2" />
          <rect x="10" y="10" width="3" height="2" />
          <rect x="11" y="4" width="2" height="2" />
        </svg>
      )}
    </button>
  );
}
