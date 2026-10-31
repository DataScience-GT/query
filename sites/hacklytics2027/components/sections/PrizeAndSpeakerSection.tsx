import React from "react";

const prizes = [
  { label: "Best overall", detail: "Top project across all tracks, purse to be announced" },
  { label: "Track prizes", detail: "First and second place in each track" },
  { label: "MLH challenges", detail: "Sponsor challenges stack on top of a track" },
  { label: "Beginner", detail: "A beginner-friendly award" },
];

export default function PrizeAndSpeakerSection() {
  return (
    <section id="prizes" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-end gap-x-16 gap-y-6 mb-10 md:mb-16">
          <h2 className="section-title">Prizes</h2>
          <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55]">
            Prize details land closer to the event
          </p>
        </div>

        <dl className="border-t border-rule">
          {prizes.map((p) => (
            <div
              key={p.label}
              className="grid grid-cols-1 lg:grid-cols-2 lg:items-baseline gap-x-16 gap-y-2 border-b border-rule py-6"
            >
              <dt className="font-display -ml-[0.125em] text-[24px] leading-[1.1] text-ink">{p.label}</dt>
              <dd className="font-sans text-[17px] md:text-[19px] text-ink-2">{p.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
