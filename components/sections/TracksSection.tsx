"use client";

import React from 'react';
import CloudButton from '../ui/CloudButton';

export default function TracksSection() {
  return (
    // Corrected the hex code from #A4C7F to #A4C7FF
    <section id="tracks" className="section-anchor scroll-mt-28 min-h-screen" style={{ backgroundColor: '#A4C7FF' }}>
      <div className="container mx-auto px-4 py-24 max-w-6xl">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-white mb-8 drop-shadow-lg">
            Tracks
          </h1>
          <p className="text-white text-lg leading-relaxed max-w-4xl mx-auto">
            We’re offering <strong>five magical tracks</strong> that blend data science with diverse domains, inviting you to explore imaginative solutions to the problems that matter to you most. Even if you don’t take home an overall prize, <strong>each track offers its own set of prizes</strong>, so your most inventive ideas still have a chance to shine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12 max-w-5xl mx-auto items-center justify-items-center">
          
          <CloudButton title="Finance">
            <p className="font-semibold">Analyze market trends, predict stock movements, and build fintech solutions.</p>
          </CloudButton>
          
          <CloudButton title="Sports Analytics">
            <p className="font-semibold">Dive into player performance, game strategy, and the future of sports data.</p>
          </CloudButton>
          
          <CloudButton title="Health & Wellness">
            <p className="font-semibold">Innovate in bioinformatics, patient care, and personal health technology.</p>
          </CloudButton>
          
          <CloudButton title="Generative AI">
            <p className="font-semibold">Explore the creative frontier of AI in art, music, and content creation.</p>
          </CloudButton>
          
          <div className="md:col-span-2 flex justify-center mt-4">
            <CloudButton title="Smart Cities">
              <p className="font-semibold">Use data to improve urban living, transportation, and sustainability.</p>
            </CloudButton>
          </div>

        </div>
      </div>
    </section>
  );
};