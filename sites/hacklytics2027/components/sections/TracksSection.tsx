"use client";
import React from "react";
import SectionHead from "../SectionHead";

const tracks = [
  {
    num: "01",
    title: "Finance",
    description: "Market structure, risk, fraud, and the models that price it all.",
  },
  {
    num: "02",
    title: "Sports Analytics",
    description: "Player performance, game strategy, and the numbers behind the tape.",
  },
  {
    num: "03",
    title: "Healthcare",
    description: "Bioinformatics, diagnostics, and patient outcomes at population scale.",
  },
  {
    num: "04",
    title: "Entertainment",
    description: "Recommendation, generation, and how audiences actually behave.",
  },
  {
    num: "05",
    title: "Pure Imagination",
    description: "The wildcard. Anything defensible, so long as the data carries it.",
  },
];

export default function TracksSection() {
  return (
    <section id="tracks" className="section-anchor relative bg-paper">
      <div className="wrap py-14 md:py-20">
        <SectionHead
          num="02"
          label="Competition"
          title="Tracks"
          note="Pick one at submission. Every track carries its own prize pool on top of the overall grand prizes."
        />

        <ol className="rule-heavy-t mt-10 md:mt-14">
          {tracks.map(({ num, title, description }) => (
            <li key={num} className="rule-b">
              <div className="invert-hover group grid grid-cols-[3rem_1fr_1.5rem] items-baseline gap-4 px-2 py-7 md:grid-cols-[5rem_minmax(0,26rem)_minmax(0,1fr)_2rem] md:gap-8 md:py-9">
                <span className="mono-label text-ink-soft group-hover:text-gold">{num}</span>
                <h3 className="display text-[clamp(1.75rem,4vw,2.5rem)]">{title}</h3>
                <p className="col-span-2 max-w-[52ch] text-sm leading-relaxed text-ink-soft group-hover:text-paper md:col-span-1 md:text-base">
                  {description}
                </p>
                <span className="hidden text-right transition-transform duration-150 group-hover:translate-x-1 md:block">
                  →
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
