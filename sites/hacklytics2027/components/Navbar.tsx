"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

const navItems = [
  { num: "01", name: "About", href: "/#about" },
  { num: "02", name: "Tracks", href: "/#tracks" },
  { num: "03", name: "Prizes", href: "/#prizes" },
  { num: "04", name: "Schedule", href: "/#schedule" },
  { num: "05", name: "FAQs", href: "/#faqs" },
  { num: "06", name: "Sponsors", href: "/#sponsors" },
];

const APPLY_URL = "https://form.typeform.com/to/GvqBCdAe";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mark the section currently under the navbar. Sections mount lazily, so
  // re-observe whenever the DOM adds one.
  useEffect(() => {
    const seen = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );

    const attach = () => {
      for (const { href } of navItems) {
        const el = document.getElementById(href.replace("/#", ""));
        if (el && !seen.has(el)) {
          seen.add(el);
          observer.observe(el);
        }
      }
    };

    attach();
    const mutations = new MutationObserver(attach);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", open);
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const id = href.replace("/#", "");
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setOpen(false);
    const offset = headerRef.current?.offsetHeight ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <>
      <header
        ref={headerRef}
        className={`fixed inset-x-0 top-0 z-50 bg-paper ${scrolled ? "border-b border-ink" : "border-b border-rule"}`}
        style={{ height: "var(--navbar-height)" }}
      >
        <div className="wrap flex h-full items-stretch justify-between">
          {/* Wordmark */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 pr-6"
          >
            <Image src="/logo.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
            <span className="display text-base leading-none md:text-lg">Hacklytics</span>
            <span className="mono-label hidden text-ink-soft sm:inline">2027</span>
          </Link>

          {/* Desktop index */}
          <nav aria-label="Sections" className="hidden items-stretch md:flex">
            {navItems.map(({ num, name, href }) => {
              const isActive = active === href.replace("/#", "");
              return (
                <a
                  key={name}
                  href={href}
                  onClick={(e) => handleNavClick(e, href)}
                  aria-current={isActive ? "true" : undefined}
                  className={`invert-hover mono-label flex items-center gap-2 border-l border-rule px-4 ${
                    isActive ? "bg-ink text-paper" : "text-ink"
                  }`}
                >
                  <span className={isActive ? "text-gold" : "text-ink-soft"}>{num}</span>
                  {name}
                </a>
              );
            })}
          </nav>

          <div className="flex items-stretch">
            <a
              href={APPLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mono-label hidden items-center bg-ink px-6 text-paper transition-colors duration-150 hover:bg-navy md:flex"
            >
              Apply
            </a>

            {/* Mobile toggle */}
            <button
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((s) => !s)}
              className="mono-label flex items-center border-l border-ink px-5 md:hidden"
            >
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile panel */}
      <div
        className={`fixed inset-0 z-40 flex flex-col bg-paper md:hidden ${open ? "" : "invisible opacity-0"}`}
        style={{ paddingTop: "var(--navbar-height)" }}
        aria-hidden={!open}
        inert={!open}
      >
        <nav className="wrap flex flex-col rule-heavy-t">
          {navItems.map(({ num, name, href }) => (
            <a
              key={name}
              href={href}
              onClick={(e) => handleNavClick(e, href)}
              className="rule-b flex items-baseline gap-5 py-5"
            >
              <span className="mono-label text-ink-soft">{num}</span>
              <span className="display text-4xl">{name}</span>
            </a>
          ))}
        </nav>

        <div className="wrap mt-8">
          <a
            href={APPLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="mono-label flex items-center justify-between bg-ink px-6 py-5 text-paper"
          >
            Apply now <span>→</span>
          </a>
        </div>

        <div className="wrap mono-label mt-auto flex justify-between py-8 text-ink-soft">
          <span>Feb 26–28 2027</span>
          <span>Atlanta, GA</span>
        </div>
      </div>
    </>
  );
}
