"use client";
import React from "react";
import Link from "next/link";
import Eyebrow from "./Eyebrow";

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor relative text-white border-t border-white/[0.06]">
      <div className="section-wrap max-w-7xl mx-auto px-6 py-24 md:py-32">
        <Eyebrow>Sponsors</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-12 md:mb-16">
          Grow with us.
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-stretch gap-4">
          <div className="flex items-center justify-center border border-white/20 px-8 py-8 min-h-[5.5rem] sm:w-44">
            <span className="font-sans font-bold text-lg tracking-tight text-white">
              DS @ GT
            </span>
          </div>
          <div className="flex items-center justify-center border border-white/20 px-8 py-8 min-h-[5.5rem] sm:w-44">
            <span className="font-sans font-bold text-lg tracking-tight text-white">
              MLH
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center sm:justify-start border border-white/20 px-8 py-8 min-h-[5.5rem]">
            <p className="font-sans text-sm text-white/40">
              your logo ·{" "}
              <Link
                href="mailto:hello@hacklytics.io"
                className="text-white/70 hover:text-white underline underline-offset-4"
              >
                partner deck on request
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
