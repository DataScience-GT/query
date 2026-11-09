/*
 * Flowers that are plain HTML (the track plants, the schedule rail) start
 * dormant and open the first time 35% of their row is in view. This writes
 * data-bloom="on" straight onto the element and stops watching it; the
 * stylesheet does the growing (see .flower-stem in styles/globals.css). The
 * React beds do the same in pixel/useInView.ts.
 *
 * Under prefers-reduced-motion the CSS shows every flower open from the first
 * paint, so flipping the attribute changes nothing visible.
 */
const THRESHOLD = 0.35;
const rows = document.querySelectorAll<HTMLElement>("[data-bloom-watch]");

if (typeof IntersectionObserver === "undefined") {
  rows.forEach((row) => (row.dataset.bloom = "on"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio < THRESHOLD) continue;
        (entry.target as HTMLElement).dataset.bloom = "on";
        observer.unobserve(entry.target);
      }
    },
    { threshold: THRESHOLD },
  );
  rows.forEach((row) => observer.observe(row));
}
