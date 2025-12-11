"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link as ScrollLink } from "react-scroll";

import logo from "../../assets/images/dsgt/apple-touch-icon.png";
import smallblob from "@/assets/images/blobs/small-header--export.svg";
import Background from "@/components/Background";

interface NavbarProps {
  screen_width: number;
  page?: string;
}

const Navbar: React.FC<NavbarProps> = ({ screen_width, page }) => {
  const [windowWidth, setWindowWidth] = useState(screen_width);
  const WIDTH_THRESHOLD = 1000;
  const [menuOpen, setMenuOpen] = useState(false);
  const navbarHeight = 80;

  useEffect(() => setWindowWidth(screen_width), [screen_width]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
  }, [menuOpen]);

  const menuItems = [
    { name: "Home", to: "home" },
    { name: "About", to: "about" },
    { name: "Bootcamp", to: "bootcamp" },
    { name: "Hacklytics", to: "hacklytics" },
    { name: "Projects", to: "projects" },
    { name: "Get Involved", to: "getinvolved" },
    { name: "Sign In", to: "https://member.datasciencegt.org", external: true },
  ];

  const renderMenuItem = (item: typeof menuItems[0]) =>
    item.external ? (
      <a
        key={item.name}
        href={item.to}
        target="_blank"
        rel="noopener noreferrer"
        className="text-lg font-extrabold text-black hover:text-teal-500 transition"
      >
        {item.name}
      </a>
    ) : (
      <ScrollLink
        key={item.name}
        to={item.to}
        spy={true}
        smooth={true}
        offset={-navbarHeight}
        duration={500}
        className="cursor-pointer text-lg font-extrabold text-black hover:text-teal-500 transition"
        onClick={() => setMenuOpen(false)}
      >
        {item.name}
      </ScrollLink>
    );

  // Desktop Navbar
  if (windowWidth >= WIDTH_THRESHOLD) {
    return (
      <div className="relative w-full h-32 z-30">
        {/* Background layer */}
        <Background className="absolute inset-0 z-0" />
        <Image
          src={smallblob}
          alt="background blob"
          className="absolute inset-0 w-full h-full object-cover -z-10"
          priority
        />

        {/* Navbar content */}
        <div className="relative z-10 max-w-[1600px] mx-auto h-full flex justify-between items-center px-6">
          <div className="flex items-center gap-4">
            <ScrollLink
              to="home"
              smooth={true}
              offset={-navbarHeight}
              duration={500}
              className="cursor-pointer"
            >
              <Image src={logo} alt="DSGT Logo" className="h-16 w-auto" />
            </ScrollLink>
            <h1 className={`text-2xl font-bold text-black"`}>
              DSGT
            </h1>
          </div>
          <div className="flex items-center gap-6">{menuItems.map(renderMenuItem)}</div>
        </div>
      </div>
    );
  }

  // Mobile Navbar
  return (
    <div className="relative w-full h-32 z-30">
      {/* Background layer */}
      <Background className="absolute inset-0 z-0" />
      <Image
        src={smallblob}
        alt="background blob"
        className="absolute inset-0 w-full h-full object-cover -z-10"
        priority
      />

      {/* Navbar content */}
      <div className="relative z-10 flex justify-between items-center px-4 h-full">
        <div className="flex items-center gap-2">
          <ScrollLink
            to="home"
            smooth={true}
            offset={-navbarHeight}
            duration={500}
            className="cursor-pointer"
          >
            <Image src={logo} alt="DSGT Logo" className="h-16 w-auto" />
          </ScrollLink>
          <h1 className="text-2xl font-bold text-black">DSGT</h1>
        </div>

        {/* Hamburger Button */}
        <button
          className="flex flex-col justify-center items-center w-12 h-12"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span
            className={`block w-6 h-0.5 bg-gray-700 mb-1 transition-transform ${
              menuOpen ? "rotate-45 translate-y-1.5" : ""
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-gray-700 transition-transform ${
              menuOpen ? "-rotate-45 -translate-y-1.5" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`fixed top-0 left-0 w-full h-full bg-black/70 backdrop-blur-sm transition-all ${
          menuOpen ? "h-screen opacity-100" : "h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col justify-start items-center pt-32 gap-8 h-full w-full">
          {menuItems.map(renderMenuItem)}
        </div>
      </div>
    </div>
  );
};

export default Navbar;
