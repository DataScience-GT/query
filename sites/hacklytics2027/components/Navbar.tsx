"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import PixelSprite from "./pixel/PixelSprite";
import { SPROUT } from "./pixel/sprites";
import { INTEREST_HINT, INTEREST_URL } from "@/lib/links";

const navItems = [
  { name: "About", href: "/#about" },
  { name: "Tracks", href: "/#tracks" },
  { name: "Prizes", href: "/#prizes" },
  { name: "Schedule", href: "/#schedule" },
  { name: "Sponsors", href: "/#sponsors" },
  { name: "FAQ", href: "/#faqs" },
];

export default function Navbar() {
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
    };
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY < 60) setVisible(true);
    };
    // Opening /#faqs: html is scroll-behavior smooth, so the browser animated
    // down from the top through the whole page, and stalled if anything moved
    // in the meantime. Jump there instead. Then sync the header, since a page
    // opened mid-way fires no scroll event and stayed see-through.
    const initial = requestAnimationFrame(() => {
      const target = window.location.hash
        ? document.getElementById(window.location.hash.slice(1))
        : null;
      target?.scrollIntoView({ behavior: "instant", block: "start" });
      // Not onScroll(): from lastY 0, landing on the section reads as a
      // scroll down and hid the header, which touch users had no way back to
      // short of scrolling up. Record where the page starts; only the
      // background depends on it.
      lastY.current = window.scrollY;
      setScrolled(window.scrollY > 20);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => {
      cancelAnimationFrame(initial);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMouseMove);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", open);
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // Cmd/ctrl-click opens a new tab; that is the browser's to handle.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    setOpen(false);
    const id = href.replace("/#", "");
    const el = document.getElementById(id);
    // Off the home page (the 404), let the link navigate to /#id.
    if (!el) return;
    e.preventDefault();
    clickScrolling.current = true;
    setVisible(true);
    const offset = (headerRef.current?.offsetHeight ?? 0) + 16;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - offset,
      behavior: "smooth",
    });
    history.replaceState(null, "", `#${id}`);
    scrollTimer.current = setTimeout(() => {
      clickScrolling.current = false;
    }, 1000);
  };

  return (
    <>
      <header
        ref={headerRef}
        className={`
          fixed top-0 left-0 right-0 z-50
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}
          ${scrolled ? "bg-[#04040a]/92 border-b border-white/10" : "bg-transparent"}
        `}
        style={{ height: "var(--navbar-height)" }}
      >
        {/* The right padding keeps clear of the MLH badge hanging from the top
            right of the hero (owned elsewhere): 20px + 56px wide on phones,
            48px + up to 90px from md. Not section-wrap: its unlayered padding
            beat these utilities, and the badge sat on the menu toggle. */}
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between pl-6 md:pl-12 xl:pl-20 pr-[5.75rem] md:pr-40">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 group shrink-0"
          >
            <PixelSprite map={SPROUT} palette="lime" scale={2} glow />
            <span className="font-pixel text-xs text-white group-hover:text-bloom-lime transition-colors">
              DS @ GT
            </span>
          </Link>

          {/* Six links, the logo and the button do not fit below 1024px. */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
            {navItems.map(({ name, href }) => (
              <a
                key={name}
                href={href}
                onClick={(e) => handleNavClick(e, href)}
                className="font-sans text-xs uppercase tracking-[0.2em] text-white/70 hover:text-bloom-cyan transition-colors py-2"
              >
                {name}
              </a>
            ))}
          </nav>

          <a
            href={INTEREST_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Notify me. ${INTEREST_HINT}`}
            className="pixel-btn hidden lg:inline-flex items-center justify-center px-6 py-2.5 font-pixel text-[11px] shrink-0"
          >
            Notify me
          </a>

          <button
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((s) => !s)}
            className="lg:hidden w-11 h-11 flex flex-col justify-center items-center gap-[6px] border border-white/15 hover:border-white/40 transition-colors bg-transparent"
          >
            <span
              className={`block w-4 h-[1px] bg-white transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`}
            />
            <span
              className={`block w-4 h-[1px] bg-white transition-all duration-300 ${open ? "opacity-0 scale-x-0" : ""}`}
            />
            <span
              className={`block w-4 h-[1px] bg-white transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`}
            />
          </button>
        </div>
      </header>

      <div
        id="mobile-menu"
        // Hidden only by opacity, so without inert its links stayed in the tab
        // order and the accessibility tree while closed.
        inert={!open}
        className={`
          fixed inset-0 z-40 flex flex-col
          bg-[#04040a]/98
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        style={{ paddingTop: "var(--navbar-height)" }}
      >
        <nav className="flex flex-col px-8 pt-10 gap-0">
          {navItems.map(({ name, href }) => (
            <a
              key={name}
              href={href}
              onClick={(e) => handleNavClick(e, href)}
              className="font-sans font-medium text-3xl text-white/75 hover:text-bloom-cyan py-4 border-b border-white/10 transition-colors tracking-tight"
            >
              {name}
            </a>
          ))}
        </nav>
        <div className="px-8 mt-12">
          <a
            href={INTEREST_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            aria-label={`Notify me. ${INTEREST_HINT}`}
            className="pixel-btn flex items-center justify-center w-full font-pixel text-xs px-8 py-4"
          >
            Notify me
          </a>
        </div>
        <div className="px-8 mt-auto pb-12">
          <span className="font-sans text-[11px] uppercase tracking-[0.28em] text-white/35">
            Digital Bloom · 2027
          </span>
        </div>
      </div>
    </>
  );
}
