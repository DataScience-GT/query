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
      className={`relative w-full py-16 bg-[#050505] border-t border-white/10 text-gray-400 ${className}`}
    >
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Image src={logo} alt="DSGT Logo" className="h-8 w-8" />
              <span className="text-white text-xl font-display tracking-tight">
                DSGT
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-[240px] text-gray-500">
              The largest student-run data science organization at Georgia Tech.
            </p>
          </div>

          <div className="flex flex-col space-y-3">
            <h2 className="text-white font-display text-lg">On campus</h2>
            <nav className="flex flex-col space-y-1 text-sm">
              <Link
                href="/team"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                Meet the team
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

          <div className="flex flex-col space-y-3">
            <h2 className="text-white font-display text-lg">Connect</h2>
            <nav className="flex flex-col space-y-1 text-sm">
              <a
                href="https://github.com/DataScience-GT"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[#00A8A8] transition-colors"
              >
                GitHub
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
                Mailing list
              </a>
            </nav>
          </div>

          <div className="flex flex-col space-y-3">
            <h2 className="text-white font-display text-lg">Built here</h2>
            <p className="text-sm leading-relaxed text-gray-500">
              Made by the DSGT tech team.
            </p>
          </div>
        </div>

        <div className="mt-16 pt-6 border-t border-white/10">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} Data Science at Georgia Tech
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
