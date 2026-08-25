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
    // Prevent scrolling when menu is open
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
  }, [menuOpen]);

  /**
   * `link: false` renders a react-scroll ScrollLink, so `to` has to be the id
   * of an element on THIS page. Four entries carried a route path under
   * `link: false`, which sent ScrollLink hunting for an element with id
   * "/events" — it warns to the console and does nothing, so those four were
   * dead clicks on the highest-traffic page in the site. Anything starting with
   * a slash is a destination, not an anchor.
   */
  const homeMenuItems = [
    { name: "About", to: "about", link: false },
    { name: "Bootcamp", to: "bootcamp", link: false },
    // The public announcement page, not /hackathons — that one is the
    // signed-in participant's list and answers a stranger with a login screen.
    { name: "Hacklytics", to: "/hacklytics", link: true },
    { name: "Projects", to: "projects", link: false },
    { name: "Get Involved", to: "getinvolved", link: false },
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
    /**
     * `min-h-11` is the tap target, not a visual change.
     *
     * These render 15px tall on a phone — below even WCAG 2.2 AA's 24px
     * minimum, let alone the ~44px a fingertip needs. Growing the box rather
     * than the type keeps the design identical and makes the link hittable;
     * `inline-flex items-center` keeps the label centred in the taller box.
     */
    const baseClass = `inline-flex items-center min-h-11 transition-ui duration-300 cursor-pointer ${
      isMobile
        ? "text-gray-200 text-2xl"
        : "text-[0.95rem] text-gray-400 hover:text-[#00A8A8]"
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
        activeClass="text-[#00A8A8]"
        onClick={() => setMenuOpen(false)}
      >
        {item.name}
      </ScrollLink>
    );
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 w-full h-20 z-130 site-nav transition-ui ${className}`}
      >
        <div className="max-w-7xl mx-auto h-full flex justify-between items-center px-6 lg:px-12">
          <div className="flex items-center gap-3">
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
              <span className="text-white text-xl font-display tracking-tight">
                DSGT
              </span>
            </Link>
          </div>

          {windowWidth >= WIDTH_THRESHOLD ? (
            <div className="flex items-center gap-7">
              {menuItems.map((item) => renderMenuItem(item))}
              <Link
                href="/login"
                rel="noopener noreferrer"
                className="btn-solid text-sm"
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
              aria-expanded={menuOpen}
            >
              <span
                className={`block h-0.5 bg-white transition-ui duration-300 ${menuOpen ? "w-8 rotate-45 translate-y-2" : "w-8"}`}
              />
              <span
                className={`block h-0.5 bg-white transition-ui duration-300 ${menuOpen ? "opacity-0" : "w-5"}`}
              />
              <span
                className={`block h-0.5 bg-white transition-ui duration-300 ${menuOpen ? "w-8 -rotate-45 -translate-y-2" : "w-8"}`}
              />
            </button>
          )}
        </div>
      </nav>

      <div
        className={`fixed inset-0 bg-[#050505] z-[120] flex flex-col items-center justify-center pt-20 transition-ui duration-500 ease-in-out ${
          menuOpen
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col items-center gap-6 text-center relative z-10">
          {menuItems.map((item) => renderMenuItem(item, true))}
          <Link
            href="/login"
            rel="noopener noreferrer"
            className="mt-4 btn-solid"
            onClick={() => setMenuOpen(false)}
          >
            Portal
          </Link>
        </div>
      </div>
    </>
  );
}
