// components/HomeSections.tsx
"use client";

import React from "react";
import AboutSection from "./sections/AboutSection";
import TracksSection from "./sections/TracksSection";
import ScheduleSection from "./sections/Schedule/Schedule";
import FAQSection from "./sections/FAQSection";
import PrizeAndSpeakerSection from "./sections/PrizeAndSpeakerSection";
import SponsorsSection from "./sections/Sponsor";

export default function HomeSections() {
  return (
    <div className="relative">
      <AboutSection />
      <TracksSection />
      <PrizeAndSpeakerSection />
      <ScheduleSection />
      <SponsorsSection />
      <FAQSection />
    </div>
  );
}
