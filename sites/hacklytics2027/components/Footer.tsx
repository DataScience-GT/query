"use client";
import Link from "next/link";
import { PixelBed, bloomSet, plantBed, withBlooms } from "./pixel/PixelBed";
import { INTEREST_URL, PORTAL_ORIGIN } from "@/lib/links";

const navIds = ["about", "tracks", "prizes", "schedule", "sponsors", "faqs"];

const FOOTER_BED = withBlooms(plantBed(3), bloomSet(4));

export default function Footer() {
  return (
    <footer className="relative w-full border-t border-rule overflow-hidden">
      <div className="wrap pt-24 md:pt-32 pb-10">
        <h2 className="section-title mb-8">
          Applications open soon.
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-16">
          <a
            href={INTEREST_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Notify me (opens a sign-up form)"
            className="btn btn-bloom"
          >
            Notify me
          </a>
          <p className="font-sans text-[17px] text-ink-2 max-w-sm leading-relaxed">
            We’ll let you know the moment they do.
          </p>
        </div>

        {/* Side by side only once both rows fit: at tablet width the contact
            links wrapped "MLH Code of Conduct" onto three lines. */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 lg:gap-10 pt-8 border-t border-rule">
          <nav className="flex flex-wrap gap-x-6 gap-y-3">
            {navIds.map((id) => (
              <Link
                key={id}
                href={`/#${id}`}
                className="font-sans text-sm capitalize text-ink-2 hover:text-ink transition-colors"
              >
                {id === "faqs" ? "FAQ" : id}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4 sm:gap-x-8 whitespace-nowrap">
            <Link
              href="mailto:hello@hacklytics.io"
              className="font-sans text-sm text-ink-2 hover:text-ink transition-colors"
            >
              hello@hacklytics.io
            </Link>
            <Link
              href={PORTAL_ORIGIN}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-sm text-ink-2 hover:text-ink transition-colors"
            >
              datasciencegt.org
            </Link>
            <Link
              href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-sm text-ink-2 hover:text-ink transition-colors"
            >
              MLH Code of Conduct
            </Link>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <p className="font-sans text-[13px] text-ink-3">© 2027 Data Science @ GT</p>
          <div className="flex items-center gap-5">
            <Link
              href="https://instagram.com/dsgt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="font-sans text-[13px] text-ink-3 hover:text-ink transition-colors"
            >
              Instagram
            </Link>
            <Link
              href="https://linkedin.com/company/dsgt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="font-sans text-[13px] text-ink-3 hover:text-ink transition-colors"
            >
              LinkedIn
            </Link>
          </div>
        </div>
      </div>

      {/* The page ends in the same bed it started in. */}
      <h2 className="wrap font-display font-bold text-[15px] text-ink pt-10">
        Plant a flower
      </h2>
      <PixelBed plants={FOOTER_BED} className="pt-6" plantable />
    </footer>
  );
}
