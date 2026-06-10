// components/HomeSections.tsx

"use client";

import React from 'react';
import AboutSection from './sections/AboutSection';
import ScheduleSection from './sections/Schedule/Schedule';
import FAQSection from './sections/FAQSection';
import { FlowerDivider, FlowerVine } from './FloatingFlowers';
import LazySection from './LazySection';

// Keep imports for hidden sections so they are ready for future use (commented out to satisfy ESLint)
// import TracksSection from './sections/TracksSection';
// import PrizeAndSpeakerSection from './sections/PrizeAndSpeakerSection';
// import SponsorSection from './sections/Sponsor';

export default function HomeSections() {
  return (
    <div className="relative">
      {/* Side vine decorations */}
      <FlowerVine side="left" colors={['#ff007f', '#ff66b2', '#cc44ff']} flowerCount={8} />
      <FlowerVine side="right" colors={['#00f3ff', '#66ffee', '#ccff00']} flowerCount={7} />
      
      {/* About renders immediately — closest to fold */}
      <AboutSection />
      <FlowerDivider variant="lime" />

      {/* Tracks Section (Hidden for now / TBD) */}
      {/* 
      <LazySection rootMargin="300px" minHeight="500px">
        <TracksSection />
      </LazySection>
      <FlowerDivider variant="cyan" />
      */}

      {/* Prizes & Speakers Section (Hidden for now / TBD) */}
      {/* 
      <LazySection rootMargin="300px" minHeight="600px">
        <PrizeAndSpeakerSection />
      </LazySection>
      <FlowerDivider variant="purple" />
      */}

      {/* Schedule Section */}
      <LazySection rootMargin="300px" minHeight="500px">
        <ScheduleSection />
      </LazySection>
      <FlowerDivider variant="pink" />
      
      {/* FAQ lazy-loaded when user scrolls near */}
      <LazySection rootMargin="300px" minHeight="600px">
        <FAQSection />
      </LazySection>

      {/* Sponsors/Partners lazy-loaded last (Hidden for now / TBD) */}
      {/* 
      <FlowerDivider variant="cyan" />
      <LazySection rootMargin="300px" minHeight="800px">
        <SponsorSection />
      </LazySection>
      */}
    </div>
  );
}

