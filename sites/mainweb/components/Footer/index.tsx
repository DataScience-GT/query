"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/images/dsgt/apple-touch-icon.png";

interface FooterProps {
  screen_width?: number;
  className?: string;
}

const Footer = ({ className = "" }: FooterProps) => {
  return (
    <footer
      className={`relative w-full py-20 bg-[var(--navy-deep)] text-[var(--paper)] ${className}`}
    >
      <div className="relative z-10 max-w-7xl mx-auto pl-8 pr-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Image
                src={logo}
                alt="DSGT Logo"
                className="h-8 w-8 rounded-sm"
              />
              <span className="public-ui text-[var(--paper)] text-xl font-bold tracking-tight">
                DSGT
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-[240px] text-[color-mix(in_srgb,var(--paper)_78%,transparent)]">
              The largest student-run data science organization at Georgia Tech.
            </p>
          </div>

          <div className="flex flex-col space-y-4">
            <h2 className="public-kicker text-[color-mix(in_srgb,var(--paper)_70%,transparent)]">
              In the club
            </h2>
            <nav className="flex flex-col space-y-2 text-sm">
              <Link
                href="/team"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                Meet the team
              </Link>
              <Link
                href="/bootcamp"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                Bootcamp
              </Link>
              <Link
                href="/events"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                Events
              </Link>
              <Link
                href="/history"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                History
              </Link>
              <Link
                href="/status"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                Status
              </Link>
              <a
                href="mailto:hello@datasciencegt.org"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                Contact
              </a>
            </nav>
          </div>

          <div className="flex flex-col space-y-4">
            <h2 className="public-kicker text-[color-mix(in_srgb,var(--paper)_70%,transparent)]">
              Around campus
            </h2>
            <nav className="flex flex-col space-y-2 text-sm">
              <a
                href="https://github.com/DataScience-GT"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                GitHub
              </a>
              <a
                href="https://www.linkedin.com/company/dsgt/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                LinkedIn
              </a>
              <a
                href="https://www.instagram.com/datasciencegt/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                Instagram
              </a>
              <a
                href="mailto:hello@datasciencegt.org"
                className="inline-flex items-center min-h-11 md:min-h-0 hover:text-[var(--buzz)]"
              >
                Email list
              </a>
            </nav>
          </div>

          <div className="flex flex-col space-y-4">
            <h2 className="public-kicker text-[color-mix(in_srgb,var(--paper)_70%,transparent)]">
              Field notes
            </h2>
            <p className="text-sm leading-relaxed text-[color-mix(in_srgb,var(--paper)_78%,transparent)]">
              Built by the DSGT tech team in Atlanta. Club events after 6:30 PM
              ET.
            </p>
          </div>
        </div>

        <div className="mt-20 pt-8 border-t border-[color-mix(in_srgb,var(--paper)_16%,transparent)] flex flex-col md:flex-row justify-between gap-4">
          <p className="text-[11px] font-mono uppercase tracking-widest text-[color-mix(in_srgb,var(--paper)_50%,transparent)]">
            © {new Date().getFullYear()} Data Science at Georgia Tech
          </p>
          <div className="flex gap-6">
            <span className="text-[11px] font-mono uppercase tracking-widest text-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
              33.7756° N
            </span>
            <span className="text-[11px] font-mono uppercase tracking-widest text-[color-mix(in_srgb,var(--paper)_40%,transparent)]">
              84.3963° W
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
