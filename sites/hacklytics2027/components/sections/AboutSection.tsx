"use client";
import React from "react";

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor relative">
      <div className="wrap py-24 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="kicker mb-5">About</p>
            <h2 className="section-title text-balance">
              The Southeast’s data science hackathon.
            </h2>
          </div>

          <div className="lg:col-span-6 lg:col-start-7 lg:pt-10">
            <p className="font-sans text-[17px] md:text-[19px] text-ink leading-[1.55] max-w-[60ch]">
              Hacklytics is a 36-hour data science and AI hackathon run by Data
              Science @ GT at the Klaus Advanced Computing Building in Atlanta,
              February 26–28, 2027.
            </p>
            <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[60ch] mt-5">
              Room for 1,000+ hackers. It costs nothing to attend: meals and swag are covered.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
