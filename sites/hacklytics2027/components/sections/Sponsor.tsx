"use client";
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FlowerAccent } from '../FloatingFlowers';

const goldSponsors = [
  { name: 'Databricks', logo: '/sponsors/gold_databricks.png' },
  { name: 'Intuit', logo: '/sponsors/gold_intuit.png' },
];

const silverSponsors = [
  { name: 'Assurant', logo: '/sponsors/silver_assurant.png' },
  { name: 'Growth Factor', logo: '/sponsors/silver_growthfactor.svg' },
  { name: 'Sphinx AI', logo: '/sponsors/Silver_SphinxAI.svg' },
];

const bronzeSponsors = [
  { name: 'Actian', logo: '/sponsors/bronze_actian.png' },
  { name: 'AT&T', logo: '/sponsors/bronze_att.png' },
  { name: 'D.E. Shaw', logo: '/sponsors/bronze_deshaw.png' },
  { name: 'Figma', logo: '/sponsors/bronze_figma.svg' },
  { name: 'Scale AI', logo: '/sponsors/bronze_scale.png' },
];

const miniSponsors = [
  { name: 'Cox', logo: '/sponsors/MiniTier_Cox.png' },
  { name: 'NLP', logo: '/sponsors/MiniTier_NLP.png' },
  { name: 'Safety Kit', logo: '/sponsors/MiniTier_SafetyKit.svg' },
  { name: 'Tractian', logo: '/sponsors/MiniTier_Tractian.svg' },
  { name: 'X', logo: '/sponsors/MiniTier_X.png' },
];

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor scroll-mt-20 border-b border-gridline bg-transparent text-white flex flex-col relative overflow-hidden min-h-screen">
      
      {/* Background Enhancements */}
      <div className="absolute inset-0 z-0 mix-blend-screen pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-t from-[#030408] via-transparent to-[#030408]"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-bloom-pink/5 to-bloom-cyan/5 mix-blend-overlay"></div>
      </div>

      {/* Content Area */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 md:px-12 py-24 md:py-32 text-center mt-20 max-w-7xl mx-auto w-full">
        <FlowerAccent position="top-left" color="#ff007f" size={55} />
        <FlowerAccent position="top-right" color="#00f3ff" size={48} />
        <FlowerAccent position="bottom-left" color="#ccff00" size={40} />
        <FlowerAccent position="bottom-right" color="#9d00ff" size={42} />
        
        {/* Glow behind text */}
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-bloom-cyan/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-[25%] left-1/2 -translate-x-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-bloom-pink/10 rounded-full blur-[80px] pointer-events-none"></div>

        <a href="https://form.typeform.com/to/GvqBCdAe" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 border border-bloom-cyan/30 bg-black/60 px-6 py-2 mb-8 animate-pulse hover:border-bloom-cyan transition-colors rounded-full">
          <span className="w-2 h-2 rounded-full bg-bloom-cyan shadow-[0_0_10px_var(--bloom-cyan)]"></span>
          <span className="text-xs font-mono tracking-widest uppercase text-bloom-cyan">Interest Form Open</span>
        </a>

        <h1 className="font-sans text-5xl md:text-8xl lg:text-[8rem] font-bold tracking-tighter uppercase relative z-10 leading-[0.85] mb-6 drop-shadow-2xl">
          <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-bloom-pink to-bloom-cyan">Our</span> <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-br from-bloom-cyan via-bloom-lime to-white">Partners</span>
        </h1>
        
        <p className="font-mono text-sm md:text-base text-gray-300 uppercase tracking-widest mb-16 max-w-2xl leading-relaxed bg-black/40 p-6 border-l-4 border-bloom-pink">
          Empowering the next generation of data scientists and engineers. Special thanks to our visionary partners.
        </p>

        {/* SPONSORS TIERS */}
        <div className="w-full flex flex-col gap-12 md:gap-16 mb-20 relative z-10">
          
          {/* Gold Tier */}
          <div className="flex flex-col items-center">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] font-bold text-bloom-lime mb-6 drop-shadow-[0_0_5px_currentColor]">Gold Partners</h2>
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 w-full max-w-4xl">
              {goldSponsors.map((s) => (
                <div key={s.name} className="glass-panel px-10 py-8 flex items-center justify-center min-w-[260px] h-[120px] hover:border-bloom-lime/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(204,255,0,0.15)] bg-black/30 group">
                  <div className="relative w-48 h-12 filter brightness-90 group-hover:brightness-100 transition-all duration-300">
                    <Image src={s.logo} alt={s.name} fill className="object-contain" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Silver Tier */}
          <div className="flex flex-col items-center">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] font-bold text-bloom-cyan mb-6 drop-shadow-[0_0_5px_currentColor]">Silver Partners</h2>
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 w-full max-w-4xl">
              {silverSponsors.map((s) => (
                <div key={s.name} className="glass-panel px-8 py-6 flex items-center justify-center min-w-[220px] h-[100px] hover:border-bloom-cyan/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(0,243,255,0.15)] bg-black/30 group">
                  <div className="relative w-36 h-10 filter brightness-90 group-hover:brightness-100 transition-all duration-300">
                    <Image src={s.logo} alt={s.name} fill className="object-contain" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bronze Tier */}
          <div className="flex flex-col items-center">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] font-bold text-bloom-pink mb-6 drop-shadow-[0_0_5px_currentColor]">Bronze Partners</h2>
            <div className="flex flex-wrap justify-center gap-4 md:gap-6 w-full max-w-5xl">
              {bronzeSponsors.map((s) => (
                <div key={s.name} className="glass-panel px-6 py-4 flex items-center justify-center min-w-[180px] h-[80px] hover:border-bloom-pink/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(255,0,127,0.15)] bg-black/30 group">
                  <div className="relative w-28 h-8 filter brightness-90 group-hover:brightness-100 transition-all duration-300">
                    <Image src={s.logo} alt={s.name} fill className="object-contain" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mini Tier */}
          <div className="flex flex-col items-center">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] font-bold text-bloom-purple mb-6 drop-shadow-[0_0_5px_currentColor]">Additional Partners</h2>
            <div className="flex flex-wrap justify-center gap-4 w-full max-w-5xl">
              {miniSponsors.map((s) => (
                <div key={s.name} className="glass-panel px-4 py-3 flex items-center justify-center min-w-[140px] h-[65px] hover:border-bloom-purple/50 transition-all duration-300 hover:-translate-y-1 bg-black/30 group">
                  <div className="relative w-24 h-6 filter brightness-85 group-hover:brightness-100 transition-all duration-300">
                    <Image src={s.logo} alt={s.name} fill className="object-contain" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Sponsorship CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-6 items-center z-10">
          <a
            href="mailto:hello@hacklytics.io"
            className="group relative border border-bloom-pink bg-black/50 px-8 py-4 font-mono text-sm uppercase tracking-widest hover:border-bloom-cyan overflow-hidden transition-all duration-500 rounded-xl"
          >
            <span className="relative z-10 text-white group-hover:text-bloom-cyan font-bold transition-colors">Become a Partner</span>
            <div className="absolute inset-0 w-0 bg-bloom-pink/20 group-hover:w-full transition-all duration-500 ease-out"></div>
          </a>

          <a href="https://2025.hacklytics.io/#sponsors" target="_blank" rel="noopener noreferrer" 
             className="relative z-10 border border-white/10 bg-black/80 px-6 py-4 font-mono text-sm uppercase tracking-widest hover:bg-white/[0.05] hover:border-white transition-colors group flex items-center gap-4 text-gray-400 hover:text-white rounded-xl">
            <span className="w-2 h-2 rounded-full bg-gray-500 group-hover:bg-white transition-colors"></span>
            View 2025 Sponsors
          </a>
        </div>
      </div>

      {/* Brutalist Footer with color touches */}
      <footer className="w-full px-6 md:px-12 py-12 glass-panel border-t border-gridline relative z-10 flex flex-col gap-12 !rounded-none !bg-black/60">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          {/* Brand */}
          <div>
            <h2 className="font-sans text-3xl font-bold uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-bloom-pink to-bloom-cyan mb-2">Hacklytics 2027</h2>
            <p className="font-mono text-xs text-gray-400 uppercase tracking-widest">
              By Data Science @ Georgia Tech
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-6 font-mono text-xs uppercase tracking-widest text-gray-400">
            <Link href="mailto:hello@hacklytics.io" className="hover:text-bloom-cyan transition-colors">Contact</Link>
            <Link href="https://instagram.com/dsgt" className="hover:text-bloom-pink transition-colors">Instagram</Link>
            <Link href="https://linkedin.com/company/dsgt" className="hover:text-bloom-lime transition-colors">LinkedIn</Link>
            <Link href="https://datasciencegt.org" className="hover:text-white transition-colors">DSGT</Link>
            <Link href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" className="hover:text-white transition-colors">Code of Conduct</Link>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="pt-8 border-t border-gridline flex flex-col md:flex-row justify-between items-center gap-4 font-mono text-xs text-gray-500 uppercase tracking-widest">
          <div>&copy; 2027 Data Science @ GT</div>
          <div className="flex items-center gap-2">
            Built with <span className="text-bloom-pink animate-pulse">❤</span> by DSGT Tech
          </div>
        </div>
      </footer>

    </section>
  );
}
