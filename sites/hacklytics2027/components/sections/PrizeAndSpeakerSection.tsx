"use client";
import React from "react";

const prizes = [
  { label: "Best overall", detail: "Top project across all tracks. Purse to be announced." },
  { label: "Track prizes", detail: "First and second place in each track." },
  { label: "MLH challenges", detail: "Sponsor challenges stack on top of a track." },
  { label: "Beginner", detail: "A beginner-friendly award." },
];

export default function PrizeAndSpeakerSection() {
  return (
    <section id="prizes" className="section-anchor text-white relative">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-5">
            <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl text-white leading-[1] tracking-[-0.03em]">
              Prizes
            </h2>
            <p className="font-sans text-base md:text-lg text-white/65 leading-[1.6] mt-6 max-w-[40ch]">
              Prize details land closer to the event.
            </p>
          </div>

          <dl className="lg:col-span-6 lg:col-start-7 border-t border-white/15">
            {prizes.map((p) => (
              <div
                key={p.label}
                className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 sm:gap-8 border-b border-white/15 py-5"
              >
                <dt className="font-sans font-bold text-lg text-white">{p.label}</dt>
                <dd className="font-sans text-base md:text-lg text-white/70">{p.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
