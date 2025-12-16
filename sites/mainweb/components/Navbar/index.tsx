"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link as ScrollLink } from "react-scroll";
import Link from "next/link";

import logo from "../../assets/images/dsgt/apple-touch-icon.png";
import smallblob from "@/assets/images/blobs/small-header--export.svg";
import Background from "@/components/Background";

interface NavbarProps {
  screen_width: number;
  page?: string;
  className?: string;
}

const Navbar: React.FC<NavbarProps> = ({
  screen_width,
  page,
  className = "",
}) => {
  const [windowWidth, setWindowWidth] = useState(screen_width);
  const WIDTH_THRESHOLD = 1000;
  const [menuOpen, setMenuOpen] = useState(false);
  const navbarHeight = 80;
  const isHomePage = !page || page === "home";

  useEffect(() => setWindowWidth(screen_width), [screen_width]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
  }, [menuOpen]);

  const homeMenuItems = [
    { name: "Home", to: "home", link: false },
    { name: "About", to: "about", link: false },
    { name: "Bootcamp", to: "bootcamp", link: false },
    { name: "Hacklytics", to: "golden-byte", link: false },
    { name: "Projects", to: "projects", link: false },
    { name: "Get Involved", to: "getinvolved", link: false },
    { name: "Sign In", to: "/tbd", link: false },
  ];

  const otherPageMenuItems = [
    { name: "Home", to: "/", link: true },
    { name: "Bootcamp", to: "/bootcamp", link: true },
    { name: "Team", to: "/team", link: true },
    { name: "Projects", to: "/projects", link: true },
    { name: "Sign In", to: "/tbd", link: false },
  ];

  const menuItems = isHomePage ? homeMenuItems : otherPageMenuItems;

  const renderMenuItem = (item: any, mobileWhite: boolean = false) => {
    const baseClass = mobileWhite
      ? "text-white text-lg font-extrabold hover:text-teal-500 transition cursor-pointer"
      : "text-lg font-extrabold text-black hover:text-teal-500 transition cursor-pointer";

    if (item.external) {
      return (
        <a
          key={item.name}
          href={item.to}
          target="_blank"
          rel="noopener noreferrer"
          className={baseClass}
        >
          {item.name}
        </a>
      );
    }

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
        onClick={() => setMenuOpen(false)}
      >
        {item.name}
      </ScrollLink>
    );
  };

  // ---------------- DESKTOP NAV ----------------
  if (windowWidth >= WIDTH_THRESHOLD) {
    return (
      <div className={`relative w-full h-32 z-30 ${className}`}>
        <Background className="absolute inset-0 z-0" />
        <Image
          src={smallblob}
          alt="background blob"
          className="absolute inset-0 w-full h-full object-cover -z-10"
          priority
        />

        <div className="relative z-10 max-w-[1600px] mx-auto h-full flex justify-between items-center px-6">
          <div className="flex items-center gap-4">
            {isHomePage ? (
              <ScrollLink
                to="home"
                smooth={true}
                offset={-navbarHeight}
                duration={500}
                className="cursor-pointer"
              >
                <Image src={logo} alt="DSGT Logo" className="h-16 w-auto" />
              </ScrollLink>
            ) : (
              <Link href="/" className="cursor-pointer">
                <Image src={logo} alt="DSGT Logo" className="h-16 w-auto" />
              </Link>
            )}
            <h1 className="text-2xl font-bold text-black">DSGT</h1>
          </div>

          <div className="flex items-center gap-6">
            {menuItems.map(item => renderMenuItem(item))}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- MOBILE NAV ----------------
  return (
    <div className={`relative w-full h-32 z-30 ${className}`}>
      <Background className="absolute inset-0 z-0" />
      <Image
        src={smallblob}
        alt="background blob"
        className="absolute inset-0 w-full h-full object-cover -z-10"
        priority
      />

      <div className="relative z-10 flex justify-between items-center px-4 h-full">
        <div className="flex items-center gap-2">
          {isHomePage ? (
            <ScrollLink
              to="home"
              smooth={true}
              offset={-navbarHeight}
              duration={500}
              className="cursor-pointer"
            >
              <Image src={logo} alt="DSGT Logo" className="h-16 w-auto" />
            </ScrollLink>
          ) : (
            <Link href="/" className="cursor-pointer">
              <Image src={logo} alt="DSGT Logo" className="h-16 w-auto" />
            </Link>
          )}
          <h1 className="text-2xl font-bold text-white">DSGT</h1>
        </div>

        <button
          className="flex flex-col justify-center items-center w-12 h-12"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span
            className={`block w-6 h-0.5 bg-white mb-1 transition-transform ${
              menuOpen ? "rotate-45 translate-y-1.5" : ""
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-white transition-transform ${
              menuOpen ? "-rotate-45 -translate-y-1.5" : ""
            }`}
          />
        </button>
      </div>

      <div
        className={`fixed top-0 left-0 w-full h-full bg-black/70 backdrop-blur-sm transition-all ${
          menuOpen
            ? "h-screen opacity-100"
            : "h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col justify-start items-center pt-32 gap-8 h-full w-full">
          {menuItems.map(item => renderMenuItem(item, true))}
        </div>
      </div>
    </div>
  );
};

export default Navbar;
