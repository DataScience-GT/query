"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { bloomSet, plantBed, withBlooms } from "./pixel/beds";
import { PixelBed } from "./pixel/PixelBed";
import { useInBloom } from "./pixel/season";
import {
  INTEREST_URL,
  JUDGE_URL,
  PORTAL_HACKATHON_URL,
  PORTAL_ORIGIN,
} from "@/lib/links";

const navIds = ["about", "tracks", "prizes", "schedule", "sponsors", "faqs"];

const FOOTER_BED = plantBed(3);

export default function Footer() {
  const inBloom = useInBloom();
  // The 404's bare soil is the point of that page, so no bed in bloom under it.
  const home = usePathname() === "/";

  return (
    <footer className="relative w-full overflow-hidden">
      <div className={`wrap pb-10 ${home ? "pt-12 md:pt-24" : "pt-2"}`}>
        {home && (
          <>
            <h2 className="display -ml-[0.125em] text-[32px] md:text-[40px] lg:text-[56px] xl:text-[72px] leading-[1.05] mb-8">
              Applications open soon
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
                We’ll let you know the moment they do
              </p>
            </div>
          </>
        )}

        {/* Two rows at every width: side by side, the links wrapped FAQ and
            "MLH Code of Conduct" onto lines of their own even at 1440px. */}
        <div className={`flex flex-col gap-4 pt-8 ${home ? "border-t border-rule" : ""}`}>
          <nav className="grid grid-cols-3 gap-x-6 sm:flex sm:flex-wrap">
            {navIds.map((id) => (
              <Link
                key={id}
                href={`/#${id}`}
                className="font-sans text-[15px] capitalize text-ink-2 hover:text-ink transition-colors inline-flex min-h-11 min-w-11 items-center"
              >
                {id === "faqs" ? "FAQ" : id}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-0 sm:gap-x-8 whitespace-nowrap">
            <Link
              href={PORTAL_HACKATHON_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-[15px] text-ink-2 hover:text-ink transition-colors inline-flex min-h-11 items-center"
            >
              Hacker portal
            </Link>
            <Link
              href={JUDGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-[15px] text-ink-2 hover:text-ink transition-colors inline-flex min-h-11 items-center"
            >
              Judge Hacklytics
            </Link>
            <Link
              href="mailto:hello@hacklytics.io"
              className="font-sans text-[15px] text-ink-2 hover:text-ink transition-colors inline-flex min-h-11 items-center"
            >
              hello@hacklytics.io
            </Link>
            <Link
              href={PORTAL_ORIGIN}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-[15px] text-ink-2 hover:text-ink transition-colors inline-flex min-h-11 items-center"
            >
              datasciencegt.org
            </Link>
            <Link
              href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-[15px] text-ink-2 hover:text-ink transition-colors inline-flex min-h-11 items-center"
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
              className="font-sans text-[13px] text-ink-3 hover:text-ink transition-colors inline-flex min-h-11 items-center"
            >
              Instagram
            </Link>
            <Link
              href="https://linkedin.com/company/dsgt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="font-sans text-[13px] text-ink-3 hover:text-ink transition-colors inline-flex min-h-11 items-center"
            >
              LinkedIn
            </Link>
          </div>
        </div>
      </div>

      {/* The page ends in the same bed it started in. */}
      {home && (
        <>
          <h2 className="wrap font-display text-[16px] text-ink pt-10">
            Plant a flower
          </h2>
          <PixelBed
            plants={withBlooms(FOOTER_BED, bloomSet(inBloom))}
            className="pt-6"
            plantable
            soil
            big
          />
        </>
      )}
    </footer>
  );
}
