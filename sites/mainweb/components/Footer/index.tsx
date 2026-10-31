// components/Footer/Footer.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/images/dsgt/apple-touch-icon.png";

interface FooterProps {
  screen_width?: number;
  className?: string;
}

const Footer = ({
  screen_width: _screen_width,
  className = "",
}: FooterProps) => {
  return (
    <footer
      className={`relative w-full py-20 bg-[#050505] border-t border-white/5 text-gray-400 font-sans ${className}`}
    >
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-8">
          {/* BRANDING COLUMN */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 group">
              <Image
                src={logo}
                alt="DSGT Logo"
                className="h-8 w-8 rounded shadow-lg shadow-[#00A8A8]/10 transition-transform group-hover:rotate-12"
              />
              <span className="text-white text-xl font-bold tracking-tighter uppercase">
                DSGT
              </span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-[240px]">
              The largest student-run data science organization at Georgia Tech.
            </p>
          </div>

          {/* NAVIGATION COLUMN */}
          <div className="flex flex-col space-y-4">
            <h2 className="text-white font-mono text-[10px] uppercase tracking-[0.3em] font-bold">
              Navigation
            </h2>
            <nav className="flex flex-col space-y-2 text-sm font-medium">
              <Link
                href="/team"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Meet the Team
              </Link>
              <Link
                href="mailto:hello@datasciencegt.org"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Contact
              </Link>
              <Link
                href="/bootcamp"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Bootcamp
              </Link>
              <Link
                href="/events"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Events
              </Link>
              <Link
                href="/history"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                History
              </Link>
              <Link
                href="/status"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Status
              </Link>
            </nav>
          </div>

          {/* SOCIAL COLUMN */}
          <div className="flex flex-col space-y-4">
            <h2 className="text-white font-mono text-[10px] uppercase tracking-[0.3em] font-bold">
              Network
            </h2>
            <nav className="flex flex-col space-y-2 text-sm font-medium">
              <a
                href="https://github.com/DataScience-GT"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Github
              </a>
              <a
                href="https://www.linkedin.com/company/dsgt/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                LinkedIn
              </a>
              <a
                href="https://www.instagram.com/datasciencegt/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Instagram
              </a>
              <a
                href="mailto:hello@datasciencegt.org"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Email List
              </a>
            </nav>
          </div>
        </div>

        {/* BOTTOM COPYRIGHT */}
        <div className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between gap-4">
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">
            {/* oxlint-disable-next-line react/purity */}
            © {new Date().getFullYear()} Data Science at Georgia Tech
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
