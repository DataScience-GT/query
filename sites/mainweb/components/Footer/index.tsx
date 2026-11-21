// components/Footer/Footer.tsx
import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/images/dsgt/apple-touch-icon.png";

import { CONTACT_EMAIL, SOCIAL_LINKS } from "@query/core";

interface FooterProps {
  className?: string;
}

const Footer = ({ className = "" }: FooterProps) => {
  return (
    <footer
      className={`relative w-full border-t border-white/5 bg-[#050505] py-14 font-sans text-gray-400 md:py-20 ${className}`}
    >
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 lg:gap-8">
          {/* BRANDING COLUMN */}
          <div className="space-y-6">
            <div className="group flex items-center gap-3">
              <Image
                src={logo}
                alt="DSGT Logo"
                className="shadow-dsgt-teal/10 h-8 w-8 rounded shadow-lg transition-transform group-hover:rotate-12"
              />
              <span className="text-xl font-bold tracking-tighter text-white uppercase">
                DSGT
              </span>
            </div>
            <p className="max-w-[240px] text-sm leading-relaxed text-gray-400">
              The largest student-run data science organization at Georgia Tech.
            </p>
          </div>

          {/* NAVIGATION COLUMN */}
          <div className="flex flex-col space-y-4">
            <h2 className="font-mono text-[10px] font-bold tracking-[0.3em] text-white uppercase">
              Navigation
            </h2>
            <nav className="flex flex-col space-y-2 text-sm font-medium">
              <Link
                href="/bootcamp"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                Bootcamp
              </Link>
              <Link
                href="/projects"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                Projects
              </Link>
              <Link
                href="/events"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                Events
              </Link>
              <Link
                href="/hacklytics"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                Hacklytics
              </Link>
              <Link
                href="/team"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                Team
              </Link>
              <Link
                href="/history"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                History
              </Link>
              <Link
                href="/status"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                Status
              </Link>
            </nav>
          </div>

          {/* SOCIAL COLUMN */}
          <div className="flex flex-col space-y-4">
            <h2 className="font-mono text-[10px] font-bold tracking-[0.3em] text-white uppercase">
              Network
            </h2>
            <nav className="flex flex-col space-y-2 text-sm font-medium">
              <a
                href={SOCIAL_LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                GitHub
              </a>
              <a
                href={SOCIAL_LINKS.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                LinkedIn
              </a>
              <a
                href={SOCIAL_LINKS.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                Instagram
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="hover:text-dsgt-teal inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                Email
              </a>
            </nav>
          </div>
        </div>

        {/* BOTTOM COPYRIGHT */}
        <div className="mt-20 flex flex-col justify-between gap-4 border-t border-white/5 pt-8 md:flex-row">
          <p className="font-mono text-[11px] tracking-widest text-gray-400 uppercase">
            {/* oxlint-disable-next-line react/purity */}©{" "}
            {new Date().getFullYear()} Data Science at Georgia Tech
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
