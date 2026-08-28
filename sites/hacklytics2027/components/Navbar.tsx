"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import PixelSprite from "./pixel/PixelSprite";
import { SPROUT } from "./pixel/sprites";
import { INTEREST_HINT, INTEREST_URL } from "@/lib/links";

const navItems = [
  { name: "About",    href: "/#about" },
  { name: "Tracks",   href: "/#tracks" },
  { name: "Prizes",   href: "/#prizes" },
  { name: "Schedule", href: "/#schedule" },
  { name: "FAQs",     href: "/#faqs" },
  { name: "Sponsors", href: "/#sponsors" },
];

export default function Navbar() {
  const [open, setOpen]           = useState(false);
  const [visible, setVisible]     = useState(true);
  const [scrolled, setScrolled]   = useState(false);
  const lastY                     = useRef(0);
  const clickScrolling            = useRef(false);
  const scrollTimer               = useRef<NodeJS.Timeout | null>(null);
  const headerRef                 = useRef<HTMLElement>(null);

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
    const onMouseMove = (e: MouseEvent) => { if (e.clientY < 60) setVisible(true); };
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
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
    scrollTimer.current = setTimeout(() => { clickScrolling.current = false; }, 1000);
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
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between section-wrap px-6">

          {/* Logo + wordmark */}
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-4 group shrink-0">
            <div className="pixel-frame pixel-cyan relative w-8 h-8 overflow-hidden bg-white/[0.04]">
              <Image src="/logo.png" alt="Hacklytics" fill className="object-contain p-[3px]" />
            </div>
            <span className="font-pixel text-xs text-white/90 group-hover:text-bloom-cyan transition-colors duration-200 hidden sm:block">
              HACKLYTICS
            </span>
          </Link>

          {/* Desktop links */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map(({ name, href }) => (
              <a
                key={name}
                href={href}
                onClick={(e) => handleNavClick(e, href)}
                className="relative font-pixel text-[10px] text-white/55 hover:text-white transition-colors duration-200 group py-2"
              >
                {name}
                {/* Pixel underline that snaps in, 8-bit style */}
                <span className="absolute -bottom-1 left-0 right-0 h-[3px] bg-bloom-cyan shadow-[0_0_10px_rgba(0,229,255,0.8)] scale-x-0 origin-left group-hover:scale-x-100 transition-transform duration-200 [transition-timing-function:steps(4)]" />
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <a
            href={INTEREST_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Notify me. ${INTEREST_HINT}`}
            className="pixel-btn hidden md:inline-flex items-center justify-center px-6 py-2.5 font-pixel text-[10px] shrink-0"
          >
            NOTIFY ME
          </a>

          {/* Mobile hamburger. 40px square was just under a comfortable tap
              target, and this is the only way to reach the menu on a phone. */}
          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((s) => !s)}
            className="md:hidden w-11 h-11 flex flex-col justify-center items-center gap-[6px] rounded-full border border-white/10 hover:border-white/30 transition-colors duration-300 bg-white/5"
          >
            <span className={`block w-4 h-[1px] bg-white transition-all duration-500 ${open ? "rotate-45 translate-y-[7px]" : ""}`} />
            <span className={`block w-4 h-[1px] bg-white transition-all duration-500 ${open ? "opacity-0 scale-x-0" : ""}`} />
            <span className={`block w-4 h-[1px] bg-white transition-all duration-500 ${open ? "-rotate-45 -translate-y-[7px]" : ""}`} />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
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
              className="flex items-center gap-4 font-sans font-medium text-4xl text-white/50 hover:text-white py-4 border-b border-white/5 transition-colors duration-300 tracking-tight"
            >
              <PixelSprite map={SPROUT} palette="cyan" scale={2} glow />
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
            NOTIFY ME
          </a>
        </div>
        <div className="px-8 mt-auto pb-12">
          <span className="font-mono text-[10px] text-white/20 uppercase tracking-[0.4em]">
            Digital Bloom · 2027
          </span>
        </div>
      </div>
    </>
  );
}
