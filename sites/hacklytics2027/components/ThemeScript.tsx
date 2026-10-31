"use client";

import { GROUND, THEME_KEY } from "@/lib/theme";

// Runs before first paint so a saved light/dark choice never flashes the other
// theme, and points the theme-color metas at it so the bar matches the page.
// Kept tiny and dependency-free.
const SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=t==="light"?"${GROUND.light}":"${GROUND.dark}"})}}catch(e){}`;

/**
 * The server sends this as a real script. If React ever rebuilds <head> on the
 * client, it could not run the script anyway, and it reports an error for
 * creating one, so there it is an inert data block: the theme is already set.
 */
export default function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? undefined : "application/json"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}
