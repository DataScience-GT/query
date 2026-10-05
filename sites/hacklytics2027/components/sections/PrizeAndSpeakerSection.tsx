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
    <section id="prizes" className="section-anchor relative border-t border-rule">
      <div className="wrap py-24 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-5">
            <h2 className="section-title">Prizes</h2>
            <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] mt-6 max-w-[40ch]">
              Prize details land closer to the event.
            </p>
          </div>

          <dl className="lg:col-span-6 lg:col-start-7 border-t border-rule">
            {prizes.map((p) => (
              <div
                key={p.label}
                className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 sm:gap-8 border-b border-rule py-5"
              >
                <dt className="font-sans font-semibold text-[17px] text-ink">{p.label}</dt>
                <dd className="font-sans text-[17px] text-ink-2">{p.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
