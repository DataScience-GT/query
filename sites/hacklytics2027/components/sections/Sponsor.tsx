"use client";
import React from "react";
import { BloomSprite } from "../pixel/PixelSprite";
import { BUD, DAISY, TULIP } from "../pixel/sprites";

// A client component only to keep the page small: rendered on the server, the
// sprites' data URIs would go out twice, in the HTML and in the RSC payload.

// An empty plot: the seedlings are the 2027 partners, not announced yet.
const PLOT = [BUD, TULIP, BUD, DAISY, BUD];

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-10">
          <div>
            <h2 className="section-title">Sponsors</h2>
            <div
              aria-hidden="true"
              className="flex h-20 sm:h-36 items-end justify-around border-b border-sage mt-8 [--bed:1] sm:[--bed:2]"
            >
              {PLOT.map((map, i) => (
                <BloomSprite key={i} map={map} scale={4} />
              ))}
            </div>
          </div>

          {/* An invitation, not a wall of empty logo slots: 2027 partners
              are not announced yet. */}
          <div>
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
