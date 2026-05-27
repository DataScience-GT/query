"use client";
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor scroll-mt-20 border-b border-gridline bg-black text-white flex flex-col relative overflow-hidden min-h-screen">
      
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0 opacity-40 mix-blend-screen">
        <Image 
          src="/digital-bloom-bg.png" 
          alt="Digital Bloom Binary Background" 
          fill 
          className="object-cover object-center"
          priority
        />
        {/* Colorful gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-bloom-pink/20 to-bloom-cyan/20 mix-blend-overlay"></div>
      </div>

      {/* Content Area */}
      <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 md:px-12 py-24 md:py-32 text-center mt-20">
        
        {/* Glow behind text */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-bloom-cyan/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-bloom-pink/20 rounded-full blur-[80px] pointer-events-none"></div>

        <div className="inline-flex items-center gap-3 border border-bloom-cyan/30 bg-black/60 backdrop-blur-sm px-6 py-2 mb-8 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-bloom-cyan shadow-[0_0_10px_var(--bloom-cyan)]"></span>
          <span className="text-xs font-mono tracking-widest uppercase text-bloom-cyan">Interest Form Open</span>
        </div>

        <h1 className="font-sans text-6xl md:text-8xl lg:text-[10rem] font-bold tracking-tighter uppercase relative z-10 leading-[0.85] mb-6 drop-shadow-2xl">
          <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-bloom-pink to-bloom-cyan">Our</span> <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-br from-bloom-cyan via-bloom-lime to-white">Partners</span>
        </h1>
        
        <p className="font-mono text-sm md:text-lg text-gray-300 uppercase tracking-widest mb-12 max-w-2xl leading-relaxed bg-black/40 backdrop-blur-md p-6 border-l-4 border-bloom-pink">
          We are currently looking for visionary sponsors for Hacklytics 2027. Help us empower the next generation of data scientists and engineers.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 items-center">
          <a
            href="mailto:hello@hacklytics.io"
            className="group relative border border-bloom-pink bg-black/50 backdrop-blur-sm px-8 py-4 font-mono text-sm uppercase tracking-widest hover:border-bloom-cyan overflow-hidden transition-all duration-500"
          >
            <span className="relative z-10 text-white group-hover:text-bloom-cyan font-bold transition-colors">Become a Sponsor</span>
            <div className="absolute inset-0 w-0 bg-bloom-pink/20 group-hover:w-full transition-all duration-500 ease-out"></div>
          </a>

          <a href="https://2025.hacklytics.io/#sponsors" target="_blank" rel="noopener noreferrer" 
             className="relative z-10 border border-gridline bg-black/80 backdrop-blur-sm px-6 py-4 font-mono text-sm uppercase tracking-widest hover:bg-white/[0.05] hover:border-white transition-colors group flex items-center gap-4 text-gray-400 hover:text-white">
            <span className="w-2 h-2 rounded-full bg-gray-500 group-hover:bg-white transition-colors"></span>
            View 2025 Sponsors
          </a>
        </div>
      </div>

      {/* Brutalist Footer with color touches */}
      <footer className="w-full px-6 md:px-12 py-12 bg-black/80 backdrop-blur-lg border-t border-gridline relative z-10 flex flex-col gap-12">
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
