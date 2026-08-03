"use client";
import Link from "next/link";
import Image from "next/image";
import { PixelFloraRow } from "./pixel/PixelBits";

export default function Footer() {
  return (
    <footer className="relative z-10 w-full border-t border-white/5 bg-[#020204]/90 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-bloom-cyan/5 to-transparent opacity-50 pointer-events-none" />

      {/* pixel flower bed growing along the top edge of the footer */}
      <PixelFloraRow seed={9} count={8} className="w-full" />
      <div className="section-wrap max-w-7xl mx-auto py-16 md:py-24 px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-20 mb-16">

          {/* Brand */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4 group cursor-pointer w-fit">
              <div className="pixel-frame pixel-cyan relative w-10 h-10 overflow-hidden bg-white/[0.04]">
                <Image src="/logo.png" alt="Hacklytics" fill className="object-contain" />
              </div>
              <span className="font-pixel text-xs text-white/75 group-hover:text-bloom-cyan transition-colors duration-200">
                HACKLYTICS 2027
              </span>
            </div>
            <p className="font-sans text-sm text-white/40 leading-[1.8] max-w-[26ch] font-light">
              The premier data science hackathon. Hosted by Data Science @ Georgia Tech.
            </p>
            {/* Socials */}
            <div className="flex items-center gap-5 pt-2">
              {[
                {
                  label: "Instagram", href: "https://instagram.com/dsgt",
                  icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>,
                },
                {
                  label: "LinkedIn", href: "https://linkedin.com/company/dsgt",
                  icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
                },
                {
                  label: "Discord", href: "https://discord.gg/hacklytics",
                  icon: <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.102 18.09.12 18.12.144 18.14a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
                },
              ].map(({ label, href, icon }) => (
                <Link key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                  className="text-white/30 hover:text-white transition-colors duration-500">
                  {icon}
                </Link>
              ))}
            </div>
          </div>

          {/* Nav */}
          <div className="flex flex-col gap-4">
            <span className="font-pixel text-[10px] neon-cyan mb-2">Navigation</span>
            {["about", "tracks", "prizes", "schedule", "faqs", "sponsors"].map((id) => (
              <Link key={id} href={`/#${id}`}
                className="font-sans text-base text-white/50 hover:text-white capitalize transition-colors duration-500 w-fit font-light tracking-wide">
                {id}
              </Link>
            ))}
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-4">
            <span className="font-pixel text-[10px] neon-pink mb-2">Connect</span>
            <Link href="mailto:hello@hacklytics.io"
              className="font-sans text-base text-white/50 hover:text-bloom-cyan transition-colors duration-500 w-fit font-light tracking-wide">
              hello@hacklytics.io
            </Link>
            <Link href="https://datasciencegt.org" target="_blank" rel="noopener noreferrer"
              className="font-sans text-base text-white/50 hover:text-white transition-colors duration-500 w-fit font-light tracking-wide">
              datasciencegt.org
            </Link>
            <Link href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" target="_blank" rel="noopener noreferrer"
              className="pixel-frame pixel-lime mt-4 font-pixel text-[9px] text-white/60 hover:text-white transition-colors duration-200 px-5 py-3 w-fit bg-white/[0.03]">
              MLH Code of Conduct
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-10 border-t border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <p className="font-pixel text-[9px] text-white/35">© 2027 Data Science @ GT</p>
          <p className="font-pixel text-[9px] text-white/35 flex items-center gap-2">
            Made with <span className="text-bloom-pink/80">♥</span> by DSGT Tech
          </p>
        </div>
      </div>
    </footer>
  );
}
