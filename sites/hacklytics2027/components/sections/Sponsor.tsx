"use client";
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

const SPONSORS = {
  gold: [
    { name: 'Intuit', src: '/sponsors/gold_intuit.png', website: 'https://www.intuit.com' },
    { name: 'Databricks', src: '/sponsors/gold_databricks.png', website: 'https://www.databricks.com' },
  ],
  silver: [
    { name: 'Sphinx AI', src: '/sponsors/Silver_SphinxAI.svg', website: 'https://sphinx.ai' },
    { name: 'Growth Factor', src: '/sponsors/silver_growthfactor.svg', website: 'https://www.growthfactor.ai/' },
    { name: 'Assurant', src: '/sponsors/silver_assurant.png', website: 'https://www.assurant.com' },
  ],
  bronze: [
    { name: 'Scale', src: '/sponsors/bronze_scale.png', website: 'https://scale.com/' },
    { name: 'Figma', src: '/sponsors/bronze_figma.svg', website: 'https://www.figma.com' },
    { name: 'D.E. Shaw', src: '/sponsors/bronze_deshaw.png', website: 'https://www.deshaw.com' },
    { name: 'AT&T', src: '/sponsors/bronze_att.png', website: 'https://www.att.com/' },
    { name: 'Actian', src: '/sponsors/bronze_actian.png', website: 'https://www.actian.com'},
  ],
  mini: [
    { name: 'NLP Logix', src: '/sponsors/MiniTier_NLP.png', website: 'https://nlplogix.com/' },
    { name: 'Cox', src: '/sponsors/MiniTier_Cox.png', website: 'https://www.coxautoinc.com/' },
    { name: 'SafetyKit', src: '/sponsors/MiniTier_SafetyKit.svg', website: 'https://www.safetykit.com/' },
    { name: 'Tractian', src: '/sponsors/MiniTier_Tractian.svg', website: 'https://tractian.com' },
    { name: 'Create-X', src: '/sponsors/MiniTier_X.png', website: 'https://create-x.gatech.edu/' },
  ]
};

