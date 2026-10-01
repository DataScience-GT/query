"use client";
import Link from "next/link";
import { PixelGround } from "./pixel/PixelGarden";
import { INTEREST_URL, PORTAL_ORIGIN } from "@/lib/links";

const navIds = ["about", "tracks", "prizes", "schedule", "sponsors", "faqs"];

export default function Footer() {
  return (
    // Starts at the sections' 70% and fades to solid: a solid edge here drew a
    // visible band where the translucent sections above it ended.
    <footer className="relative z-10 w-full bg-gradient-to-b from-[#020204]/70 to-[#020204] to-40% overflow-hidden">
      <div className="section-wrap max-w-7xl mx-auto pt-20 md:pt-28 pb-10 px-6 relative z-10">
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-8">
          Applications <span className="neon-cyan">open soon.</span>
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8 mb-16">
          <a
            href={INTEREST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="pixel-btn inline-flex items-center justify-center px-10 py-4 font-pixel text-xs w-full sm:w-auto"
          >
            Notify me →
          </a>
          <p className="font-sans text-base text-white/65 max-w-sm leading-relaxed">
            We’ll let you know the moment they do.
          </p>
        </div>

        {/* Side by side only once both rows fit: at tablet width the contact
            links wrapped "MLH Code of Conduct" onto three lines. */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 lg:gap-10 pt-8 border-t border-white/10">
          <nav className="flex flex-wrap gap-x-6 gap-y-3">
            {navIds.map((id) => (
              <Link
                key={id}
                href={`/#${id}`}
                className="font-sans text-[11px] uppercase tracking-[0.22em] text-white/40 hover:text-white transition-colors"
              >
                {id === "faqs" ? "FAQ" : id}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4 sm:gap-x-8 whitespace-nowrap">
            <Link
              href="mailto:hello@hacklytics.io"
              className="font-sans text-sm text-white/45 hover:text-white transition-colors"
            >
              hello@hacklytics.io
            </Link>
            <Link
              href={PORTAL_ORIGIN}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-sm text-white/45 hover:text-white transition-colors"
            >
              datasciencegt.org
            </Link>
            <Link
              href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-sm text-white/45 hover:text-white transition-colors"
            >
              MLH Code of Conduct
            </Link>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <p className="font-sans text-xs text-white/35">© 2027 Data Science @ GT</p>
          <div className="flex items-center gap-5">
            <Link
              href="https://instagram.com/dsgt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="font-sans text-xs text-white/35 hover:text-white transition-colors"
            >
              Instagram
            </Link>
            <Link
              href="https://linkedin.com/company/dsgt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="font-sans text-xs text-white/35 hover:text-white transition-colors"
            >
              LinkedIn
            </Link>
            <Link
              href="https://discord.gg/hacklytics"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className="font-sans text-xs text-white/35 hover:text-white transition-colors"
            >
              Discord
            </Link>
          </div>
        </div>
      </div>

      <PixelGround seed={9} count={14} />
    </footer>
  );
}
