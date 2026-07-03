"use client";
import React, { useState } from "react";
import Link from "next/link";

const faqItems: { q: string; a: React.ReactNode }[] = [
  {
    q: "What is a data science hackathon?",
    a: "A datathon focuses on data science and machine learning. You can use any datasets, languages, APIs, or algorithms to create visualizations, develop models, or derive actionable insights.",
  },
  {
    q: "Who can register?",
    a: "Any student currently enrolled at a university who is 18 or older. For any discrepancies, reach out to our team.",
  },
  {
    q: "How many people per team?",
    a: "Maximum of 4 members. You're also allowed to work solo or with fewer members.",
  },
  {
    q: "Is the event free?",
    a: "100% free. We provide all meals, snacks, caffeine, swag, and cloud credits during the event.",
  },
  {
    q: "Can you participate virtually?",
    a: "No — Hacklytics 2027 is fully in-person. Sponsors want to see you build and innovate in real time!",
  },
  {
    q: "What if I don't have a team?",
    a: "Many participants come without teams. We host a team-building event right after the opening ceremony, and you can find teammates on our Discord.",
  },
  {
    q: "What if I forgot to register?",
    a: "We will have a limited number of walk-ins starting at 6:00 PM on the first day. First come, first served.",
  },
  {
    q: "What information does registration collect?",
    a: (
      <>
        Name, age (18+), phone, school, level of study, country, graduation year, major, gender, and race/ethnicity. You&apos;ll also agree to the{" "}
        <Link href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" target="_blank" className="text-bloom-purple hover:text-white transition-colors underline underline-offset-4">
          MLH Code of Conduct
        </Link>{" "}
        and{" "}
        <Link href="https://mlh.io/privacy" target="_blank" className="text-bloom-purple hover:text-white transition-colors underline underline-offset-4">
          MLH Privacy Policy
        </Link>.
      </>
    ),
  },
  {
    q: "What is the MLH Code of Conduct?",
    a: (
      <>
        All participants are expected to follow the{" "}
        <Link href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" target="_blank" className="text-bloom-purple hover:text-white transition-colors underline underline-offset-4">
          MLH Code of Conduct
        </Link>. Harassment of any kind is not tolerated. Contact MLH at incidents@mlh.io or +1 409 202 6060.
      </>
    ),
  },
];

const FAQItem: React.FC<{ q: string; a: React.ReactNode; num: string }> = ({ q, a, num }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border-b border-white/5 transition-colors duration-500 ${open ? "border-white/20 bg-white/[0.01]" : "hover:bg-white/[0.02]"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-6 py-8 px-4 md:px-6 text-left group"
        aria-expanded={open}
      >
        <div className="flex items-start gap-6 md:gap-10">
          <span className="font-mono text-xs text-white/20 mt-1 shrink-0 group-hover:text-bloom-purple transition-colors duration-500">
            {num}
          </span>
          <span className={`font-sans text-lg md:text-2xl font-light tracking-wide transition-colors duration-500 ${open ? "text-white" : "text-white/70 group-hover:text-white"}`}>
            {q}
          </span>
        </div>
        {/* Plus / minus icon */}
        <div className={`shrink-0 mt-1 text-white/20 group-hover:text-white transition-transform duration-500 ${open ? "rotate-45 text-bloom-purple" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </button>

      {/* Answer */}
      <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "grid-rows-[1fr] opacity-100 pb-8" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="font-sans text-base md:text-lg text-white/50 leading-[1.8] font-light pl-4 md:pl-24 pr-4 md:pr-12">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
};

export default function FAQSection() {
  return (
    <section id="faqs" className="section-anchor text-white relative">
      <div className="section-wrap max-w-5xl mx-auto py-24 md:py-32 px-6">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-[1px] bg-gradient-to-r from-bloom-purple to-transparent" />
          <span className="font-mono text-xs text-bloom-purple uppercase tracking-[0.4em]">Information</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-20">
          <h2 className="font-sans font-medium text-5xl sm:text-6xl md:text-7xl lg:text-[6rem] text-white leading-[0.9] tracking-[-0.03em]">
            FAQ
          </h2>
          <p className="font-sans text-base text-white/40 max-w-xs leading-relaxed md:text-right font-light">
            Can&apos;t find the answer?{" "}
            <br className="hidden md:block" />
            <Link href="https://discord.gg/hacklytics" target="_blank" className="text-white hover:text-bloom-purple transition-colors underline underline-offset-4">
              Hit us up on Discord
            </Link>.
          </p>
        </div>

        {/* Accordion */}
        <div className="border-t border-white/5">
          {faqItems.map((item, i) => (
            <FAQItem
              key={i}
              num={String(i + 1).padStart(2, "0")}
              q={item.q}
              a={item.a}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
