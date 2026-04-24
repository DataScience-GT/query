"use client";
import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Press_Start_2P } from 'next/font/google';

const pixel = Press_Start_2P({
  subsets: ['latin'],
  weight: ['400'],
});

const FloatingCandy: React.FC<{ src: string; delay: string; className?: string }> = ({ src, delay, className }) => (
  <div
    className={`absolute pointer-events-none animate-float ${className}`}
    style={{ animationDelay: delay }}
  >
    <Image src={src} alt="Candy" width={60} height={60} className="object-contain drop-shadow-lg drop-shadow-[0_0_10px_var(--neon-pink)]" />
  </div>
);

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

const getLogoStyles = (name: string) => {
  if (name === 'Assurant' || name === 'D.E. Shaw') {
    return "brightness-0";
  }
  return "";
};

export default function SponsorsSection() {
  return (
    <section
      id="sponsors"
      className="section-anchor scroll-mt-28 relative bg-retro-gradient overflow-hidden flex flex-col justify-between min-h-[80vh]"
    >
      {/* Decorations */}
      <div className="absolute top-20 left-[-60px] w-56 h-36 opacity-30 animate-drift drop-shadow-[0_0_25px_#ec4899]" style={{ animationDelay: '0s' }}>
        <Image src="/cloud-main/largecloud.png" alt="" fill className="object-contain drop-shadow-[0_0_25px_#ec4899]" />
      </div>
      <div className="absolute top-40 right-[-50px] w-64 h-40 opacity-40 animate-drift drop-shadow-[0_0_25px_#06b6d4]" style={{ animationDelay: '2s' }}>
        <Image src="/cloud-main/midCloud.png" alt="" fill className="object-contain drop-shadow-[0_0_25px_#06b6d4]" />
      </div>

      <FloatingCandy src="/small-candy/yellow.png" delay="0s" className="top-32 left-[15%] rotate-12" />
      <FloatingCandy src="/small-candy/pink.png" delay="2s" className="top-60 right-[20%] -rotate-12" />

      {/* Main content */}
      <div className="container mx-auto px-6 pt-20 md:pt-32 flex flex-col items-center text-center z-10">
        <div className="relative mb-12 w-full max-w-5xl">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-neon-cyan/20 blur-3xl rounded-full -z-10"></div>
            <h1
              className="font-pixel text-7xl md:text-9xl text-neon-cyan mb-4 drop-shadow-[0_0_30px_var(--neon-cyan)] animate-fade-in-up transform hover:scale-105 transition-transform duration-300"
              style={{ WebkitTextStroke: "2px #00ffff" }}
            >
              SPONSORS
            </h1>

            {/* Pinned Note for Past Sponsors */}
            <div className="relative mt-12 md:mt-0 md:absolute md:-right-16 md:top-1/2 md:-translate-y-1/2 z-40 animate-fade-in-up flex justify-center md:justify-end" style={{ animationDelay: '0.6s' }}>
                <div className="group transform rotate-3 hover:rotate-0 transition-transform duration-300 w-64 cursor-pointer">
                    <a href="https://2025.hacklytics.io/#sponsors" target="_blank" rel="noopener noreferrer" className="block">
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-50 filter drop-shadow-sm">
                            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M20 38L20 12" stroke="#9CA3AF" strokeWidth="3" strokeLinecap="round"/>
                              <circle cx="20" cy="10" r="8" fill="#DC2626" stroke="#991B1B" strokeWidth="2"/>
                              <circle cx="22" cy="8" r="3" fill="#FECACA" fillOpacity="0.5"/>
                            </svg>
                        </div>

                        <div className="bg-neon-pink/20 text-white p-6 pt-8 rounded-sm shadow-lg border border-neon-pink/40 relative hover:shadow-[0_0_30px_#ec4899] transition-shadow duration-300">
                            <div className="absolute bottom-0 right-0 border-t-[24px] border-t-neon-pink border-r-[24px] border-r-transparent shadow-sm"></div>
                            <p className="font-medium text-xl leading-relaxed font-handwriting text-center mb-2">
                              See who sponsored last year!
                            </p>
                            <p className={`${pixel.className} text-2xl font-bold text-neon-cyan text-center underline decoration-wavy decoration-neon-cyan/50`}>
                              View 2025 Sponsors
                            </p>
                        </div>
                    </a>
                </div>
            </div>
        </div>

        {/* LOGO GRID SECTION */}
        <div className="relative flex flex-col items-center max-w-6xl w-full px-4 z-20 mb-16 space-y-12 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>

          {/* Gold Tier */}
          <div className="flex flex-wrap justify-center gap-10">
            {SPONSORS.gold.map((s) => (
              <a key={s.name} href={s.website} target="_blank" rel="noopener noreferrer"
                className="group bg-white/80 backdrop-blur-md p-10 rounded-3xl border-4 border-neon-yellow shadow-[0_0_30px_#fbbf24] hover:border-neon-pink hover:scale-105 transition-all duration-300 w-96 h-52 flex items-center justify-center overflow-hidden">
                <Image src={s.src} alt={s.name} width={300} height={150} className={`object-contain max-h-full transition-transform group-hover:scale-110 ${getLogoStyles(s.name)}`} />
              </a>
            ))}
          </div>

          {/* Silver Tier */}
          <div className="flex flex-wrap justify-center gap-8">
            {SPONSORS.silver.map((s) => (
              <a key={s.name} href={s.website} target="_blank" rel="noopener noreferrer"
                className="group bg-white/70 backdrop-blur-md p-8 rounded-2xl border-4 border-neon-yellow/50 shadow-[0_0_20px_#fbbf24] hover:border-neon-pink hover:scale-105 transition-all duration-300 w-80 h-44 flex items-center justify-center overflow-hidden"
              >
                <Image src={s.src} alt={s.name} width={240} height={120} className={`object-contain max-h-full transition-transform group-hover:scale-110 ${getLogoStyles(s.name)}`} />
              </a>
            ))}
          </div>

          {/* Bronze & Mini Tier Combined */}
          <div className="flex flex-wrap justify-center gap-6">
            {[...SPONSORS.bronze, ...SPONSORS.mini].map((s) => (
              <a key={s.name} href={s.website} target="_blank" rel="noopener noreferrer"
                className="group bg-white/60 backdrop-blur-sm p-6 rounded-xl border-2 border-stone-300 shadow-md hover:border-neon-pink hover:shadow-[0_0_20px_#ec4899] hover:scale-105 transition-all duration-300 w-60 h-32 flex items-center justify-center"
              >
                <Image src={s.src} alt={s.name} width={180} height={90} className={`object-contain max-h-full ${getLogoStyles(s.name)}`} />
              </a>
            ))}
          </div>
        </div>

        {/* Become a Sponsor Card */}
        <div className="relative flex flex-col items-center max-w-4xl w-full px-4 z-20">
          <div className="group relative animate-fade-in-up w-full max-w-xl z-30" style={{ animationDelay: '0.4s' }}>
            <div className="relative bg-white/90 backdrop-blur-sm rounded-[2rem] px-10 py-8 border-[4px] border-neon-yellow shadow-[0_0_30px_#fbbf24] flex flex-col items-center text-center transform transition-transform duration-300 hover:scale-[1.02]">
              <h3 className={`${pixel.className} text-4xl md:text-5xl font-bold text-gray-800 mb-2`}>
                Partner With Us
              </h3>
              <p className="text-gray-600 font-medium text-lg md:text-xl leading-relaxed mb-6 max-w-md">
                Help us build a world of pure imagination for hackers everywhere.
              </p>

              <a
                href="mailto:hello@hacklytics.io"
                className={`${pixel.className} inline-block bg-neon-pink text-white text-xl md:text-2xl font-bold px-8 py-3 rounded-full shadow-[0_6px_0_#991b1b] hover:shadow-[0_3px_0_#991b1b] hover:translate-y-[3px] transition-all uppercase tracking-wider whitespace-nowrap border-4 border-red-800 relative overflow-hidden`}
              >
                <span className="relative z-10">Become a Sponsor</span>
                <div className="absolute inset-0 -translate-x-full hover:animate-[shine_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0"></div>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom clouds and Footer */}
      <div className="relative w-full h-40 md:h-48 flex justify-center items-end mt-16">
        <div className="absolute left-0 bottom-0 z-10 w-2/3 h-full md:w-[800px] -translate-x-1/4 animate-drift" style={{ animationDelay: '0s' }}>
          <Image src="/cloud-final/image.png" alt="Cloud left" fill className="object-cover object-bottom opacity-90" priority />
        </div>
        <div className="absolute bottom-0 z-20 w-full h-full md:w-[800px] animate-drift" style={{ animationDelay: '3.5s' }}>
          <Image src="/cloud-final/image.png" alt="Cloud center" fill className="object-cover object-bottom opacity-90" priority />
        </div>
        <div className="absolute right-0 bottom-0 z-10 w-2/3 h-full md:w-[800px] translate-x-1/4 animate-drift" style={{ animationDelay: '7s' }}>
          <Image src="/cloud-final/image.png" alt="Cloud right" fill className="object-cover object-bottom opacity-90" priority />
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-30 w-full bg-gradient-to-t from-white/80 to-transparent pt-12 pb-6 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className={`flex flex-wrap gap-6 text-stone-600 text-sm md:text-base font-bold tracking-wide uppercase ${pixel.className}`}>
              <Link href="mailto:hello@hacklytics.io" className="hover:text-neon-pink transition-colors">Contact Us</Link>
              <Link href="https://instagram.com/dsgt" className="hover:text-neon-pink transition-colors">Instagram</Link>
              <Link href="https://linkedin.com/company/dsgt" className="hover:text-neon-pink transition-colors">LinkedIn</Link>
              <Link href="https://datasciencegt.org" className="hover:text-neon-pink transition-colors">DSGT</Link>
              <Link href="https://static.mlh.io/docs/mlh-code-of-conduct.pdf" className="hover:text-neon-pink transition-colors">Code of Conduct</Link>
            </div>
            <div className="text-stone-500 text-xs md:text-sm font-medium flex items-center gap-2">
              <span>Made with 💖 by <span className="font-bold text-stone-700">DSGT Tech</span></span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes drift {
          0%, 100% { transform: translateX(0px); }
          50% { transform: translateX(30px); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(var(--tw-rotate)); }
          50% { transform: translateY(-20px) rotate(calc(var(--tw-rotate) + 5deg)); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shine {
          to { transform: translateX(100%); }
        }
        .animate-drift { animation: drift 10s ease-in-out infinite; }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-fade-in-up { animation: fade-in-up 0.8s ease-out forwards; opacity: 0; }
      `}</style>
    </section>
  );
};
