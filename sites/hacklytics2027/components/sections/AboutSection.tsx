"use client";
import React from 'react';

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor scroll-mt-20 border-b border-gridline bg-[#0b0c10] text-white">
      <div className="w-full flex flex-col">
        {/* Section Header */}
        <div className="w-full px-6 md:px-12 xl:px-24 py-12 md:py-24 border-b border-gridline bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.05%22/%3E%3C/svg%3E')] relative overflow-hidden">
          {/* Abstract bloom glow */}
          <div className="absolute top-0 right-[20%] w-96 h-96 bg-bloom-pink/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>
          
          <h1 className="font-sans text-5xl md:text-8xl font-bold tracking-tighter uppercase mb-4 relative z-10">
            About<br />
            <span className="text-bloom-cyan">The Event</span>
          </h1>
        </div>

        {/* Dense 2-Column Layout Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 w-full">
          {/* Left Column: Main Story Card */}
          <div className="md:col-span-7 border-b md:border-b-0 md:border-r border-gridline p-6 md:p-12 xl:p-24 relative group transition-colors hover:bg-white/[0.02]">
            <div className="relative z-10">
              <h2 className="font-sans text-3xl md:text-5xl font-bold text-white mb-8 tracking-tight group-hover:text-bloom-pink transition-colors">
                A Hub of Innovation
              </h2>

              <div className="space-y-6 text-gray-400 font-mono text-sm md:text-base leading-relaxed">
                <p>
                  <span className="text-white font-bold">Hacklytics</span> is a <span className="bg-bloom-pink/20 text-bloom-pink px-2 py-0.5 rounded-none border border-bloom-pink/50 uppercase tracking-widest text-xs">36-hour data science hackathon</span> hosted by Data Science @ GT.
                </p>
                <p>
                  We invite hackers from across the globe to dive into the <span className="text-bloom-cyan">digital bloom</span>. Experience the bleeding edge of AI, machine learning, and data analytics in a high-octane environment.
                </p>
                <p>
                  Tackle challenges across 5 exciting tracks, fuel your curiosity, and uncover the rewards of solving complex problems with code.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Stacked Info Cards */}
          <div className="md:col-span-5 flex flex-col">
            {/* Where & When Card */}
            <div className="p-6 md:p-12 xl:p-16 border-b border-gridline group transition-colors hover:bg-white/[0.02] flex-1">
              <h3 className="font-sans text-2xl font-bold text-bloom-lime mb-6 tracking-tighter uppercase flex items-center gap-4">
                <span className="w-8 h-[1px] bg-bloom-lime hidden sm:block"></span>
                Where & When?
              </h3>
              
              <div className="font-mono text-white space-y-4">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-widest">Date</span>
                  <span className="text-lg">Feb. 20 - 22, 2027</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-widest">Location</span>
                  <span className="text-lg">Klaus Advanced Computing Building</span>
                  <span className="text-bloom-cyan text-sm mt-1">Georgia Tech Campus</span>
                </div>
              </div>
            </div>

            {/* Why Join Us Card */}
            <div className="p-6 md:p-12 xl:p-16 group transition-colors hover:bg-white/[0.02] flex-1">
              <h3 className="font-sans text-2xl font-bold text-bloom-purple mb-6 tracking-tighter uppercase flex items-center gap-4">
                <span className="w-8 h-[1px] bg-bloom-purple hidden sm:block"></span>
                Why Join Us?
              </h3>

              <div className="space-y-4 text-gray-300 font-mono text-sm">
                <div className="flex items-center gap-4 border border-gridline p-4 hover:border-bloom-purple transition-colors">
                  <span className="text-bloom-purple font-bold">01</span>
                  <p className="uppercase tracking-wide">Build projects that matter</p>
                </div>
                <div className="flex items-center gap-4 border border-gridline p-4 hover:border-bloom-purple transition-colors">
                  <span className="text-bloom-purple font-bold">02</span>
                  <p className="uppercase tracking-wide">Connect with hackers</p>
                </div>
                <div className="flex items-center gap-4 border border-gridline p-4 hover:border-bloom-purple transition-colors">
                  <span className="text-bloom-purple font-bold">03</span>
                  <p className="uppercase tracking-wide">Free food, swag, & prizes!</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