// Add a specific filter class for light/dark logos
const getLogoStyles = (name: string) => {
  if (name === 'Assurant' || name === 'D.E. Shaw') {
    return "brightness-200 invert"; // Making them white for dark background
  }
  return "";
};

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor scroll-mt-20 border-b border-gridline bg-[#0b0c10] text-white flex flex-col">
      
      {/* Header Area */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-16 md:py-24 border-b border-gridline relative overflow-hidden flex flex-col items-center text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-bloom-pink/5 rounded-full blur-[100px] pointer-events-none"></div>
        
        <h1 className="font-sans text-5xl md:text-8xl font-bold tracking-tighter uppercase relative z-10 mb-8">
          Our <span className="text-bloom-pink">Partners</span>
        </h1>
        
        <a href="https://2025.hacklytics.io/#sponsors" target="_blank" rel="noopener noreferrer" 
           className="relative z-10 border border-gridline bg-black/50 px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-white/[0.05] hover:border-bloom-pink transition-colors group flex items-center gap-4">
          <span className="w-2 h-2 rounded-full bg-bloom-cyan group-hover:animate-ping"></span>
          View 2025 Sponsors
        </a>
      </div>

      {/* Grid Section for Sponsors */}
      <div className="w-full flex flex-col">
        
        {/* Gold Tier */}
        <div className="border-b border-gridline relative overflow-hidden p-8 md:p-16">
          <div className="absolute top-0 left-0 w-1 h-full bg-bloom-lime"></div>
          <div className="font-mono text-sm uppercase tracking-widest text-bloom-lime mb-8 text-center">Titanium Tier</div>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 relative z-10">
            {SPONSORS.gold.map((s) => (
              <a key={s.name} href={s.website} target="_blank" rel="noopener noreferrer"
                className="group border border-gridline bg-black/50 hover:bg-white/[0.02] p-8 md:p-12 transition-colors flex items-center justify-center w-[300px] h-[160px] md:w-[400px] md:h-[200px]">
                <Image src={s.src} alt={s.name} width={300} height={150} className={`object-contain max-h-full filter grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 ${getLogoStyles(s.name)}`} />
              </a>
            ))}
          </div>
        </div>

        {/* Silver Tier */}
        <div className="border-b border-gridline relative overflow-hidden p-8 md:p-16 bg-[#0b0c10]/80">
          <div className="absolute top-0 left-0 w-1 h-full bg-bloom-cyan"></div>
          <div className="font-mono text-sm uppercase tracking-widest text-bloom-cyan mb-8 text-center">Platinum Tier</div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 relative z-10">
            {SPONSORS.silver.map((s) => (
              <a key={s.name} href={s.website} target="_blank" rel="noopener noreferrer"
                className="group border border-gridline bg-black/30 hover:bg-white/[0.02] p-6 transition-colors flex items-center justify-center w-[240px] h-[120px] md:w-[320px] md:h-[160px]">
                <Image src={s.src} alt={s.name} width={240} height={120} className={`object-contain max-h-full filter grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 ${getLogoStyles(s.name)}`} />
              </a>
            ))}
          </div>
        </div>

        {/* Bronze & Mini Tier Combined */}
        <div className="border-b border-gridline relative overflow-hidden p-8 md:p-16">
          <div className="absolute top-0 left-0 w-1 h-full bg-white/20"></div>
          <div className="font-mono text-sm uppercase tracking-widest text-gray-500 mb-8 text-center">Gold & Silver Tiers</div>
          <div className="flex flex-wrap justify-center gap-4 md:gap-6 relative z-10 max-w-6xl mx-auto">
            {[...SPONSORS.bronze, ...SPONSORS.mini].map((s) => (
              <a key={s.name} href={s.website} target="_blank" rel="noopener noreferrer"
                className="group border border-gridline bg-black/20 hover:bg-white/[0.02] p-4 transition-colors flex items-center justify-center w-[180px] h-[90px] md:w-[220px] md:h-[110px]">
                <Image src={s.src} alt={s.name} width={180} height={90} className={`object-contain max-h-full filter grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 ${getLogoStyles(s.name)}`} />
              </a>
            ))}
          </div>
        </div>

      </div>

      {/* Become a Sponsor Call to Action */}
      <div className="w-full px-6 md:px-12 xl:px-24 py-16 md:py-32 border-b border-gridline relative overflow-hidden flex flex-col items-center text-center bg-bloom-pink/5">
        <h3 className="font-sans text-3xl md:text-5xl font-bold uppercase tracking-tighter text-white mb-4">
          Want to Partner With Us?
        </h3>
        <p className="font-mono text-sm text-gray-400 uppercase tracking-widest mb-10 max-w-lg leading-relaxed">
          Help us empower the next generation of data scientists and engineers.
        </p>

        <a
          href="mailto:hello@hacklytics.io"
          className="border border-bloom-pink bg-black text-bloom-pink font-mono text-sm uppercase tracking-widest px-8 py-4 hover:bg-bloom-pink hover:text-black transition-colors"
        >
          Contact Us
        </a>
      </div>

      {/* Brutalist Footer */}
      <footer className="w-full px-6 md:px-12 py-12 bg-black border-t-8 border-gridline relative overflow-hidden flex flex-col gap-12">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
          {/* Brand */}
          <div>
            <h2 className="font-sans text-3xl font-bold uppercase tracking-tighter text-white mb-2">Hacklytics 2027</h2>
            <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">
              By Data Science @ Georgia Tech
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-6 font-mono text-xs uppercase tracking-widest text-gray-400">
            <Link href="mailto:hello@hacklytics.io" className="hover:text-bloom-pink transition-colors">Contact</Link>
            <Link href="https://instagram.com/dsgt" className="hover:text-bloom-pink transition-colors">Instagram</Link>
            <Link href="https://linkedin.com/company/dsgt" className="hover:text-bloom-pink transition-colors">LinkedIn</Link>
            <Link href="https://datasciencegt.org" className="hover:text-bloom-pink transition-colors">DSGT</Link>
            <Link href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" className="hover:text-bloom-pink transition-colors">Code of Conduct</Link>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="pt-8 border-t border-gridline flex flex-col md:flex-row justify-between items-center gap-4 font-mono text-xs text-gray-600 uppercase tracking-widest">
          <div>&copy; 2027 Data Science @ GT</div>
          <div className="flex items-center gap-2">
            Built with <span className="text-bloom-pink">❤</span> by DSGT Tech
          </div>
        </div>
      </footer>

    </section>
  );
}
