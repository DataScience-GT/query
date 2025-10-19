"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation"; // <-- import router

import logo from "../../assets/images/dsgt/apple-touch-icon.png";
import smallblob from "../../assets/images/blobs/small-header--export.svg";

interface NavbarProps {
  screen_width: number;
  page?: string;
}

const Navbar: React.FC<NavbarProps> = ({ screen_width, page }) => {
  const router = useRouter(); // <-- use router
  const [windowWidth, setWindowWidth] = useState(screen_width);
  const WIDTH_THRESHOLD = 1000;
  const [menuOpen, setMenuOpen] = useState(false);
  const navbarHeight = 80; // adjust if your navbar height changes

  useEffect(() => {
    setWindowWidth(screen_width);
  }, [screen_width]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
  }, [menuOpen]);

  const handleSmoothScroll = (href: string) => {
    setMenuOpen(false);

    const scrollToSection = () => {
      if (href.startsWith("/#")) {
        const id = href.replace("/#", "#");
        const element = document.querySelector(id);
        if (element) {
          const offsetTop =
            element.getBoundingClientRect().top + window.scrollY - navbarHeight;
          window.scrollTo({ top: offsetTop, behavior: "smooth" });
        }
      } else if (href === "/") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    if (window.location.pathname !== "/") {
      // Navigate to homepage first, then scroll
      router.push("/", { scroll: false });
      setTimeout(scrollToSection, 100); // small delay to allow page load
    } else {
      scrollToSection();
    }
  };

  const menuItems = [
    { name: "Home", to: "/" },
    { name: "About", to: "/#about" },
    { name: "Bootcamp", to: "/#bootcamp" },
    { name: "Hacklytics", to: "/#hacklytics" },
    { name: "Projects", to: "/#projects" },
    { name: "Get Involved", to: "/#getinvolved" },
    { name: "Sign In", to: "https://member.datasciencegt.org", external: true },
  ];

  if (windowWidth >= WIDTH_THRESHOLD) {
    return (
      <div className="absolute top-0 left-0 w-full h-24 z-30">
        {page !== "home" && (
          <Image
            src={smallblob}
            alt="blob"
            className="absolute top-0 right-0 w-full h-32 -z-10"
          />
        )}
        <div className="max-w-[1600px] mx-auto h-full flex justify-between items-center px-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image
                src={logo}
                alt="DSGT Logo"
                className="h-16 w-auto cursor-pointer"
              />
            </Link>
            <h1
              className={`text-2xl font-bold ${
                page === "home" ? "text-teal-500" : "text-black"
              }`}
            >
              DSGT
            </h1>
          </div>
          <div className="flex items-center gap-6">
            {menuItems.map((item) =>
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
                <button
                  key={item.name}
                  onClick={() => handleSmoothScroll(item.to)}
                  className="text-lg font-extrabold text-black hover:text-teal-500 transition"
                >
                  {item.name}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // Mobile navbar
  return (
    <div className="absolute top-0 left-0 w-full h-20 z-30">
      <div className="flex justify-between items-center px-4 h-full">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Image
              src={logo}
              alt="DSGT Logo"
              className="h-16 w-auto cursor-pointer"
            />
          </Link>
          <h1 className="text-2xl font-bold text-black">DSGT</h1>
        </div>
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

      <div
        className={`fixed top-0 left-0 w-full h-full bg-black/70 backdrop-blur-sm transition-all ${
          menuOpen ? "h-screen opacity-100" : "h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col justify-start items-center pt-24 gap-8 h-full w-full">
          {menuItems.map((item) =>
            item.external ? (
              <a
                key={item.name}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                className="text-2xl font-bold text-teal-500 hover:text-yellow-400 transition"
              >
                {item.name}
              </a>
            ) : (
              <button
                key={item.name}
                onClick={() => handleSmoothScroll(item.to)}
                className="text-2xl font-bold text-teal-500 hover:text-yellow-400 transition"
              >
                {item.name}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;
