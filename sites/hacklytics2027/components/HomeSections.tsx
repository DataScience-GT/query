// components/HomeSections.tsx

"use client";

import React from 'react';
import AboutSection from './sections/AboutSection';
import FAQSection from './sections/FAQSection';
import SponsorSection from './sections/Sponsor';
import { FlowerDivider, FlowerVine } from './FloatingFlowers';

export default function HomeSections() {
  return (
    <div className="relative">
      {/* Side vine decorations */}
      <FlowerVine side="left" colors={['#ff007f', '#ff66b2', '#cc44ff']} flowerCount={8} />
      <FlowerVine side="right" colors={['#00f3ff', '#66ffee', '#ccff00']} flowerCount={7} />
      
      <AboutSection />
      <FlowerDivider variant="cyan" />
      <FAQSection />
      <FlowerDivider variant="purple" />
      <SponsorSection />
    </div>
  );
}

