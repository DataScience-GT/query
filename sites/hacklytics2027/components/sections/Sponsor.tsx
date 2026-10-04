"use client";
import React from "react";

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor relative text-white">
      <div className="section-wrap max-w-7xl mx-auto px-6 py-24 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <h2 className="lg:col-span-5 font-sans font-bold text-4xl sm:text-5xl md:text-6xl text-white leading-[1] tracking-[-0.03em]">
            Sponsors
          </h2>

          {/* An invitation, not a wall of empty logo slots: 2027 partners
              are not announced yet. */}
          <div className="lg:col-span-6 lg:col-start-7 lg:pt-3">
            <p className="font-sans text-lg md:text-xl text-white/80 leading-[1.6] max-w-[55ch]">
              Hosted by Data Science @ GT. A Major League Hacking member event.
            </p>
            <p className="font-sans text-base md:text-lg text-white/65 leading-[1.6] max-w-[55ch] mt-5">
              2027 partners are not announced yet. To sponsor, email{" "}
              <a
                href="mailto:hello@hacklytics.io"
                className="text-bloom-cyan underline underline-offset-4 decoration-bloom-cyan/40 hover:decoration-bloom-cyan"
              >
                hello@hacklytics.io
              </a>{" "}
              for the partner deck.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
