// components/HomeSections.tsx

"use client";

import React from 'react';
import AboutSection from './sections/AboutSection';
import TracksSection from './sections/TracksSection';
import FAQSection from './sections/FAQSection';
import PrizesSection from './sections/PrizeAndSpeakerSection'; // Make sure this component contains id="prizes" and id="speakers"
import ScheduleSection from './sections/Schedule/Schedule'
export default function HomeSections() {
  return (
    <>
      <AboutSection />
      <TracksSection />
      <FAQSection />
      <PrizesSection />
      <ScheduleSection />

      {/* DELETE THIS DUPLICATE SECTION */}
      {/* <section id="prizes" className="section-anchor min-h-screen px-6 py-24">
          ...
        </section> 
      */}
    </>
  );
}