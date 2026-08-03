"use client";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";

// ─── Elegant Floral Background ─────────────────────────────────────────────
const FloralBackground = () => (
  <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#020204]">
    {/* Subtle grid base */}
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />

    {/* Center majestic digital bloom (Abstract rotating lotus) */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-30 mix-blend-screen animate-spin-slow">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-full border border-bloom-pink/20 bg-gradient-to-t from-bloom-pink/5 to-transparent backdrop-blur-3xl transition-transform"
          style={{
            transform: `rotate(${i * 30}deg) scaleY(2.5) scaleX(0.3)`,
            transformOrigin: "center center",
          }}
        />
      ))}
    </div>
    
    {/* Secondary Bloom */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20 mix-blend-screen animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '40s' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-full border border-bloom-cyan/30 bg-gradient-to-t from-bloom-cyan/10 to-transparent backdrop-blur-2xl transition-transform"
          style={{
            transform: `rotate(${i * 45}deg) scaleY(2) scaleX(0.4)`,
            transformOrigin: "center center",
          }}
        />
      ))}
    </div>

    {/* Ambient light fields */}
    <div className="absolute top-0 left-1/4 w-[40vw] h-[40vw] bg-bloom-pink/10 blur-[120px] rounded-full mix-blend-screen mix-blend-screen animate-pulse duration-10000" />
    <div className="absolute bottom-0 right-1/4 w-[50vw] h-[50vw] bg-bloom-cyan/10 blur-[150px] rounded-full mix-blend-screen animate-pulse duration-7000" />
  </div>
);

// ─── Countdown ────────────────────────────────────────────────────────────
const Countdown: React.FC<{ targetDate: Date }> = ({ targetDate }) => {
  const getTimeLeft = React.useCallback(() => {
    const distance = targetDate.getTime() - Date.now();
    if (distance <= 0) return null;
    return {
      days:    Math.floor(distance / (1000 * 60 * 60 * 24)),
      hours:   Math.floor((distance / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((distance / (1000 * 60)) % 60),
      seconds: Math.floor((distance / 1000) % 60),
    };
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTimeLeft(getTimeLeft());
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [getTimeLeft]);

  const fmt = (n?: number) => String(n ?? 0).padStart(2, "0");

  const units = [
    { label: "Days",    value: timeLeft?.days,    color: "text-white" },
    { label: "Hours",   value: timeLeft?.hours,   color: "text-white/80" },
    { label: "Minutes", value: timeLeft?.minutes, color: "text-white/60" },
    { label: "Seconds", value: timeLeft?.seconds, color: "text-white/40" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 mt-12 md:mt-20">
      {units.map(({ label, value, color }) => (
        <div key={label} className="flex flex-col items-center">
          <span className={`font-sans font-light text-5xl md:text-7xl tracking-tighter ${mounted ? color : "text-white/10"} transition-colors duration-1000`}>
            {mounted ? fmt(value) : "00"}
          </span>
          <span className="font-mono text-[10px] md:text-xs text-white/40 uppercase tracking-[0.3em] mt-3">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <main className="relative w-full text-white bg-[#020204] overflow-x-hidden selection:bg-bloom-pink/30 selection:text-white min-h-screen">
      
      <FloralBackground />

      {/* ── HERO ── */}
      <section className="relative w-full min-h-screen flex flex-col justify-center items-center overflow-hidden">
        
        {/* MLH badge */}
        <a
          href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
          target="_blank"
          className="absolute top-0 right-5 md:right-12 z-50 w-[9%] max-w-[90px] min-w-[56px] hover:scale-105 hover:brightness-110 transition-all duration-300"
        >
          <img src="/mlh-trust-badge.svg" alt="Major League Hacking 2027" className="w-full drop-shadow-2xl" />
        </a>

        {/* Hero content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-32 pb-20 md:pt-48 md:pb-32 flex flex-col items-center text-center animate-fade-in-up">

          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-2xl mb-10 hover:bg-white/10 transition-all duration-500 cursor-pointer group shadow-[0_0_30px_rgba(255,255,255,0.03)]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bloom-pink opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-bloom-pink"></span>
            </span>
            <span className="font-mono text-[10px] md:text-xs text-white/70 group-hover:text-white uppercase tracking-[0.25em] transition-colors">
              Data Science @ Georgia Tech
            </span>
          </div>

          {/* Main title - Elegantly oversized, tight tracking */}
          <h1 className="font-sans font-medium text-[16vw] sm:text-[14vw] md:text-[11vw] lg:text-[10rem] xl:text-[12rem] leading-[0.8] tracking-[-0.04em] mb-8 drop-shadow-2xl text-white mix-blend-plus-lighter">
            Hacklytics
          </h1>

          <p className="font-sans text-lg md:text-xl lg:text-2xl text-white/50 max-w-2xl mx-auto leading-relaxed mb-12 font-light tracking-wide">
            36 hours of intelligence, innovation, and digital bloom. <br className="hidden md:block"/>
            Join 1,000+ hackers in Atlanta, GA.
          </p>

          {/* Framer-style CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 w-full sm:w-auto">
            <a
              href="https://form.typeform.com/to/GvqBCdAe"
              target="_blank"
              rel="noopener noreferrer"
              className="relative inline-flex items-center justify-center px-10 py-4 font-sans font-medium text-sm tracking-widest text-black bg-white rounded-full overflow-hidden group w-full sm:w-auto hover:scale-105 transition-transform duration-500 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
            >
              <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-bloom-pink via-bloom-purple to-bloom-cyan opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="relative flex items-center gap-3 group-hover:text-white transition-colors duration-500">
                APPLY NOW
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            </a>
            
            <a
              href="#about"
              className="inline-flex items-center justify-center px-10 py-4 font-sans font-medium text-sm tracking-widest text-white/70 bg-transparent border border-white/20 rounded-full hover:bg-white/5 hover:text-white hover:border-white/40 transition-all duration-500 w-full sm:w-auto"
            >
              EXPLORE
            </a>
          </div>

          <Countdown targetDate={new Date("2027-02-26T23:59:59")} />

        </div>
        
        {/* Subtle scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50 animate-bounce">
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/50">Scroll</span>
          <div className="w-[1px] h-12 bg-gradient-to-b from-white/50 to-transparent" />
        </div>
      </section>

      <div className="relative z-10 bg-[#020204]/80 backdrop-blur-3xl border-t border-white/5">
        <HomeSections />
      </div>
      
      {/* Required for the spin animation if not in tailwind config */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin-slow {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 60s linear infinite;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
    </main>
  );
}
