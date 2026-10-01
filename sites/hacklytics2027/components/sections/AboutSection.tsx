"use client";
import React from "react";
import Eyebrow from "./Eyebrow";

const stats = [
  { value: "1,000+", label: "Hackers", detail: "Capacity at Klaus", tone: "cyan" },
  { value: "36", label: "Hours", detail: "Fri night through Sunday", tone: "pink" },
  { value: "Free", label: "To attend", detail: "Meals, swag, and cloud credits included", tone: "lime" },
] as const;

const FRAME = { cyan: "pixel-cyan", pink: "pixel-pink", lime: "pixel-lime" } as const;
const NEON = { cyan: "neon-cyan", pink: "neon-pink", lime: "neon-lime" } as const;

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor text-white relative">
      <div className="section-wrap max-w-7xl mx-auto py-20 md:py-28 px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-end">
          <div>
            <Eyebrow index="01" tone="cyan">About</Eyebrow>
            <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em]">
              A hub of <span className="neon-cyan">innovation.</span>
            </h2>
          </div>
          <p className="font-sans text-lg md:text-xl text-white/70 leading-[1.65] max-w-xl">
            Hacklytics is the Southeast’s 36-hour data science and AI hackathon,
            hosted by Data Science @ GT at the Klaus Advanced Computing Building
            in Atlanta, February 26–28, 2027.
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-14 md:mt-20">
          {stats.map((s) => (
            <li
              key={s.label}
              className={`pixel-frame ${FRAME[s.tone]} bg-white/[0.03] px-6 py-7 md:px-8 md:py-9 transition-colors duration-300 hover:bg-white/[0.06]`}
            >
              <p className={`font-sans font-bold text-5xl md:text-6xl tracking-[-0.04em] tabular-nums ${NEON[s.tone]}`}>
                {s.value}
              </p>
              <p className="font-pixel text-[11px] md:text-xs uppercase text-white/85 mt-4">
                {s.label}
              </p>
              <p className="font-sans text-sm text-white/55 mt-2">{s.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default AboutSection;
