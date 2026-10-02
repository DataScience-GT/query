"use client";
import React from "react";

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor text-white relative">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <h2 className="lg:col-span-5 font-sans font-bold text-4xl sm:text-5xl md:text-6xl text-white leading-[1] tracking-[-0.03em] text-balance">
            The Southeast’s data science hackathon.
          </h2>

          <div className="lg:col-span-6 lg:col-start-7 lg:pt-3">
            <p className="font-sans text-lg md:text-xl text-white/80 leading-[1.6] max-w-[60ch]">
              Hacklytics is a 36-hour data science and AI hackathon run by Data
              Science @ GT at the Klaus Advanced Computing Building in Atlanta,
              February 26–28, 2027.
            </p>
            <p className="font-sans text-base md:text-lg text-white/65 leading-[1.6] max-w-[60ch] mt-5">
              Room for 1,000+ hackers. It costs nothing to attend: meals, swag,
              and cloud credits are covered.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
