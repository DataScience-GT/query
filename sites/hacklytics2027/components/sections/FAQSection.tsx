"use client";

import React, { useState } from "react";

const FAQCard: React.FC<{ title: string; content: string; num: string }> = ({
  title,
  content,
  num
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`border-b border-gridline transition-colors duration-300 ${isOpen ? 'bg-white/[0.05]' : 'hover:bg-white/[0.02]'} cursor-pointer`}
      onClick={() => setIsOpen(!isOpen)}
    >
      <div className="flex justify-between items-center p-6 md:p-8">
        <div className="flex items-center gap-6">
          <span className={`font-mono text-xs md:text-sm tracking-widest ${isOpen ? 'text-bloom-cyan' : 'text-gray-500'}`}>
            {num}
          </span>
          <h3 className={`font-sans text-xl md:text-2xl font-bold tracking-tight ${isOpen ? 'text-white' : 'text-gray-300'} transition-colors`}>
            {title}
          </h3>
        </div>

        {/* Expand/Collapse Icon */}
        <div className={`flex-shrink-0 text-gray-500 transition-transform duration-300 ${isOpen ? 'rotate-45 text-bloom-cyan' : ''}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
      </div>

      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="font-mono text-sm text-gray-400 leading-relaxed p-6 pt-0 md:pl-16 md:pr-8">
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
      content: "We will have a limited day of walk-ins starting at 6:00PM on the first day of the event. First come, first served."
    },
    {
      title: "Who can register?",
      content: "Any student currently enrolled in a University above the age of 18. For any discrepancies, please reach out to our team."
    },
    {
      title: "Where and when is it held?",
      content: "February 20th - February 22nd, 2027 at the Klaus Advanced Computing Building, Georgia Tech Campus."
    },
    {
      title: "Can you participate virtually?",
      content: "No, Hacklytics 2027 is fully in-person this year. Sponsors want to see you build and innovate in real time!"
    },
    {
      title: "What is a data science hackathon?",
      content: "A datathon focuses on data science and machine learning. You can use any datasets, languages, APIs, or algorithms to create visualizations, develop models, or derive actionable insights."
    },
    {
      title: "How many people per team?",
      content: "Maximum of 4 members per team. You're also allowed to work solo or with fewer members."
    },
    {
      title: "What if I don't have a team?",
      content: "Many participants come without teams. We host a team-building event right after the opening ceremony, and you can also find teammates on our Discord."
    },
    {
      title: "Is the event free?",
      content: "100% free! We provide all meals, snacks, caffeine, swag, and cloud credits during the event."
    }
  ];

  return (
    <section id="faqs" className="section-anchor scroll-mt-20 border-b border-gridline bg-[#0b0c10] text-white">
      <div className="flex flex-col lg:flex-row w-full">
        
        {/* Left Sidebar Header */}
        <div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-gridline p-6 md:p-12 xl:p-24 relative overflow-hidden flex flex-col justify-between min-h-[400px]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-bloom-pink/10 blur-[80px] pointer-events-none"></div>
          
          <div className="relative z-10">
            <span className="font-mono text-sm text-bloom-lime tracking-widest uppercase mb-4 block">Information</span>
            <h1 className="font-sans text-5xl md:text-7xl font-bold tracking-tighter uppercase mb-6">
              FAQ
            </h1>
            <p className="font-mono text-sm text-gray-400 leading-relaxed uppercase tracking-wide">
              Everything you need to know about <span className="text-white font-bold">Hacklytics 2027</span>. Can't find the answer? Hit us up on Discord.
            </p>
          </div>
          
          <div className="mt-12 lg:mt-0 relative z-10 hidden lg:block">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" className="text-gray-600">
              <line x1="20" y1="0" x2="20" y2="40" strokeWidth="1"></line>
              <line x1="0" y1="20" x2="40" y2="20" strokeWidth="1"></line>
              <circle cx="20" cy="20" r="10" strokeWidth="1"></circle>
            </svg>
          </div>
        </div>

        {/* Right Accordion Area */}
        <div className="lg:w-2/3 flex flex-col">
          {faqItems.map((item, index) => (
            <FAQCard
              key={index}
              num={String(index + 1).padStart(2, '0')}
              title={item.title}
              content={item.content}
            />
          ))}
        </div>

      </div>
    </section>
  );
}
