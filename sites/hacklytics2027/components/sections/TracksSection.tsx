"use client";

import React from "react";
import { FlowerAccent } from '../FloatingFlowers';

// Minimalist Tech Vector Icons for Tracks
const Icons = {
  Finance: () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  ),
  Sports: () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      <path d="M2 12h20"></path>
    </svg>
  ),
  Healthcare: () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
    </svg>
  ),
  Imagination: () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  ),
  Entertainment: () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
      <line x1="7" y1="2" x2="7" y2="22"></line>
      <line x1="17" y1="2" x2="17" y2="22"></line>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <line x1="2" y1="7" x2="7" y2="7"></line>
      <line x1="2" y1="17" x2="7" y2="17"></line>
      <line x1="17" y1="17" x2="22" y2="17"></line>
      <line x1="17" y1="7" x2="22" y2="7"></line>
    </svg>
  )
};

const TrackCard: React.FC<{ title: string; description: string; icon: React.ReactNode; colorClass: string; num: string }> = ({
  title,
  description,
  icon,
  colorClass,
  num
}) => (
  <div className={`group relative w-full h-full glass-panel p-8 md:p-10 flex flex-col justify-between hover:-translate-y-2 transition-all duration-500 overflow-hidden`}>
    
    {/* Abstract Glow on Hover */}
    <div className={`absolute -bottom-20 -right-20 w-64 h-64 ${colorClass.replace('text-', 'bg-')}/20 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}></div>
    
    <div className="flex justify-between items-start mb-12 relative z-10">
      <div className={`text-white group-hover:${colorClass} drop-shadow-md group-hover:drop-shadow-[0_0_15px_currentColor] transition-all duration-300`}>
        {icon}
      </div>
      <span className={`font-mono text-xs font-bold tracking-widest uppercase text-white/40 group-hover:${colorClass} transition-colors duration-300`}>Track {num}</span>
    </div>

    <div className="relative z-10">
      <h3 className={`font-sans text-2xl md:text-3xl font-bold text-white mb-4 uppercase tracking-tighter group-hover:${colorClass} transition-colors duration-300`}>
        {title}
      </h3>
      <p className="font-mono text-sm text-gray-300 leading-relaxed group-hover:text-white transition-colors duration-300">
        {description}
      </p>
    </div>
  </div>
);

export default function TracksSection() {
  return (
    <section id="tracks" className="section-anchor scroll-mt-24 text-white relative">
      <div className="w-full flex flex-col px-4 md:px-12 xl:px-24 mb-16 gap-8">
        
        {/* Section Header */}
        <div className="w-full p-8 md:p-16 glass-panel relative overflow-hidden group">
          <FlowerAccent position="top-left" color="#ccff00" size={42} />
          <FlowerAccent position="bottom-right" color="#00f3ff" size={36} />
          <div className="absolute top-1/2 left-[10%] -translate-y-1/2 w-[300px] h-[300px] bg-bloom-cyan/20 rounded-full blur-[100px] pointer-events-none mix-blend-screen animate-pulse"></div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
            <h1 className="font-sans text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter uppercase drop-shadow-lg">
              The<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-lime to-bloom-cyan bloom-text-glow">Tracks</span>
            </h1>
            
            <div className="md:w-1/3 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-xl group-hover:border-bloom-cyan/50 transition-colors duration-500">
              <p className="font-mono text-sm text-gray-200 uppercase tracking-widest leading-relaxed">
                Explore our <span className="text-bloom-pink font-bold drop-shadow-[0_0_5px_rgba(255,0,127,0.8)]">5 digital tracks</span>. Compete to win overall or track-specific prizes. 
              </p>
            </div>
          </div>
        </div>

        {/* Tracks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 w-full">
          
          <TrackCard
            num="01"
            title="Finance"
            description="Analyze market trends, predict stock movements, and build next-generation fintech solutions."
            icon={<Icons.Finance />}
            colorClass="text-bloom-lime"
          />

          <TrackCard
            num="02"
            title="Sports Analytics"
            description="Dive into player performance data, game strategy, and the future of sports technology."
            icon={<Icons.Sports />}
            colorClass="text-bloom-cyan"
          />

          <TrackCard
            num="03"
            title="Healthcare"
            description="Innovate in bioinformatics, patient care, and personal health technology."
            icon={<Icons.Healthcare />}
            colorClass="text-bloom-pink"
          />

          <TrackCard
            num="04"
            title="Pure Imagination"
            description="Unleash your creativity, explore unconventional ideas, and use data to build the coolest, most unique project."
            icon={<Icons.Imagination />}
            colorClass="text-bloom-purple"
          />
          
          <TrackCard
            num="05"
            title="Entertainment"
            description="Discover how AI is transforming movies, gaming, interactive experiences, and the media landscape."
            icon={<Icons.Entertainment />}
            colorClass="text-bloom-lime"
          />
        </div>
        
      </div>
    </section>
  );
}
