// components/HomeSections.tsx

"use client";

import React from 'react';
import AboutSection from './sections/AboutSection';
import FAQSection from './sections/FAQSection';
import SponsorSection from './sections/Sponsor';

export default function HomeSections() {
  return (
    <>
      <AboutSection />
      <FAQSection />
      <SponsorSection />
    </>
  );
}
