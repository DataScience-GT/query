"use client";

import React, { useState } from "react";
import { FlowerAccent } from "../FloatingFlowers";

const FAQCard: React.FC<{ title: string; content: string; num: string }> = ({
  title,
  content,
  num,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`glass-card transition-all duration-500 overflow-hidden ${isOpen ? "border-bloom-cyan/50 shadow-[0_0_20px_rgba(0,243,255,0.15)]" : "hover:border-white/30 hover:-translate-y-1"} cursor-pointer mb-4`}
      onClick={() => setIsOpen(!isOpen)}
    >
      <div className="flex justify-between items-center p-6 md:p-8 relative z-10">
        <div className="flex items-center gap-6">
          <span
            className={`font-mono text-xs md:text-sm tracking-widest font-bold ${isOpen ? "text-bloom-pink drop-shadow-[0_0_5px_currentColor]" : "text-gray-400"}`}
          >
            {num}
          </span>
          <h3
            className={`font-sans text-xl md:text-2xl font-bold tracking-tight ${isOpen ? "text-white" : "text-gray-300"} transition-colors`}
          >
            {title}
          </h3>
        </div>

        {/* Expand/Collapse Icon */}
        <div
          className={`flex-shrink-0 transition-transform duration-500 ${isOpen ? "rotate-45 text-bloom-cyan drop-shadow-[0_0_5px_currentColor]" : "text-gray-400"}`}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
      </div>

      <div
        className={`grid transition-all duration-500 ease-in-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden relative z-10">
          <p className="font-mono text-sm text-gray-300 leading-relaxed p-6 pt-0 md:pl-[5.5rem] md:pr-8">
            {content}
          </p>
        </div>
      </div>
    </div>
  );
};

export default function FAQ() {
  const faqItems = [
    {
      title: "What if I forgot to register?",
      content:
        "We will have a limited day of walk-ins starting at 6:00PM on the first day of the event. First come, first served.",
    },
    {
      title: "Who can register?",
      content:
        "Any student currently enrolled in a University above the age of 18. For any discrepancies, please reach out to our team.",
    },
    {
      title: "Where and when is it held?",
      content:
        "February 26th - February 28th, 2027 at the Klaus Advanced Computing Building, Georgia Tech Campus.",
    },
    {
      title: "Can you participate virtually?",
      content:
        "No, Hacklytics 2027 is fully in-person this year. Sponsors want to see you build and innovate in real time!",
    },
    {
      title: "What is a data science hackathon?",
      content:
        "A datathon focuses on data science and machine learning. You can use any datasets, languages, APIs, or algorithms to create visualizations, develop models, or derive actionable insights.",
    },
    {
      title: "How many people per team?",
      content:
        "Maximum of 4 members per team. You're also allowed to work solo or with fewer members.",
    },
    {
      title: "What if I don't have a team?",
      content:
        "Many participants come without teams. We host a team-building event right after the opening ceremony, and you can also find teammates on our Discord.",
    },
    {
      title: "Is the event free?",
      content:
        "100% free! We provide all meals, snacks, caffeine, swag, and cloud credits during the event.",
    },
  ];

  return (
    <section
      id="faqs"
      className="section-anchor scroll-mt-24 text-white relative"
    >
      <div className="flex flex-col lg:flex-row w-full gap-8 px-4 md:px-12 xl:px-24 mb-16">
        {/* Left Sidebar Header */}
        <div className="lg:w-1/3 glass-panel p-8 md:p-12 xl:p-16 relative overflow-hidden flex flex-col justify-between min-h-[400px] hover:border-bloom-purple/50 transition-colors duration-500 group">
          <FlowerAccent position="top-right" color="#ff007f" size={45} />
          <FlowerAccent position="bottom-left" color="#9d00ff" size={35} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-bloom-pink/20 blur-[100px] pointer-events-none mix-blend-screen group-hover:scale-110 transition-transform duration-700"></div>

          <div className="relative z-10">
            <span className="font-mono text-sm text-bloom-lime tracking-widest uppercase mb-4 block font-bold">
              Information
            </span>
            <h1 className="font-sans text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter uppercase mb-6 drop-shadow-lg text-transparent bg-clip-text bg-gradient-to-br from-white to-bloom-pink bloom-text-glow">
              FAQ
            </h1>
            <p className="font-mono text-sm text-gray-300 leading-relaxed uppercase tracking-wide">
              Everything you need to know about{" "}
              <span className="text-bloom-cyan font-bold drop-shadow-[0_0_5px_currentColor]">
                Hacklytics 2027
              </span>
              . Can't find the answer? Hit us up on Discord.
            </p>
          </div>
        </div>

        {/* Right Accordion Area */}
        <div className="lg:w-2/3 flex flex-col">
          {faqItems.map((item, index) => (
            <FAQCard
              key={index}
              num={String(index + 1).padStart(2, "0")}
              title={item.title}
              content={item.content}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
