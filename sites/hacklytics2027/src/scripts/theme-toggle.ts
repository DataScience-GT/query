import { GROUND, THEME_KEY } from "@/lib/theme";

type Theme = "light" | "dark";

const root = document.documentElement;
const buttons = document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]");
const light = window.matchMedia("(prefers-color-scheme: light)");

// An explicit choice wins; otherwise the system setting decides, which is
// what globals.css does with no data-theme attribute.
const current = (): Theme => {
  const set = root.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return light.matches ? "light" : "dark";
};

// Points the browser bar at the page. A chosen theme sets both theme-color
// metas to its ground; no choice leaves each on its own scheme, so the bar
// follows the device.
const syncBar = () => {
  const set = root.dataset.theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes("light") ? "light" : "dark";
    meta.content = GROUND[set === "light" || set === "dark" ? set : scheme];
  });
};

// The icon follows the theme in CSS; the words for assistive tech follow here.
const syncLabels = () => {
  const next: Theme = current() === "dark" ? "light" : "dark";
  buttons.forEach((button) => {
    button.setAttribute("aria-label", next === "light" ? "Switch to light mode" : "Switch to dark mode");
    button.title = next === "light" ? "Light mode" : "Dark mode";
  });
};

const sync = () => {
  syncBar();
  syncLabels();
};

buttons.forEach((button) =>
  button.addEventListener("click", () => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts this page view.
    }
  }),
);

new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
light.addEventListener("change", syncLabels);

// A choice saved in another tab (key null is storage being cleared there).
window.addEventListener("storage", (event) => {
  if (event.key !== null && event.key !== THEME_KEY) return;
  const saved = event.newValue;
  if (saved === "light" || saved === "dark") {
    root.dataset.theme = saved;
  } else {
    root.removeAttribute("data-theme");
  }
});

sync();
