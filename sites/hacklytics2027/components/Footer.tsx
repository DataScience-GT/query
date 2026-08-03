"use client";
import Link from "next/link";
import Image from "next/image";

const social = [
  { label: "Instagram", href: "https://instagram.com/dsgt" },
  { label: "LinkedIn", href: "https://linkedin.com/company/dsgt" },
  { label: "Discord", href: "https://discord.gg/hacklytics" },
];

const sections = ["about", "tracks", "prizes", "schedule", "faqs", "sponsors"];

export default function Footer() {
  return (
    <footer className="relative bg-ink text-paper">
      <div className="wrap py-14 md:py-20">
        {/* Wordmark */}
        <div className="flex items-end justify-between gap-6 border-b-2 border-paper/80 pb-8">
          <p className="display text-[clamp(2.25rem,11vw,9rem)] leading-[0.8]">
            Hack<span className="text-gold">lytics</span>
          </p>
          <span className="mono-label mb-2 shrink-0 text-paper/60">Georgia Tech</span>
        </div>

        <div className="grid gap-10 py-10 md:grid-cols-12 md:gap-8">
          {/* Colophon */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
              <span className="mono-label text-paper/70">Data Science @ Georgia Tech</span>
            </div>
            <p className="mt-5 max-w-[34ch] text-sm leading-relaxed text-paper/60">
              A student-run datathon at the Klaus Advanced Computing Building.
              Free to enter, open to any university student 18 or older.
            </p>
            <Link
              href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block"
            >
              <img src="/mlh-trust-badge.svg" alt="Major League Hacking 2027 Hackathon Season" className="h-14 w-auto" />
            </Link>
          </div>

          {/* Index */}
          <nav className="md:col-span-3" aria-label="Footer sections">
            <p className="mono-label border-b border-paper/25 pb-2 text-paper/50">Index</p>
            <ul className="mt-3">
              {sections.map((id, i) => (
                <li key={id}>
                  <Link
                    href={`/#${id}`}
                    className="flex items-baseline gap-3 py-1.5 text-paper/75 hover:text-gold"
                  >
                    <span className="mono-label text-paper/35">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-base capitalize">{id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div className="md:col-span-4">
            <p className="mono-label border-b border-paper/25 pb-2 text-paper/50">Contact</p>
            <ul className="mt-3">
              <li>
                <Link href="mailto:hello@hacklytics.io" className="block py-1.5 text-base text-paper/75 hover:text-gold">
                  hello@hacklytics.io
                </Link>
              </li>
              <li>
                <Link href="https://datasciencegt.org" target="_blank" rel="noopener noreferrer" className="block py-1.5 text-base text-paper/75 hover:text-gold">
                  datasciencegt.org ↗
                </Link>
              </li>
              {social.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} target="_blank" rel="noopener noreferrer" className="block py-1.5 text-base text-paper/75 hover:text-gold">
                    {label} ↗
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="mono-label mt-6 inline-block border border-paper/40 px-5 py-3 text-paper/80 hover:border-paper hover:bg-paper hover:text-ink"
            >
              MLH Code of Conduct
            </Link>
          </div>
        </div>

        {/* Bottom rule */}
        <div className="mono-label flex flex-col gap-2 border-t border-paper/25 pt-6 text-paper/45 sm:flex-row sm:justify-between">
          <span>© 2027 Data Science @ Georgia Tech</span>
          <span>Atlanta · 33.7774° N, 84.3963° W</span>
        </div>
      </div>
    </footer>
  );
}
