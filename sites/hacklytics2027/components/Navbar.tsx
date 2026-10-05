"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { INTEREST_URL } from "@/lib/links";
import ThemeToggle from "./ThemeToggle";

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

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    // Cmd/ctrl-click opens a new tab; that is the browser's to handle.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
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
          bg-ground border-b
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${visible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"}
          ${scrolled ? "border-rule" : "border-transparent"}
        `}
        style={{ height: "var(--navbar-height)" }}
      >
        {/* The right padding keeps clear of the MLH badge hanging from the top
            right of the hero (owned elsewhere): 20px + 56px wide on phones,
            48px + up to 90px from md. .wrap sits in the components layer, so
            this right padding wins over its gutter. */}
        <div className="wrap h-full flex items-center justify-between gap-6 pr-[5.75rem] md:pr-40">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="font-display font-bold text-[15px] text-ink shrink-0"
          >
            Hacklytics
          </Link>

          {/* Six links, the logo and the button do not fit below 1024px. */}
          <nav className="hidden lg:flex items-center gap-7">
            {navItems.map(({ name, href }) => (
              <a
                key={name}
                href={href}
                onClick={(e) => handleNavClick(e, href)}
                className="font-sans text-sm text-ink-2 hover:text-ink transition-colors py-2"
              >
                {name}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeToggle />
            <a
              href={INTEREST_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Notify me (opens a sign-up form)"
              className="btn btn-bloom hidden lg:inline-flex px-4 py-2.5 text-sm shrink-0"
            >
              Notify me
            </a>

            <button
              aria-label="Toggle menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((s) => !s)}
              className="lg:hidden w-11 h-11 rounded-full flex flex-col justify-center items-center gap-[6px] border border-rule hover:border-ink-3 transition-colors bg-transparent"
            >
              <span
                className={`block w-4 h-[1px] bg-ink transition-all duration-300 ${open ? "rotate-45 translate-y-[7px]" : ""}`}
              />
              <span
                className={`block w-4 h-[1px] bg-ink transition-all duration-300 ${open ? "opacity-0 scale-x-0" : ""}`}
              />
              <span
                className={`block w-4 h-[1px] bg-ink transition-all duration-300 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`}
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
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        style={{ paddingTop: "var(--navbar-height)" }}
      >
        <nav className="wrap flex flex-col pt-8 gap-0">
          {navItems.map(({ name, href }) => (
            <a
              key={name}
              href={href}
              onClick={(e) => handleNavClick(e, href)}
              className="font-display font-bold text-[1.5rem] leading-none text-ink hover:text-ink-2 py-4 border-b border-rule transition-colors"
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
        <div className="wrap mt-auto pb-12">
          <span className="font-sans text-[13px] text-ink-3">
            Digital Bloom · 2027
          </span>
        </div>
      </div>
    </>
  );
}
