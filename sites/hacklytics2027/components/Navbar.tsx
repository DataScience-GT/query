"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { INTEREST_URL } from "@/lib/links";
import { bloomSet, plantBed, withBlooms } from "./pixel/beds";
import { PixelBed } from "./pixel/PixelBed";
import { useInBloom } from "./pixel/season";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { name: "About", href: "/#about" },
  { name: "Tracks", href: "/#tracks" },
  { name: "Prizes", href: "/#prizes" },
  { name: "Schedule", href: "/#schedule" },
  { name: "Sponsors", href: "/#sponsors" },
  { name: "FAQ", href: "/#faqs" },
];

const MENU_BED = plantBed(2);

export default function Navbar() {
  const inBloom = useInBloom();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const lastY = useRef(0);
  const clickScrolling = useRef(false);
  const scrollTimer = useRef<NodeJS.Timeout | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      if (y > lastY.current && !clickScrolling.current && y > 80) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      lastY.current = y;
      // A nav jump's length depends on how far it goes, so it counts as over
      // once the scroll events stop, not after a fixed time: FAQ takes over a
      // second, and the header hid itself the moment a timer ran out mid-way.
      if (clickScrolling.current) {
        if (scrollTimer.current) clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => {
          clickScrolling.current = false;
        }, 150);
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY < 60) setVisible(true);
    };
    // Every section link on the site, whichever component renders it, scrolls
    // without touching the URL. Capture, so it runs before next/link's handler,
    // which stands down once the default is prevented.
    const onSectionLink = (e: MouseEvent) => {
      // Cmd/ctrl-click opens a new tab; that is the browser's to handle.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      const link =
        e.target instanceof Element
          ? e.target.closest<HTMLAnchorElement>("a[href*='#']")
          : null;
      if (!link) return;
      setOpen(false);
      // Off the home page (the 404), let the link navigate to /#id.
      const section =
        link.pathname === window.location.pathname
          ? document.getElementById(link.hash.slice(1))
          : null;
      if (!section) return;
      e.preventDefault();
      clickScrolling.current = true;
      setVisible(true);
      const offset = (headerRef.current?.offsetHeight ?? 0) + 16;
      window.scrollTo({
        top: section.getBoundingClientRect().top + window.scrollY - offset,
        behavior: "smooth",
      });
      scrollTimer.current = setTimeout(() => {
        clickScrolling.current = false;
      }, 1000);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("click", onSectionLink, true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("click", onSectionLink, true);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  // Arriving at /#faqs, from a shared link or the 404: html is scroll-behavior
  // smooth, so the browser animated down from the top through the whole page,
  // and stalled if anything moved in the meantime. Jump there instead, then
  // drop the hash so the address stays clean. Sync the header too, since a page
  // opened mid-way fires no scroll event and stayed see-through.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const { hash } = window.location;
      if (hash) {
        document
          .getElementById(hash.slice(1))
          ?.scrollIntoView({ behavior: "instant", block: "start" });
        history.replaceState(history.state, "", pathname);
        setVisible(true);
      }
      // Not onScroll(): from lastY 0, landing on the section reads as a
      // scroll down and hid the header, which touch users had no way back to
      // short of scrolling up. Record where the page starts; only the
      // background depends on it.
      lastY.current = window.scrollY;
      setScrolled(window.scrollY > 20);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", open);
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  return (
    <>
      <header
        ref={headerRef}
        className={`
          fixed top-0 left-0 right-0 z-50
          bg-ground border-b
          transition-[translate,opacity,border-color] duration-300 ease-(--ease)
          ${visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}
          ${scrolled ? "border-rule" : "border-transparent"}
        `}
        style={{ height: "var(--navbar-height)" }}
      >
        {/* The right padding keeps clear of the MLH badge hanging from the top
            right of the hero (owned elsewhere): 20px + 56px wide on phones,
            48px + up to 90px from md. .wrap sits in the components layer, so
            this right padding wins over its gutter. What is left on a phone
            holds the logo, Notify me and the menu button, so the theme switch
            lives in the menu until sm. */}
        <div className="wrap h-full flex items-center justify-between gap-2 sm:gap-6 pr-[5.75rem] md:pr-40">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="font-display text-[16px] text-ink shrink-0 inline-flex h-11 items-center"
          >
            Hacklytics
          </Link>

          {/* Six links, the logo and the button do not fit below 1024px. */}
          {/* Centred on the page from xl, under nothing but the hero title's
              own centre line. There is no room for that at lg. */}
          <nav className="hidden lg:flex items-center gap-3 xl:absolute xl:left-1/2 xl:-translate-x-1/2">
            {navItems.map(({ name, href }) => (
              <a
                key={name}
                href={href}
                className="font-sans text-[15px] text-ink-2 hover:text-ink transition-colors py-3 px-2 min-w-11 text-center"
              >
                {name}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            {/* Compact on phones, where it used to hide in the menu. Below
                356px there is no room beside the logo; the menu has it. */}
            <a
              href={INTEREST_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Notify me (opens a sign-up form)"
              className={`btn btn-bloom h-11 px-2.5 text-[12px] max-[356px]:hidden sm:px-4 sm:text-[15px] shrink-0 ${open ? "invisible" : ""}`}
            >
              Notify me
            </a>

            <button
              aria-label="Toggle menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((s) => !s)}
              className="lg:hidden w-11 h-11 rounded-lg flex flex-col justify-center items-center gap-[5px] border border-line hover:border-ink-3 transition-colors bg-transparent"
            >
              <span
                className={`block w-[18px] h-[2px] bg-ink transition-[translate,rotate,scale,opacity] duration-200 ease-(--ease) ${open ? "rotate-45 translate-y-[7px]" : ""}`}
              />
              <span
                className={`block w-[18px] h-[2px] bg-ink transition-[translate,rotate,scale,opacity] duration-200 ease-(--ease) ${open ? "opacity-0 scale-x-0" : ""}`}
              />
              <span
                className={`block w-[18px] h-[2px] bg-ink transition-[translate,rotate,scale,opacity] duration-200 ease-(--ease) ${open ? "-rotate-45 -translate-y-[7px]" : ""}`}
              />
            </button>
          </div>
        </div>
      </header>

      <div
        id="mobile-menu"
        // Hidden only by opacity, so without inert its links stayed in the tab
        // order and the accessibility tree while closed.
        inert={!open}
        className={`
          fixed inset-0 z-40 flex flex-col
          bg-ground
          transition-[opacity,visibility] duration-200 ease-(--ease)
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none invisible"}
        `}
        style={{ paddingTop: "var(--navbar-height)" }}
      >
        <nav className="wrap flex flex-col pt-8 gap-0">
          {navItems.map(({ name, href }) => (
            <a
              key={name}
              href={href}
              className="font-display text-[1.5rem] leading-none text-ink hover:text-ink-2 py-4 border-b border-rule transition-colors"
            >
              {name}
            </a>
          ))}
        </nav>
        <div className="wrap mt-10">
          <a
            href={INTEREST_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            aria-label="Notify me (opens a sign-up form)"
            className="btn btn-bloom w-full"
          >
            Notify me
          </a>
        </div>
        <div className="mt-auto">
          {/* Fills the space under the button on a tall phone. On a short one
              there is none, and the theme switch below has to stay on screen. */}
          <div className="[@media(max-height:760px)]:hidden">
            <PixelBed plants={withBlooms(MENU_BED, bloomSet(inBloom))} soil />
          </div>
          <div className="wrap pt-4 pb-12 flex items-center justify-between gap-4">
            <span className="font-sans text-[13px] text-ink-3">
              Digital Bloom · 2027
            </span>
            <div className="sm:hidden">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
