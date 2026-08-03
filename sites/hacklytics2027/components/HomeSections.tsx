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

const APPLY_URL = "https://form.typeform.com/to/GvqBCdAe";

// Closing band — last thing before the footer
function ApplyBand() {
  return (
    <section className="bg-paper-2">
      <div className="wrap flex flex-col gap-8 py-16 md:flex-row md:items-end md:justify-between md:py-24">
        <div>
          <p className="mono-label text-ink-soft">Applications open</p>
          <p className="display mt-4 text-[clamp(2.25rem,7vw,5.5rem)]">
            Come build<br />something true
          </p>
        </div>
        <a
          href={APPLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mono-label group flex shrink-0 items-center gap-6 bg-ink px-10 py-6 text-paper transition-colors duration-150 hover:bg-navy"
        >
          Apply for Hacklytics 2027
          <span className="transition-transform duration-150 group-hover:translate-x-1">→</span>
        </a>
      </div>
    </section>
  );
}

export default function HomeSections() {
  const SHOW_FUTURE_SECTIONS = false; // Set to true to unhide Tracks, Prizes, Schedule, Sponsors

  return (
    <div className="relative">
      <AboutSection />

      {SHOW_FUTURE_SECTIONS && (
        <>
          <LazySection rootMargin="300px" minHeight="600px">
            <TracksSection />
          </LazySection>

          <LazySection rootMargin="300px" minHeight="600px">
            <PrizeAndSpeakerSection />
          </LazySection>

          <LazySection rootMargin="300px" minHeight="500px">
            <ScheduleSection />
          </LazySection>
        </>
      )}

      <LazySection rootMargin="300px" minHeight="600px">
        <FAQSection />
      </LazySection>

      {SHOW_FUTURE_SECTIONS && (
        <LazySection rootMargin="300px" minHeight="800px">
          <SponsorsSection />
        </LazySection>
      )}

      <ApplyBand />
    </div>
  );
}
