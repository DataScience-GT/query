"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link as ScrollLink } from "react-scroll";
import Link from "next/link";
import logo from "../../assets/images/dsgt/apple-touch-icon.png";

interface NavbarProps {
  screen_width: number;
  page?: string;
  className?: string;
}

export default function Navbar({
  screen_width: _screen_width,
  page,
  className = "",
}: NavbarProps) {
  const [windowWidth, setWindowWidth] = useState(0);
  const WIDTH_THRESHOLD = 1000;
  const [menuOpen, setMenuOpen] = useState(false);
  const navbarHeight = 80;
  const isHomePage = !page || page === "home";

  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (window.innerWidth >= WIDTH_THRESHOLD) setMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
  }, [menuOpen]);

  const homeMenuItems = [
    { name: "About", to: "about", link: false },
    { name: "Bootcamp", to: "bootcamp", link: false },
    { name: "Hacklytics", to: "/hacklytics", link: true },
    { name: "Projects", to: "projects", link: false },
    { name: "Join", to: "getinvolved", link: false },
    { name: "Team", to: "/team", link: true },
    { name: "Events", to: "/events", link: true },
    { name: "History", to: "/history", link: true },
    { name: "Status", to: "/status", link: true },
  ];

  const otherPageMenuItems = [
    { name: "Home", to: "/", link: true },
    { name: "Bootcamp", to: "/bootcamp", link: true },
    { name: "Team", to: "/team", link: true },
    { name: "Projects", to: "/projects", link: true },
    { name: "Events", to: "/events", link: true },
    { name: "History", to: "/history", link: true },
    { name: "Status", to: "/status", link: true },
  ];

  const menuItems = isHomePage ? homeMenuItems : otherPageMenuItems;

  type MenuItem = { name: string; to: string; link: boolean };

  const renderMenuItem = (item: MenuItem, isMobile: boolean = false) => {
    const baseClass = isMobile
      ? "public-ui inline-flex items-center min-h-11 text-2xl font-semibold tracking-tight text-[var(--paper)] hover:text-[var(--buzz)]"
      : "public-ui inline-flex items-center min-h-11 text-[13px] font-medium tracking-tight text-[var(--ink-soft)] hover:text-[var(--ink)]";

    if (item.link) {
      return (
        <Link
          key={item.name}
          href={item.to}
          className={baseClass}
          onClick={() => setMenuOpen(false)}
        >
          {item.name}
        </Link>
      );
    }

    return (
      <ScrollLink
        key={item.name}
        to={item.to}
        spy={true}
        smooth={true}
        offset={-navbarHeight}
        duration={500}
        className={baseClass}
        activeClass="text-[var(--ink)]"
        onClick={() => setMenuOpen(false)}
      >
        {item.name}
      </ScrollLink>
    );
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 w-full h-20 z-130 glass-navbar ${className}`}
      >
        <div className="max-w-7xl mx-auto h-full flex justify-between items-center pl-8 pr-6 lg:px-12">
          <Link
            href="/"
            className="flex items-center gap-3 group"
            onClick={() => setMenuOpen(false)}
          >
            <Image
              src={logo}
              alt="DSGT Logo"
              className="h-8 w-auto"
              width={32}
              height={32}
            />
            <span className="public-ui text-[var(--ink)] text-lg font-bold tracking-tight">
              DSGT
            </span>
          </Link>

          {windowWidth >= WIDTH_THRESHOLD ? (
            <div className="flex items-center gap-6">
              {menuItems.map((item) => renderMenuItem(item))}
              <Link
                href="/login"
                className="public-btn"
                onClick={() => setMenuOpen(false)}
              >
                Portal
              </Link>
            </div>
          ) : (
            <button
              className="relative w-12 h-12 flex flex-col justify-center items-end gap-1.5 z-[140] -mr-2"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle Menu"
            >
              <span
                className={`block h-0.5 bg-[var(--ink)] transition-ui duration-300 ${menuOpen ? "w-8 rotate-45 translate-y-2 bg-[var(--paper)]" : "w-8"}`}
              />
              <span
                className={`block h-0.5 bg-[var(--ink)] transition-ui duration-300 ${menuOpen ? "opacity-0" : "w-5"}`}
              />
              <span
                className={`block h-0.5 bg-[var(--ink)] transition-ui duration-300 ${menuOpen ? "w-8 -rotate-45 -translate-y-2 bg-[var(--paper)]" : "w-8"}`}
              />
            </button>
          )}
        </div>
      </nav>

      <div
        className={`fixed inset-0 glass-dark z-[120] flex flex-col items-center justify-center pt-20 transition-ui duration-500 ease-in-out ${
          menuOpen
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col items-center gap-6 text-center relative z-10">
          {menuItems.map((item) => renderMenuItem(item, true))}
          <Link
            href="/login"
            className="public-btn mt-4"
            onClick={() => setMenuOpen(false)}
          >
            Portal
          </Link>
        </div>
      </div>
    </>
  );
}
