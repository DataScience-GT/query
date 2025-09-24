"use client";

import React, { useEffect } from 'react';
import AboutSection from './sections/AboutSection';
import TracksSection from './sections/TracksSection'; // 1. Import the new section
import FAQSection from './sections/FAQSection';
import PrizesSection from './sections/PrizeAndSpeakerSection';
export default function HomeSections() {
  useEffect(() => {
    // ... your scrolling logic remains here ...
  }, []);

  return (
    <>
      <AboutSection />
      
      {/* 2. Use the TracksSection component here */}
      <TracksSection />

      <FAQSection />
      <PrizesSection />

      {/* Placeholders for the remaining sections */}
      <section id="prizes" className="section-anchor min-h-screen px-6 py-24">
        {/* ... */}
      </section>
      {/* ... etc ... */}
    </>
  );
}