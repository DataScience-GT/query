const find = <T extends Element>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Navbar markup is missing ${selector}`);
  return el;
};

const header = find<HTMLElement>("[data-nav-header]");
const toggle = find<HTMLButtonElement>("[data-nav-toggle]");
const menu = find<HTMLElement>("[data-nav-menu]");

let lastY = 0;
let clickScrolling = false;
let scrollTimer: ReturnType<typeof setTimeout> | undefined;

const setHidden = (hidden: boolean) => header.toggleAttribute("data-hidden", hidden);
const setScrolled = (scrolled: boolean) => header.toggleAttribute("data-scrolled", scrolled);

const setOpen = (open: boolean) => {
  header.toggleAttribute("data-open", open);
  menu.toggleAttribute("data-open", open);
  menu.inert = !open;
  toggle.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("overflow-hidden", open);
};

toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
find("[data-nav-home]").addEventListener("click", () => setOpen(false));
menu.querySelector("a[target=_blank]")?.addEventListener("click", () => setOpen(false));

window.addEventListener(
  "scroll",
  () => {
    const y = window.scrollY;
    setScrolled(y > 20);
    setHidden(y > lastY && !clickScrolling && y > 80);
    lastY = y;
    // A nav jump's length depends on how far it goes, so it counts as over
    // once the scroll events stop, not after a fixed time: FAQ takes over a
    // second, and the header hid itself the moment a timer ran out mid-way.
    if (clickScrolling) {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        clickScrolling = false;
      }, 150);
    }
  },
  { passive: true },
);

window.addEventListener(
  "mousemove",
  (e) => {
    if (e.clientY < 60) setHidden(false);
  },
  { passive: true },
);

// Every section link on the site, whichever component renders it, scrolls
// without touching the URL. Capture, so it runs before the browser follows the
// link.
document.addEventListener(
  "click",
  (e) => {
    // Cmd/ctrl-click opens a new tab; that is the browser's to handle.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href*='#']") : null;
    if (!link) return;
    setOpen(false);
    // Off the home page (the 404), let the link navigate to /#id.
    const section = link.pathname === window.location.pathname ? document.getElementById(link.hash.slice(1)) : null;
    if (!section) return;
    e.preventDefault();
    clickScrolling = true;
    setHidden(false);
    const offset = header.offsetHeight + 16;
    window.scrollTo({
      top: section.getBoundingClientRect().top + window.scrollY - offset,
      behavior: "smooth",
    });
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      clickScrolling = false;
    }, 1000);
  },
  true,
);

// Arriving at /#faqs, from a shared link or the 404: html is scroll-behavior
// smooth, so the browser animated down from the top through the whole page,
// and stalled if anything moved in the meantime. Jump there instead, then
// drop the hash so the address stays clean. Sync the header too, since a page
// opened mid-way fires no scroll event and stayed see-through.
requestAnimationFrame(() => {
  const { hash } = window.location;
  if (hash) {
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "instant", block: "start" });
    history.replaceState(history.state, "", window.location.pathname);
    setHidden(false);
  }
  // Not the scroll handler: from lastY 0, landing on the section reads as a
  // scroll down and hid the header, which touch users had no way back to
  // short of scrolling up. Record where the page starts; only the
  // background depends on it.
  lastY = window.scrollY;
  setScrolled(window.scrollY > 20);
});
