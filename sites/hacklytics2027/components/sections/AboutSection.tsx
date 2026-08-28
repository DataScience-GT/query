"use client";
import React from "react";
import Eyebrow from "./Eyebrow";

const stats = [
  { num: "01", label: "1,000+ hackers", detail: "Capacity at Klaus" },
  { num: "02", label: "36 hours", detail: "Fri night through Sunday" },
  { num: "03", label: "DS@GT portal", detail: "Notify me hands off — no form here" },
];

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor text-white relative">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">
          <div className="lg:col-span-3">
            <Eyebrow>About</Eyebrow>
            <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white mb-8 leading-[0.95] tracking-[-0.03em]">
              A hub of innovation.
            </h2>
            <p className="font-sans text-lg md:text-xl text-white/55 leading-[1.65] max-w-xl font-normal">
              Hacklytics is the Southeast’s 36-hour data science and AI hackathon,
              hosted by Data Science @ GT. Klaus Advanced Computing Building,
              Atlanta. Feb 26–28, 2027. Notify me opens the DS@GT portal.
            </p>
          </div>

          <ol className="lg:col-span-2 flex flex-col justify-center gap-8 lg:pt-12">
            {stats.map((s) => (
              <li key={s.num} className="flex items-baseline gap-5">
                <span className="font-sans text-sm text-bloom-cyan tabular-nums w-8 shrink-0">
                  {s.num}
                </span>
                <div>
                  <p className="font-sans font-bold text-xl md:text-2xl text-white tracking-tight">
                    {s.label}
                  </p>
                  <p className="font-sans text-sm text-white/40 mt-1">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
