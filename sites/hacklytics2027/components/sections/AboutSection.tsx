"use client";
import React from "react";

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor text-white relative">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">

        {/* Section label */}
        <div className="flex items-center gap-4 mb-16 md:mb-24">
          <div className="w-12 h-[1px] bg-gradient-to-r from-bloom-cyan to-transparent" />
          <span className="font-mono text-xs text-bloom-cyan uppercase tracking-[0.4em]">About</span>
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">

          {/* Left: headline + copy */}
          <div className="lg:col-span-3 flex flex-col justify-center">
            <h2 className="font-sans font-medium text-5xl sm:text-6xl md:text-7xl lg:text-[6rem] text-white mb-10 leading-[0.9] tracking-[-0.03em]">
              A Hub of<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-cyan to-bloom-cyan/50">
                Innovation
              </span>
            </h2>

            <div className="space-y-8 font-sans text-lg md:text-xl lg:text-2xl text-white/50 leading-[1.6] max-w-xl font-light">
              <p>
                <strong className="text-white font-normal">Hacklytics</strong> is a 36-hour data science hackathon hosted by Data Science @ GT — the premier event of its kind in the Southeast.
              </p>
              <p>
                We invite hackers from across the globe to dive into the <em className="text-white/80 not-italic font-normal">digital bloom</em> — the bleeding edge of AI, machine learning, and data analytics in a high-octane environment.
              </p>
            </div>
          </div>

          {/* Right: Glass Cards */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* When & Where Card */}
            <div className="p-8 md:p-10 rounded-3xl border border-white/[0.05] bg-white/[0.02] backdrop-blur-2xl hover:bg-white/[0.03] transition-colors duration-500 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
              <span className="font-mono text-[10px] text-bloom-lime uppercase tracking-[0.3em] block mb-6">When & Where</span>
              <div className="space-y-2">
                <span className="block font-sans text-2xl md:text-3xl font-medium text-white tracking-tight">Feb. 26 – 28, 2027</span>
                <span className="block font-sans text-base text-white/60 pt-2">Klaus Advanced Computing Building</span>
                <span className="block font-mono text-[10px] text-white/30 uppercase tracking-[0.2em] pt-1">Georgia Tech Campus · Atlanta</span>
              </div>
            </div>

            {/* Why Join Card */}
            <div className="p-8 md:p-10 rounded-3xl border border-white/[0.05] bg-white/[0.02] backdrop-blur-2xl hover:bg-white/[0.03] transition-colors duration-500 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
              <span className="font-mono text-[10px] text-bloom-pink uppercase tracking-[0.3em] block mb-6">Why Join?</span>
              <ul className="space-y-5">
                {[
                  "Build projects that matter",
                  "Connect with 1,000+ hackers",
                  "Free food, swag & networking",
                ].map((text, i) => (
                  <li key={i} className="flex items-center gap-4 group cursor-default">
                    <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center bg-white/5 group-hover:border-bloom-pink/50 group-hover:bg-bloom-pink/10 transition-all duration-300">
                      <span className="font-mono text-[10px] text-white/50 group-hover:text-bloom-pink transition-colors">0{i + 1}</span>
                    </div>
                    <span className="font-sans text-base text-white/60 group-hover:text-white transition-colors duration-300">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
