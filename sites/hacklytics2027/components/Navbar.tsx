"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

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
          ${scrolled ? "bg-[#020204]/70 backdrop-blur-3xl border-b border-white/5" : "bg-transparent"}
        `}
        style={{ height: "var(--navbar-height)" }}
      >
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between section-wrap px-6">

          {/* Logo + wordmark */}
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-4 group shrink-0">
            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/10 group-hover:border-bloom-cyan/50 transition-colors duration-500">
              <Image src="/logo.png" alt="Hacklytics" fill className="object-contain" />
            </div>
            <span className="font-sans font-medium text-sm tracking-[0.2em] text-white/90 group-hover:text-white transition-colors duration-300 hidden sm:block">
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
                className="relative font-mono text-[10px] text-white/50 hover:text-white uppercase tracking-[0.2em] transition-colors duration-300 group py-2"
              >
                {name}
                {/* Thin underline on hover */}
                <span className="absolute bottom-0 left-0 right-0 h-[1px] bg-white scale-x-0 origin-right group-hover:scale-x-100 group-hover:origin-left transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
              </a>
            ))}
          </nav>

          {/* Desktop CTA */}
          <a
            href="https://form.typeform.com/to/GvqBCdAe"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center justify-center px-6 py-2.5 font-sans font-medium text-xs tracking-widest text-black bg-white rounded-full hover:scale-105 transition-transform duration-500 shrink-0"
          >
            APPLY
          </a>

          {/* Mobile hamburger */}
          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((s) => !s)}
            className="md:hidden w-10 h-10 flex flex-col justify-center items-center gap-[6px] rounded-full border border-white/10 hover:border-white/30 transition-colors duration-300 bg-white/5 backdrop-blur-md"
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
          bg-[#020204]/95 backdrop-blur-3xl
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
              className="font-sans font-medium text-4xl text-white/50 hover:text-white py-4 border-b border-white/5 transition-all duration-500 tracking-tight"
            >
              {name}
            </a>
          ))}
        </nav>
        <div className="px-8 mt-12">
          <a
            href="https://form.typeform.com/to/GvqBCdAe"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center w-full bg-white text-black font-sans font-medium text-sm tracking-widest px-8 py-4 rounded-full hover:scale-[1.02] transition-transform duration-500"
          >
            APPLY NOW
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
