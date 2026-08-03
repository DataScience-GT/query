"use client";
import React from "react";
import SectionHead from "../SectionHead";

const WHY: [string, string][] = [
  ["Build", "Ship a working model, dashboard, or analysis in 36 hours."],
  ["Meet", "1,000+ hackers, plus engineers and recruiters from our sponsors."],
  ["Take", "Prizes across five tracks. Meals, swag and cloud credits included."],
];

export default function AboutSection() {
  return (
    <section id="about" className="section-anchor relative bg-paper">
      <div className="wrap py-14 md:py-20">
        <SectionHead
          num="01"
          label="Orientation"
          title="About The Event"
          note="A datathon, not a hackathon: you bring the questions, we bring the data, the compute, and the caffeine."
        />

        <div className="mt-10 grid gap-12 md:mt-14 md:grid-cols-12 md:gap-10">
          {/* Editorial column */}
          <div className="md:col-span-7">
            <p className="dropcap text-[1.0625rem] leading-[1.65] md:text-lg">
              Hacklytics is a 36-hour data science hackathon run by Data Science @ Georgia
              Tech, and the largest event of its kind in the Southeast. Every February,
              a thousand students take over the Klaus Advanced Computing Building and turn
              raw datasets into models, visualizations, and arguments worth defending.
            </p>

            <p className="mt-6 text-[1.0625rem] leading-[1.65] text-ink-soft md:text-lg">
              You will not be graded on polish. You will be graded on whether the thing works,
              whether the data supports the claim, and whether you can explain it to a judge in
              four minutes. Bring a team of up to four, or come alone and find one on Friday night.
            </p>

            <ul className="rule-heavy-t mt-10">
              {WHY.map(([verb, text], i) => (
                <li key={verb} className="rule-b grid grid-cols-[2.5rem_1fr] gap-4 py-5 md:grid-cols-[4rem_8rem_1fr] md:gap-6">
                  <span className="mono-label pt-1 text-ink-soft">{String(i + 1).padStart(2, "0")}</span>
                  <span className="display text-2xl md:text-3xl">{verb}</span>
                  <span className="col-span-2 text-sm leading-relaxed text-ink-soft md:col-span-1 md:pt-1 md:text-base">
                    {text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Facts column */}
          <aside className="md:col-span-4 md:col-start-9">
            <div className="border border-ink">
              <div className="mono-label rule-heavy-b bg-ink px-5 py-3 text-paper">
                When &amp; where
              </div>
              <div className="px-5 py-6">
                <p className="display text-3xl md:text-4xl">
                  Feb 26<span className="text-gold-deep">—</span>28
                </p>
                <p className="mono-label mt-2 text-ink-soft">2027 · Fri 5:00 PM → Sun 4:00 PM</p>

                <div className="rule-t mt-6 pt-6">
                  <p className="text-base font-medium leading-snug">Klaus Advanced Computing Building</p>
                  <p className="mt-1 text-sm text-ink-soft">266 Ferst Dr NW, Atlanta, GA 30332</p>
                  <a
                    href="https://maps.google.com/?q=Klaus+Advanced+Computing+Building+Atlanta"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono-label mt-4 inline-block border-b border-ink pb-1 hover:bg-ink hover:text-paper"
                  >
                    Open in maps →
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 border border-rule">
              {[
                ["36", "Hours"],
                ["05", "Tracks"],
                ["1K+", "Hackers"],
                ["$0", "Entry"],
              ].map(([n, l], i) => (
                <div
                  key={l}
                  className={`px-5 py-6 ${i % 2 === 0 ? "border-r border-rule" : ""} ${i < 2 ? "border-b border-rule" : ""}`}
                >
                  <p className="display tabular text-4xl">{n}</p>
                  <p className="mono-label mt-2 text-ink-soft">{l}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
