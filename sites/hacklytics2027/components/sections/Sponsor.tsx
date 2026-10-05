"use client";
import React from "react";

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor relative border-t border-rule">
      <div className="wrap py-24 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <h2 className="lg:col-span-5 section-title">Sponsors</h2>

          {/* An invitation, not a wall of empty logo slots: 2027 partners
              are not announced yet. */}
          <div className="lg:col-span-6 lg:col-start-7 lg:pt-3">
            <p className="font-sans text-[17px] md:text-[19px] text-ink leading-[1.55] max-w-[55ch]">
              Hosted by Data Science @ GT. A Major League Hacking member event.
            </p>
            <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[55ch] mt-5">
              2027 partners are not announced yet. To sponsor, email{" "}
              <a href="mailto:hello@hacklytics.io" className="text-link">
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
