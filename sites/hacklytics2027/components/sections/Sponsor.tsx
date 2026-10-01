"use client";
import React from "react";
import Link from "next/link";
import Eyebrow from "./Eyebrow";

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor relative text-white border-t border-white/[0.06]">
      <div className="section-wrap max-w-7xl mx-auto px-6 py-20 md:py-24">
        <Eyebrow>Sponsors</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-12 md:mb-16">
          Grow with us.
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-stretch gap-4">
          <div className="flex flex-col justify-center gap-1 border border-white/20 px-8 py-6 min-h-[5.5rem] sm:w-48">
            <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-white/40">
              Hosted by
            </span>
            <span className="font-sans font-bold text-lg tracking-tight text-white">
              DS @ GT
            </span>
          </div>
          <div className="flex flex-col justify-center gap-1 border border-white/20 px-8 py-6 min-h-[5.5rem] sm:w-48">
            <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-white/40">
              Member event
            </span>
            <span className="font-sans font-bold text-lg tracking-tight text-white">
              MLH
            </span>
          </div>
          {/* An invitation, not an empty logo slot: 2027 partners are not
              announced yet. */}
          <div className="flex flex-1 flex-col justify-center gap-1 border border-white/20 px-8 py-6 min-h-[5.5rem]">
            <span className="font-sans font-bold text-lg tracking-tight text-white">
              Sponsor Hacklytics 2027
            </span>
            <p className="font-sans text-sm text-white/50">
              Email{" "}
              <Link
                href="mailto:hello@hacklytics.io"
                className="text-white/80 hover:text-white underline underline-offset-4"
              >
                hello@hacklytics.io
              </Link>{" "}
              for the partner deck.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
