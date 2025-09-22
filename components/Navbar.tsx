"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from "next/image";
import { Truculenta } from 'next/font/google';

const truculenta = Truculenta({
  subsets: ['latin'],
  weight: ['800'],
});

const navItems = [
  { name: "Home", href: "/" },
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

  // New effect to handle hide/show on scroll
  useEffect(() => {
    const handleScrollEvent = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 8);

      // Show navbar at the top of the page or when scrolling up
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
    // ... scroll logic remains the same
    e.preventDefault();
    setOpen(false);
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
      // 1. Increased mobile text size
      const className = isMobile 
        ? "block py-2 text-white text-xl font-semibold hover:text-wonka-red"
        // Desktop links get their style from the <nav> tag
        : "hover:text-wonka-red transition-colors";

      if (isScrollLink) {
        return <a key={item.name} href={item.href} onClick={(e) => handleScroll(e, item.href)} className={className}>{item.name}</a>;
      } else {
        return <Link key={item.name} href={item.href} onClick={() => setOpen(false)} className={className}>{item.name}</Link>;
      }
    });
  };

  return (
    // 2. Class updates for hide/show effect
    <header 
      ref={headerRef} 
      className={`fixed top-0 z-40 w-full py-3 md:py-4 transition-transform duration-300 ${navVisible ? 'translate-y-0' : '-translate-y-full'}`}
      // 3. Background is now transparent at the top
      style={{ backgroundColor: scrolled ? 'var(--navbar-bg-scrolled)' : 'transparent', backdropFilter: scrolled ? 'blur(var(--navbar-blur))' : 'none', boxShadow: scrolled ? 'var(--navbar-shadow)' : 'none' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex-shrink-0">
          <Image src="/logo.png" alt="Hacklytics logo" width={48} height={48} />
        </div>
        <div className="hidden md:flex flex-1 justify-center">
          {/* 4. Increased desktop text size */}
          <nav className={`${truculenta.className} flex items-center space-x-10 text-white text-2xl font-semibold uppercase tracking-wider`}>
            {renderNavLinks()}
          </nav>
        </div>
        <div className="w-12 flex-shrink-0 flex justify-end">
          <div className="md:hidden">
            <button aria-label="Toggle menu" onClick={() => setOpen((s) => !s)} className="p-2 rounded-md text-white">
              {/* SVG icon */}
            </button>
          </div>
        </div>
      </div>
      <div className={`${open ? "block" : "hidden"} md:hidden`}>
        <div className="px-4 pt-4 pb-6 space-y-2 text-center">
          {renderNavLinks(true)}
        </div>
      </div>
    </header>
  );
}