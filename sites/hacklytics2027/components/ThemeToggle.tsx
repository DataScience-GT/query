"use client";

import { useSyncExternalStore } from "react";
import { GROUND, THEME_KEY } from "@/lib/theme";

type Theme = "light" | "dark";

// Points the browser bar at the page. It reads the theme-color metas, which
// Next renders one per system scheme: a chosen theme sets both to its ground,
// and no choice leaves each on its own scheme, so the bar follows the device.
const syncBar = () => {
  const set = document.documentElement.dataset.theme;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      const scheme = meta.media.includes("light") ? "light" : "dark";
      meta.content = GROUND[set === "light" || set === "dark" ? set : scheme];
    });
};

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const observer = new MutationObserver(() => {
    syncBar();
    onChange();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  // A client navigation renders the theme-color metas afresh, with their
  // server colours; sync them as they land.
  observer.observe(document.head, { childList: true });
  // Hydration adds back any meta the pre-paint script changed, with its server
  // colour; sync those too.
  syncBar();
  // A choice saved in another tab (key null is storage being cleared there).
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_KEY) return;
    const saved = event.newValue;
    if (saved === "light" || saved === "dark") {
      document.documentElement.dataset.theme = saved;
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  };
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
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
      className={`w-11 h-11 rounded-lg flex items-center justify-center border border-line hover:border-ink-3 text-ink transition-colors bg-transparent shrink-0 ${className}`}
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
        // Moon: a fat crescent, tips to the upper right, so it does not read
        // as the letter C.
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          shapeRendering="crispEdges"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="4" y="0" width="2" height="2" />
          <rect x="2" y="2" width="4" height="2" />
          <rect x="0" y="4" width="6" height="4" />
          <rect x="0" y="8" width="8" height="2" />
          <rect x="0" y="10" width="16" height="2" />
          <rect x="2" y="12" width="12" height="2" />
          <rect x="4" y="14" width="8" height="2" />
        </svg>
      )}
    </button>
  );
}
