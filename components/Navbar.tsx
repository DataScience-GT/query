"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from "next/image";
import { Truculenta } from 'next/font/google';

// Font configuration remains the same
const truculenta = Truculenta({
  subsets: ['latin'],
  weight: ['800'], // Corresponds to font-extrabold
});

const navItems = [
  { name: "About", href: "/#about" },
  { name: "Schedule", href: "/#schedule" },
  { name: "Tracks", href: "/#tracks" },
  { name: "Sponsors", href: "/#sponsors" },
  { name: "Prizes", href: "/#prizes" },
  { name: "FAQs", href: "/#faqs" },
  { name: "Speakers", href: "/#speakers" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScrollEvent = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 8);

      if (currentScrollY < lastScrollY.current || currentScrollY <= 8) {
        setNavVisible(true);
      } else {
        setNavVisible(false);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScrollEvent);
    return () => window.removeEventListener('scroll', handleScrollEvent);
  }, []);

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setOpen(false); // Close mobile menu on link click
    const id = href.replace('/#', '');
    const el = document.getElementById(id);
    if (el) {
      const navHeight = headerRef.current ? headerRef.current.offsetHeight : 0;
      const elementPosition = el.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - navHeight;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      history.replaceState(null, '', `#${id}`);
    }
  };

  const renderNavLinks = (isMobile = false) => {
    return navItems.map((item) => {
      const isScrollLink = item.href.startsWith('/#');
      
      // Mobile links are styled in the parent div for font consistency
      // We only define per-link styles here
      const className = isMobile
        ? "block py-3 hover:text-wonka-red transition-colors"
        : "hover:text-wonka-red transition-colors";

      if (isScrollLink) {
        return <a key={item.name} href={item.href} onClick={(e) => handleScroll(e, item.href)} className={className}>{item.name}</a>;
      } else {
        return <Link key={item.name} href={item.href} onClick={() => setOpen(false)} className={className}>{item.name}</Link>;
      }
    });
  };

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 z-40 w-full py-3 md:py-4 transition-all duration-300 ${navVisible ? 'translate-y-0' : '-translate-y-full'}`}
      style={{
        backgroundColor: scrolled ? 'var(--navbar-bg-scrolled)' : 'transparent',
        backdropFilter: scrolled ? 'blur(var(--navbar-blur))' : 'none',
        boxShadow: scrolled ? 'var(--navbar-shadow)' : 'none'
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex-shrink-0">
          <Image src="/logo.png" alt="Hacklytics logo" width={48} height={48} />
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex flex-1 justify-center">
          <nav className={`${truculenta.className} flex items-center space-x-10 text-white text-4xl font-extrabold uppercase leading-none tracking-normal`}>
            {renderNavLinks()}
          </nav>
        </div>

        <div className="w-12 flex-shrink-0 flex justify-end">
          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button aria-label="Toggle menu" onClick={() => setOpen((s) => !s)} className="p-2 rounded-md text-white focus:outline-none">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      <div className={`${open ? "block" : "hidden"} md:hidden`}>
        <div className={`${truculenta.className} px-4 pt-4 pb-6 space-y-2 text-center text-white text-3xl font-extrabold uppercase leading-none tracking-normal`}>
          {renderNavLinks(true)}
        </div>
      </div>
    </header>
  );
}