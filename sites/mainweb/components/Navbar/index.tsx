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

const Navbar: React.FC<NavbarProps> = ({ screen_width, page, className = "" }) => {
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
    // Prevent scrolling when menu is open
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
  }, [menuOpen]);

  const homeMenuItems = [
    { name: "About", to: "about", link: false },
    { name: "Bootcamp", to: "bootcamp", link: false },
    { name: "Hacklytics", to: "golden-byte", link: false },
    { name: "Projects", to: "projects", link: false },
    { name: "Get Involved", to: "getinvolved", link: false },
    { name: "Team", to: "/team", link: true },
  ];

  const otherPageMenuItems = [
    { name: "Home", to: "/", link: true },
    { name: "Bootcamp", to: "/bootcamp", link: true },
    { name: "Team", to: "/team", link: true },
    { name: "Projects", to: "/projects", link: true },
  ];

  const menuItems = isHomePage ? homeMenuItems : otherPageMenuItems;

  const renderMenuItem = (item: any, isMobile: boolean = false) => {
    const baseClass = `text-[11px] font-mono uppercase tracking-[0.2em] transition-all duration-300 cursor-pointer ${
      isMobile
        ? "text-gray-300 hover:text-white text-xl font-bold"
        : "text-gray-400 hover:text-[#00A8A8]"
    }`;

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
        activeClass="text-white lg:text-[#00A8A8]"
        onClick={() => setMenuOpen(false)}
      >
        {item.name}
      </ScrollLink>
    );
  };

  return (
    <>
      <nav className={`fixed top-0 left-0 w-full h-20 z-130 border-b border-white/10 bg-[#080808] md:bg-[#050505]/80 backdrop-blur-xl transition-all ${className}`}>
        <div className="max-w-7xl mx-auto h-full flex justify-between items-center px-6 lg:px-12">

          {/* Logo Section */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 group" onClick={() => setMenuOpen(false)}>
              <Image
                src={logo}
                alt="DSGT Logo"
                className="h-8 w-auto transition-transform duration-500 group-hover:rotate-[360deg]"
                width={32}
                height={32}
              />
              <span className="text-white text-xl font-bold tracking-tighter italic uppercase">DSGT</span>
            </Link>
          </div>

          {/* Desktop Links */}
          {windowWidth >= WIDTH_THRESHOLD ? (
            <div className="flex items-center gap-8">
              {menuItems.map((item) => renderMenuItem(item))}
              <a
                href="/tbd"
                rel="noopener noreferrer"
                className="px-5 py-2 bg-white text-black text-[10px] font-mono font-bold uppercase tracking-widest rounded-sm hover:bg-[#00A8A8] hover:text-white transition-all duration-300"
              >
                Portal
              </a>
            </div>
          ) : (
            <button
              className="relative w-12 h-12 flex flex-col justify-center items-end gap-1.5 z-[140] -mr-2"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle Menu"
            >
              <span className={`block h-0.5 bg-white transition-all duration-300 ${menuOpen ? "w-8 rotate-45 translate-y-2" : "w-8"}`} />
              <span className={`block h-0.5 bg-white transition-all duration-300 ${menuOpen ? "opacity-0" : "w-5"}`} />
              <span className={`block h-0.5 bg-white transition-all duration-300 ${menuOpen ? "w-8 -rotate-45 -translate-y-2" : "w-8"}`} />
            </button>
          )}
        </div>
      </nav>

      <div
        className={`fixed inset-0 bg-[#080808] z-[120] flex flex-col items-center justify-center pt-20 transition-all duration-500 ease-in-out ${
          menuOpen ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        {/* Subtle grid pattern for better aesthetic on the full-screen mobile menu */}
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]"></div>

        <div className="flex flex-col items-center gap-8 text-center relative z-10">
          {menuItems.map((item) => renderMenuItem(item, true))}
          <a
            href="/team"
            rel="noopener noreferrer"
            className="mt-4 px-10 py-4 bg-white text-black text-sm font-mono font-bold uppercase tracking-[0.3em] rounded-sm shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            Portal
          </a>
        </div>
      </div>
    </>
  );
};

export default Navbar;