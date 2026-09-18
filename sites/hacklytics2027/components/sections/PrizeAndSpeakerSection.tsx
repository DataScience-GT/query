"use client";
import React from "react";
import Eyebrow from "./Eyebrow";

const otherPrizes = [
  { label: "Track", detail: "First and second in each track." },
  { label: "MLH", detail: "Sponsor challenges stack on top." },
  { label: "Beginner", detail: "Beginner-friendly award." },
];

export default function PrizeAndSpeakerSection() {
  return (
    <section id="prizes" className="section-anchor text-white relative border-t border-white/[0.06]">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <Eyebrow>Prizes</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-12 md:mb-16">
          Bloom, then win.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
          <div>
            <p className="font-sans text-[11px] uppercase tracking-[0.28em] text-white/40 mb-4">
              Best Overall
            </p>
            <p className="font-sans font-bold text-3xl md:text-4xl text-white tracking-tight">
              Purse TBA.
            </p>
            <p className="font-sans text-base text-white/45 mt-4 max-w-sm leading-relaxed">
              Top projects across all tracks. Prize details land closer to the
              event.
            </p>
          </div>

          <ul className="flex flex-col border-t border-white/10">
            {otherPrizes.map((p) => (
              <li
                key={p.label}
                className="flex items-baseline justify-between gap-6 border-b border-white/10 py-5"
              >
                <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-white/40 shrink-0">
                  {p.label}
                </span>
                <span className="font-sans text-base text-white text-right">
                  {p.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
