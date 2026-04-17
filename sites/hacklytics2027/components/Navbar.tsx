"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from 'next/link';
import Image from "next/image";
import { Press_Start_2P } from 'next/font/google';

const pixel = Press_Start_2P({
  subsets: ['latin'],
  weight: ['400'],
});

const navItems = [
  { name: "About", href: "/#about" },
  { name: "Schedule", href: "/#schedule" },
  { name: "Tracks", href: "/#tracks" },
  { name: "Prizes", href: "/#prizes" },
  { name: "Speakers", href: "/#prizes" },
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

    window.addEventListener('scroll', handleScrollEvent);
    window.addEventListener('mousemove', (e) => {
      if (e.clientY < 50) {
        setNavVisible(true);
      }
    });
    
    return () => {
      window.removeEventListener('scroll', handleScrollEvent);
      window.removeEventListener('mousemove', (e) => {
        if (e.clientY < 50) {
          setNavVisible(true);
        }
      });
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  // **NEW**: Effect to prevent body scroll when mobile menu is open
  useEffect(() => {
    if (open) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    // Cleanup function to remove the class when the component unmounts
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [open]); // Re-run this effect when the 'open' state changes

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
        ? "block py-3 hover:text-wonka-red transition-colors"
        : "relative group px-2 py-1";

      if (isScrollLink) {
        return (
          <a 
            key={item.name} 
            href={item.href} 
            onClick={(e) => handleScroll(e, item.href)} 
            className={className}
          >
            {item.name}
            {!isMobile && (
              <span className="absolute -bottom-1 left-0 w-0 h-1 bg-wonka-red transition-all duration-300 group-hover:w-full rounded-full"></span>
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
            {item.name}
            {!isMobile && (
              <span className="absolute -bottom-1 left-0 w-0 h-1 bg-wonka-red transition-all duration-300 group-hover:w-full rounded-full"></span>
            )}
          </Link>
        );
      }
    });
  };

  return (
    <> {/* Use a fragment to return multiple top-level elements */}
      <header
        ref={headerRef}
        className={`fixed top-0 z-40 w-full py-3 md:py-4 transition-all duration-300 ${navVisible ? 'translate-y-0' : '-translate-y-full'}`}
        style={{
          backgroundColor: scrolled ? 'var(--navbar-bg)' : 'transparent',
          backdropFilter: scrolled ? `blur(var(--navbar-blur))` : 'none',
          boxShadow: scrolled ? 'var(--navbar-glow)' : 'none',
          borderColor: scrolled ? 'var(--neon-cyan)' : 'transparent',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex-shrink-0">
            <Link href="/" onClick={() => setOpen(false)}>
              <div className="relative">
                <Image src="/logo.png" alt="Hacklytics logo" width={48} height={48} />
                <div className="absolute inset-0 bg-neon-pink/50 rounded blur-sm"></div>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex flex-1 justify-center">
            <nav className={`${pixel.className} flex items-center space-x-8 text-neon-pink text-2xl font-bold uppercase leading-none tracking-wide`}>
              {renderNavLinks()}
            </nav>
          </div>

          <div className="w-12 flex-shrink-0 flex justify-end">
            {/* Mobile Menu Button */}
            <div className="md:hidden">
              {/* **MODIFIED**: Set z-index to 50 to ensure button is above the new fullscreen overlay */}
              <button aria-label="Toggle menu" onClick={() => setOpen((s) => !s)} className="relative z-50 p-2 rounded-md text-neon-cyan focus:outline-none">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {open ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} className="text-neon-pink" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile glow effect */}
        <div className="md:hidden absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-neon-pink/20 to-transparent"></div>
        </div>

        {/* **MODIFIED**: Fullscreen Mobile Navigation Menu */}
        <div
          className={`
            md:hidden fixed inset-0 z-40 flex flex-col items-center justify-center
            transition-opacity duration-300 ease-in-out
            ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
          style={{
            backgroundColor: 'var(--navbar-bg)',
            backdropFilter: 'blur(var(--navbar-blur))'
          }}
        >
          <div className={`${pixel.className} space-y-6 text-center text-neon-pink text-3xl font-bold uppercase leading-none tracking-wide`}>
            {renderNavLinks(true)}
          </div>
        </div>
      </header>
    </>
  );
}
