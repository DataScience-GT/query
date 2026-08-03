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
import { PixelFloraRow } from "./pixel/PixelBits";

// Pixel flower bed between sections — replaces the old hairline divider
function SectionDivider({ seed }: { seed: number }) {
  return (
    <div className="relative pointer-events-none select-none" aria-hidden="true">
      <div className="bloom-divider opacity-40" />
      <PixelFloraRow seed={seed} count={6} />
    </div>
  );
}

export default function HomeSections() {
  const SHOW_FUTURE_SECTIONS = false; // Set to true to unhide Tracks, Prizes, Schedule, Sponsors

  return (
    <div className="relative">
      <AboutSection />
      <SectionDivider seed={1} />

      {SHOW_FUTURE_SECTIONS && (
        <>
          <LazySection rootMargin="300px" minHeight="600px">
            <TracksSection />
          </LazySection>
          <SectionDivider seed={2} />

          <LazySection rootMargin="300px" minHeight="600px">
            <PrizeAndSpeakerSection />
          </LazySection>
          <SectionDivider seed={3} />

          <LazySection rootMargin="300px" minHeight="500px">
            <ScheduleSection />
          </LazySection>
          <SectionDivider seed={4} />
        </>
      )}

      <LazySection rootMargin="300px" minHeight="600px">
        <FAQSection />
      </LazySection>
      <SectionDivider seed={5} />

      {SHOW_FUTURE_SECTIONS && (
        <LazySection rootMargin="300px" minHeight="800px">
          <SponsorsSection />
        </LazySection>
      )}
    </div>
  );
}
