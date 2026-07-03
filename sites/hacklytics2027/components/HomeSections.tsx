// components/HomeSections.tsx
"use client";

import React from "react";
import AboutSection from "./sections/AboutSection";
import TracksSection from "./sections/TracksSection";
import ScheduleSection from "./sections/Schedule/Schedule";
import FAQSection from "./sections/FAQSection";
import PrizeAndSpeakerSection from "./sections/PrizeAndSpeakerSection";
import SponsorsSection from "./sections/Sponsor";
import LazySection from "./LazySection";

// Simple full-width bloom divider — used sparingly
function SectionDivider() {
  return <div className="bloom-divider opacity-50" />;
}

export default function HomeSections() {
  const SHOW_FUTURE_SECTIONS = false; // Set to true to unhide Tracks, Prizes, Schedule, Sponsors

  return (
    <div className="relative">
      <AboutSection />
      <SectionDivider />

      {SHOW_FUTURE_SECTIONS && (
        <>
          <LazySection rootMargin="300px" minHeight="600px">
            <TracksSection />
          </LazySection>
          <SectionDivider />

          <LazySection rootMargin="300px" minHeight="600px">
            <PrizeAndSpeakerSection />
          </LazySection>
          <SectionDivider />

          <LazySection rootMargin="300px" minHeight="500px">
            <ScheduleSection />
          </LazySection>
          <SectionDivider />
        </>
      )}

      <LazySection rootMargin="300px" minHeight="600px">
        <FAQSection />
      </LazySection>
      <SectionDivider />

      {SHOW_FUTURE_SECTIONS && (
        <LazySection rootMargin="300px" minHeight="800px">
          <SponsorsSection />
        </LazySection>
      )}
    </div>
  );
}
