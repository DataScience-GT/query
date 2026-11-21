"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import logo from "../../assets/images/dsgt/apple-touch-icon.png";

interface NavbarProps {
  className?: string;
}

/** One menu for every public page; the current section is highlighted. */
const MENU_ITEMS = [
  { name: "Bootcamp", to: "/bootcamp" },
  { name: "Projects", to: "/projects" },
  { name: "Events", to: "/events" },
  // The public announcement page, not /hackathons — that one is the
  // signed-in participant's list and answers a stranger with a login screen.
  { name: "Hacklytics", to: "/hacklytics" },
  { name: "Team", to: "/team" },
  { name: "History", to: "/history" },
  { name: "Status", to: "/status" },
];

export default function Navbar({ className = "" }: NavbarProps) {
  const WIDTH_THRESHOLD = 1000;
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= WIDTH_THRESHOLD) setMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // Prevent scrolling when menu is open
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
  }, [menuOpen]);

  type MenuItem = (typeof MENU_ITEMS)[number];

  const renderMenuItem = (item: MenuItem, isMobile: boolean = false) => {
    const current = pathname === item.to || pathname.startsWith(`${item.to}/`);
    /**
     * `min-h-11` is the tap target, not a visual change.
     *
     * These render 15px tall on a phone — below even WCAG 2.2 AA's 24px
     * minimum, let alone the ~44px a fingertip needs. Growing the box rather
     * than the type keeps the design identical and makes the link hittable;
     * `inline-flex items-center` keeps the label centred in the taller box.
     */
    const baseClass = `inline-flex items-center min-h-11 font-mono uppercase whitespace-nowrap transition-ui duration-300 cursor-pointer ${
      isMobile
        ? `tracking-[0.2em] text-xl font-bold ${current ? "text-dsgt-teal" : "text-gray-300 hover:text-white"}`
        : `text-[11px] tracking-[0.14em] min-[1200px]:tracking-[0.2em] ${current ? "text-white" : "text-gray-400 hover:text-dsgt-teal"}`
    }`;

    return (
      <Link
        key={item.name}
        href={item.to}
        className={baseClass}
        aria-current={current ? "page" : undefined}
        onClick={() => setMenuOpen(false)}
      >
        {item.name}
      </Link>
    );
  };

  return (
    <>
      <nav
        className={`glass-navbar transition-ui fixed top-0 left-0 z-130 h-20 w-full ${className}`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-12">
          {/* Logo Section */}
          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/"
              className="group flex items-center gap-3"
              onClick={() => setMenuOpen(false)}
            >
              <Image
                src={logo}
                alt="DSGT Logo"
                className="h-8 w-auto transition-transform duration-500 group-hover:rotate-[360deg]"
                width={32}
                height={32}
              />
              <span className="text-xl font-bold tracking-tighter text-white uppercase">
                DSGT
              </span>
            </Link>
          </div>

          {/* Desktop Links */}
          <div className="ml-6 hidden items-center gap-4 min-[1000px]:flex min-[1200px]:gap-8">
            {MENU_ITEMS.map((item) => renderMenuItem(item))}
            <Link
              href="/login"
              rel="noopener noreferrer"
              className="hover:bg-dsgt-teal transition-ui rounded-sm bg-white px-5 py-2 font-mono text-[10px] font-bold tracking-widest text-black uppercase duration-300 hover:text-white"
              onClick={() => setMenuOpen(false)}
            >
              Portal
            </Link>
          </div>
          <button
            className="relative z-[140] -mr-2 flex h-12 w-12 flex-col items-end justify-center gap-1.5 min-[1000px]:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle Menu"
          >
            <span
              className={`transition-ui block h-0.5 bg-white duration-300 ${menuOpen ? "w-8 translate-y-2 rotate-45" : "w-8"}`}
            />
            <span
              className={`transition-ui block h-0.5 bg-white duration-300 ${menuOpen ? "opacity-0" : "w-5"}`}
            />
            <span
              className={`transition-ui block h-0.5 bg-white duration-300 ${menuOpen ? "w-8 -translate-y-2 -rotate-45" : "w-8"}`}
            />
          </button>
        </div>
      </nav>

      <div
        className={`transition-ui fixed inset-0 z-[120] flex flex-col items-center justify-center bg-[#050505] pt-20 duration-500 ease-in-out ${
          menuOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-full opacity-0"
        }`}
      >
        {/* Subtle grid pattern for better aesthetic on the full-screen mobile menu */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)] [background-size:20px_20px] opacity-10"></div>

        <div className="relative z-10 flex flex-col items-center gap-8 text-center">
          {MENU_ITEMS.map((item) => renderMenuItem(item, true))}
          <Link
            href="/login"
            rel="noopener noreferrer"
            className="mt-4 rounded-sm bg-white px-10 py-4 font-mono text-sm font-bold tracking-[0.3em] text-black uppercase shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            onClick={() => setMenuOpen(false)}
          >
            Portal
          </Link>
        </div>
      </div>
    </>
  );
}
