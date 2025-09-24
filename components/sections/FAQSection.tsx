"use client";

import React from 'react';
import CloudBlueButton from '../ui/CloudButtonBlue';

export default function FAQSection() {
  return (
    <section id="tracks" className="section-anchor scroll-mt-28 min-h-screen bg-blue-300">
      <div className="container mx-auto px-4 py-24 max-w-6xl">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-8 drop-shadow-lg">
            Tracks
          </h1>
          {/* Changed "five" to "eight" to reflect the new number of tracks */}
          <p className="text-white text-lg leading-relaxed max-w-4xl mx-auto">
            We’re offering <strong>eight magical tracks</strong> that blend data science with diverse domains, inviting you to explore imaginative solutions to the problems that matter to you most. Even if you don’t take home an overall prize, <strong>each track offers its own set of prizes</strong>, so your most inventive ideas still have a chance to shine.
          </p>
        </div>

        {/* The grid now contains eight items, which will naturally form a 4x2 layout on medium screens and up */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-16 gap-x-12 max-w-5xl mx-auto items-start justify-items-center">
          <CloudBlueButton title="Finance">
            <p className="font-semibold">Analyze market trends, predict stock movements, and build fintech solutions.</p>
          </CloudBlueButton>
          
          <CloudBlueButton title="Sports Analytics">
            <p className="font-semibold">Dive into player performance, game strategy, and the future of sports data.</p>
          </CloudBlueButton>
          
          <CloudBlueButton title="Health & Wellness">
            <p className="font-semibold">Innovate in bioinformatics, patient care, and personal health technology.</p>
          </CloudBlueButton>
          
          <CloudBlueButton title="Generative AI">
            <p className="font-semibold">Explore the creative frontier of AI in art, music, and content creation.</p>
          </CloudBlueButton>
          
          {/* Removed the wrapper div from Smart Cities to make it a standard grid item */}
          <CloudBlueButton title="Smart Cities">
            <p className="font-semibold">Use data to improve urban living, transportation, and sustainability.</p>
          </CloudBlueButton>

          {/* Added three new tracks to bring the total to eight */}
          <CloudBlueButton title="Education">
            <p className="font-semibold">Personalize learning paths and create new tools for student engagement.</p>
          </CloudBlueButton>

          <CloudBlueButton title="Environment & Sustainability">
            <p className="font-semibold">Model climate change, optimize energy use, and promote conservation.</p>
          </CloudBlueButton>

          <CloudBlueButton title="Entertainment & Media">
            <p className="font-semibold">Analyze audience behavior and innovate in content recommendation.</p>
          </CloudBlueButton>
        </div>
      </div>
    </section>
  );
};