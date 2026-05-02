// components/HomeSections.tsx

"use client";

import React from 'react';
import AboutSection from './sections/AboutSection';
import TracksSection from './sections/TracksSection';
import FAQSection from './sections/FAQSection';
import PrizesSection from './sections/PrizeAndSpeakerSection';
import ScheduleSection from './sections/Schedule/Schedule';
import SponsorSection from './sections/Sponsor';

export default function HomeSections() {
  return (
    <>
      <AboutSection />
      <ScheduleSection />
      <TracksSection />
      <PrizesSection />
      <FAQSection />
      <SponsorSection />
    </>
  );
}
