"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import PixelSprite from "./pixel/PixelSprite";
import { SPROUT } from "./pixel/sprites";
import { INTEREST_URL } from "@/lib/links";

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
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => {
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
    e.preventDefault();
    setOpen(false);
    const id = href.replace("/#", "");
    const el = document.getElementById(id);
    if (!el) return;
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
        {/* pr reserves the hanging MLH badge in the hero (owned elsewhere). */}
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between section-wrap px-6 md:pr-28">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 group shrink-0"
          >
            <PixelSprite map={SPROUT} palette="lime" scale={2} />
            <span className="font-sans font-bold text-sm tracking-tight text-white group-hover:text-white/80 transition-colors">
              DS @ GT
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navItems.map(({ name, href }) => (
              <a
                key={name}
                href={href}
                onClick={(e) => handleNavClick(e, href)}
                className="font-sans text-[11px] uppercase tracking-[0.22em] text-white/55 hover:text-white transition-colors py-2"
              >
                {name}
              </a>
            ))}
          </nav>

          <a
            href={INTEREST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="pixel-btn hidden md:inline-flex items-center justify-center px-6 py-2.5 font-sans font-bold text-[11px] uppercase tracking-[0.14em] shrink-0"
          >
            Notify me
          </a>

          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((s) => !s)}
            className="md:hidden w-11 h-11 flex flex-col justify-center items-center gap-[6px] border border-white/15 hover:border-white/40 transition-colors bg-transparent"
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
              className="font-sans font-medium text-3xl text-white/55 hover:text-white py-4 border-b border-white/10 transition-colors tracking-tight"
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
            className="pixel-btn flex items-center justify-center w-full font-sans font-bold text-sm uppercase tracking-[0.14em] px-8 py-4"
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
