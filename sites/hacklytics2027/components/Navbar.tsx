"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from 'next/link';
import Image from "next/image";

const navItems = [
  { name: "About", href: "/#about" },
  { name: "FAQs", href: "/#faqs" },
  { name: "Sponsors", href: "/#sponsors" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);
  const headerRef = useRef<HTMLElement>(null);
  
  const isClickScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // Effect to handle showing/hiding the navbar on scroll
  useEffect(() => {
    const handleScrollEvent = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 8);

      const isScrollingDown = currentScrollY > lastScrollY.current;

      if (isScrollingDown && !isClickScrolling.current && currentScrollY > 8) {
        setNavVisible(false);
      } else {
        setNavVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 50) {
        setNavVisible(true);
      }
    };

    window.addEventListener('scroll', handleScrollEvent);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('scroll', handleScrollEvent);
      window.removeEventListener('mousemove', handleMouseMove);
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  // Effect to prevent body scroll when mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [open]);

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setOpen(false);
    const id = href.replace('/#', '');
    const el = document.getElementById(id);

    if (el) {
      isClickScrolling.current = true;
      setNavVisible(true);
      
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }

      const navHeight = headerRef.current ? headerRef.current.offsetHeight : 0;
      const elementPosition = el.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - navHeight;
      
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      history.replaceState(null, '', `#${id}`);

      scrollTimeout.current = setTimeout(() => {
        isClickScrolling.current = false;
      }, 1000);
    }
  };

  const renderNavLinks = (isMobile = false) => {
    return navItems.map((item) => {
      const isScrollLink = item.href.startsWith('/#');
      
      const className = isMobile
        ? "block py-4 border-b border-white/10 hover:text-bloom-cyan hover:bg-white/5 transition-colors w-full text-center"
        : "relative group px-4 py-2 hover:bg-white/5 transition-colors h-full flex items-center border-l border-white/10 last:border-r";

      if (isScrollLink) {
        return (
          <a 
            key={item.name} 
            href={item.href} 
            onClick={(e) => handleScroll(e, item.href)} 
            className={className}
          >
            <span className="relative z-10">{item.name}</span>
            {!isMobile && (
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-bloom-cyan scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100 shadow-[0_0_10px_var(--bloom-cyan)]"></span>
            )}
          </a>
        );
      } else {
        return (
          <Link 
            key={item.name} 
            href={item.href} 
            onClick={() => setOpen(false)} 
            className={className}
          >
            <span className="relative z-10">{item.name}</span>
            {!isMobile && (
              <span className="absolute bottom-0 left-0 w-full h-[2px] bg-bloom-cyan scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100 shadow-[0_0_10px_var(--bloom-cyan)]"></span>
            )}
          </Link>
        );
      }
    });
  };

  return (
    <>
      <header
        ref={headerRef}
        className={`fixed top-4 left-4 right-24 md:right-[150px] z-40 transition-all duration-500 ${navVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'} glass-navbar`}
        style={{ height: 'calc(var(--navbar-height) - 16px)' }}
      >
        <div className="w-full h-full flex items-center justify-between px-6">
          <div className="flex-shrink-0 h-full flex items-center">
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-4 group">
              <div className="relative overflow-hidden rounded-xl p-1 bg-white/5 group-hover:bg-white/10 border border-white/10 group-hover:border-bloom-cyan group-hover:shadow-[0_0_15px_rgba(0,243,255,0.3)] transition-all duration-300">
                <Image src="/logo.png" alt="Hacklytics logo" width={40} height={40} className="drop-shadow-lg transition-transform duration-300 group-hover:scale-110" />
              </div>
              <span className="font-sans font-bold text-xl tracking-tighter hidden sm:block text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 group-hover:from-bloom-cyan group-hover:to-bloom-pink transition-all duration-300">HACKLYTICS</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex h-full items-center font-mono text-sm tracking-widest uppercase text-gray-300">
            {renderNavLinks()}
          </div>

          <div className="flex-shrink-0 flex justify-end md:hidden">
            {/* Mobile Menu Button */}
            <button aria-label="Toggle menu" onClick={() => setOpen((s) => !s)} className="relative z-50 p-2 rounded-xl border border-white/10 bg-white/5 text-white hover:text-bloom-cyan hover:border-bloom-cyan focus:outline-none transition-all duration-300">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} className="text-bloom-pink" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Fullscreen Mobile Navigation Menu */}
        <div
          className={`
            md:hidden fixed inset-0 z-40 flex flex-col pt-[var(--navbar-height)]
            transition-all duration-500 ease-in-out glass-navbar !rounded-none
            ${open ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none -translate-y-4'}
          `}
        >
          <div className="flex-1 overflow-y-auto font-mono text-lg tracking-widest uppercase text-gray-300 flex flex-col mt-4">
            {renderNavLinks(true)}
          </div>
          
          <div className="p-6 border-t border-white/10 text-center bg-black/20">
             <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-pink to-bloom-cyan font-mono text-xs tracking-widest font-bold">DIGITAL BLOOM EDITION</span>
          </div>
        </div>
      </header>
    </>
  );
}
