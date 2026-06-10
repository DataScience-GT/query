"use client";
import React from 'react';
import { FlowerAccent } from '../FloatingFlowers';

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor scroll-mt-24 text-white relative">
      <div className="w-full flex flex-col gap-6 md:gap-8 px-4 md:px-12 xl:px-24 mb-16">
        
        {/* Section Header */}
        <div className="w-full p-8 md:p-16 glass-panel relative overflow-hidden group hover:border-bloom-cyan/50 transition-colors duration-500">
          {/* Abstract bloom glow */}
          <div className="absolute top-1/2 right-[10%] -translate-y-1/2 w-[300px] h-[300px] bg-bloom-pink/20 rounded-full blur-[100px] pointer-events-none mix-blend-screen group-hover:scale-110 transition-transform duration-700"></div>
          <FlowerAccent position="top-right" color="#ff66b2" size={50} />
          <FlowerAccent position="bottom-left" color="#cc44ff" size={38} />
          
          <h1 className="font-sans text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter uppercase mb-4 relative z-10 drop-shadow-lg">
            About<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-cyan to-bloom-lime bloom-text-glow">The Event</span>
          </h1>
        </div>

        {/* 2-Column Layout */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 w-full">
          
          {/* Left Column: Main Story Card */}
          <div className="flex-[3] glass-panel p-8 md:p-12 xl:p-16 relative group transition-all duration-500 hover:border-bloom-pink/50 hover:shadow-[0_0_30px_rgba(255,0,127,0.15)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-bloom-purple/10 rounded-full blur-[50px] pointer-events-none group-hover:bg-bloom-purple/20 transition-colors"></div>
            <div className="relative z-10">
              <h2 className="font-sans text-3xl md:text-5xl font-bold text-white mb-8 tracking-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-bloom-pink transition-all duration-500">
                A Hub of Innovation
              </h2>

              <div className="space-y-6 text-gray-300 font-mono text-sm md:text-base leading-relaxed relative z-10">
                <p>
                  <span className="text-white font-bold text-lg">Hacklytics</span> is a <span className="bg-bloom-pink/10 text-bloom-pink px-2 py-1 rounded-md border border-bloom-pink/30 uppercase tracking-widest text-xs font-bold shadow-[0_0_10px_rgba(255,0,127,0.2)]">36-hour data science hackathon</span> hosted by Data Science @ GT.
                </p>
                <p>
                  We invite hackers from across the globe to dive into the <span className="text-bloom-cyan font-bold drop-shadow-[0_0_5px_rgba(0,243,255,0.8)]">digital bloom</span>. Experience the bleeding edge of AI, machine learning, and data analytics in a high-octane environment.
                </p>
                <p>
                  Collaborate with peers, fuel your curiosity, and uncover the rewards of solving complex problems with code.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Stacked Info Cards */}
          <div className="flex-[2] flex flex-col gap-6 md:gap-8">
            
            {/* Where & When Card */}
            <div className="glass-panel p-8 md:p-10 relative overflow-hidden group transition-all duration-500 hover:border-bloom-lime/50 hover:shadow-[0_0_30px_rgba(204,255,0,0.1)] flex-1">
              <FlowerAccent position="top-right" color="#ccff00" size={30} />
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-bloom-lime/10 rounded-full blur-[40px] pointer-events-none"></div>
              
              <h3 className="font-sans text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-bloom-lime to-white mb-6 tracking-tighter uppercase flex items-center gap-4">
                <span className="w-8 h-[2px] bg-gradient-to-r from-bloom-lime to-transparent"></span>
                Where & When?
              </h3>
              
              <div className="font-mono text-white space-y-6 relative z-10">
                <div className="flex flex-col bg-white/5 p-4 rounded-xl border border-white/5 group-hover:border-white/10 transition-colors">
                  <span className="text-xs text-bloom-lime uppercase tracking-widest font-bold mb-1">Date</span>
                  <span className="text-lg">Feb. 26 - 28, 2027</span>
                </div>
                <div className="flex flex-col bg-white/5 p-4 rounded-xl border border-white/5 group-hover:border-white/10 transition-colors">
                  <span className="text-xs text-bloom-cyan uppercase tracking-widest font-bold mb-1">Location</span>
                  <span className="text-lg">Klaus Advanced Computing</span>
                  <span className="text-gray-400 text-sm mt-1">Georgia Tech Campus</span>
                </div>
              </div>
            </div>

            {/* Why Join Us Card */}
            <div className="glass-panel p-8 md:p-10 relative overflow-hidden group transition-all duration-500 hover:border-bloom-cyan/50 hover:shadow-[0_0_30px_rgba(0,243,255,0.15)] flex-1">
              <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-bloom-cyan/10 rounded-full blur-[40px] pointer-events-none"></div>

              <h3 className="font-sans text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-bloom-cyan to-white mb-6 tracking-tighter uppercase flex items-center gap-4">
                <span className="w-8 h-[2px] bg-gradient-to-r from-bloom-cyan to-transparent"></span>
                Why Join Us?
              </h3>

              <div className="space-y-3 text-gray-200 font-mono text-sm relative z-10">
                {[
                  "Build projects that matter",
                  "Connect with hackers",
                  "Free food, swag, & networking!"
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5 hover:border-bloom-cyan/50 hover:bg-white/10 transition-colors group/item">
                    <span className="text-bloom-cyan font-bold group-hover/item:text-white transition-colors">0{i+1}</span>
                    <p className="uppercase tracking-wide font-bold">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
