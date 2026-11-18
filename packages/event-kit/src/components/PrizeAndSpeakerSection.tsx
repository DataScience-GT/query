import React from "react";
import type { EventConfig } from "../config";

export default function PrizeAndSpeakerSection({ event }: { event: EventConfig }) {
  const { prizes, speakers } = event;
  return (
    <section id="prizes" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-end gap-x-16 gap-y-6 mb-10 md:mb-16">
          <h2 className="section-title">Prizes</h2>
          <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55]">
            {prizes.intro}
          </p>
        </div>

        <dl className="border-t border-rule">
          {prizes.items.map((p) => (
            <div
              key={p.label}
              className="grid grid-cols-1 lg:grid-cols-2 lg:items-baseline gap-x-16 gap-y-2 border-b border-rule py-6"
            >
              <dt className="font-display -ml-[0.125em] text-[24px] leading-[1.1] text-ink">{p.label}</dt>
              <dd className="font-sans text-[17px] md:text-[19px] text-ink-2">{p.detail}</dd>
            </div>
          ))}
        </dl>

        {speakers.length > 0 && (
          <div id="speakers" className="section-anchor mt-16 md:mt-24">
            <h2 className="section-title mb-10 md:mb-16">Speakers</h2>
            <dl className="border-t border-rule">
              {speakers.map((s, i) => (
                <div
                  key={`${s.name}-${i}`}
                  className="grid grid-cols-1 lg:grid-cols-2 lg:items-baseline gap-x-16 gap-y-2 border-b border-rule py-6"
                >
                  <dt className="font-display -ml-[0.125em] text-[24px] leading-[1.1] text-ink">{s.name}</dt>
                  <dd className="font-sans text-[17px] md:text-[19px] text-ink-2">
                    {[s.title, s.company].filter(Boolean).join(", ")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
