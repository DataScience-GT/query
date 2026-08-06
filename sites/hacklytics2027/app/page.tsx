"use client";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";
import PixelGarden, { PixelGround } from "@/components/pixel/PixelGarden";
import PixelSprite from "@/components/pixel/PixelSprite";
import { BLOOM, DAISY, SPROUT, TULIP } from "@/components/pixel/sprites";
import { INTEREST_URL } from "@/lib/links";

// ─── Elegant Floral Background ─────────────────────────────────────────────
const FloralBackground = () => (
  <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#020204]">
    {/* Subtle grid base */}
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />

    {/* Center digital bloom (rotating lotus).
        No backdrop-blur on the petals: they sit over a near-black backdrop, so
        the blur produced nothing visible while forcing 20 full-screen readbacks
        per frame while rotating. Gradients alone look identical here. */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-30 animate-spin-slow">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-full border border-bloom-pink/20 bg-gradient-to-t from-bloom-pink/10 to-transparent"
          style={{
            transform: `rotate(${i * 30}deg) scaleY(2.5) scaleX(0.3)`,
            transformOrigin: "center center",
          }}
        />
      ))}
    </div>

    {/* Secondary Bloom */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-20 animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '40s' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-full border border-bloom-cyan/30 bg-gradient-to-t from-bloom-cyan/15 to-transparent"
          style={{
            transform: `rotate(${i * 45}deg) scaleY(2) scaleX(0.4)`,
            transformOrigin: "center center",
          }}
        />
      ))}
    </div>

    {/* Ambient light fields — static radial gradients instead of pulsing
        blur() layers, which re-rasterized a 50vw surface every frame. */}
    <div
      className="absolute top-0 left-1/4 w-[40vw] h-[40vw] rounded-full"
      style={{ background: "radial-gradient(circle, rgba(255,45,120,0.16) 0%, transparent 70%)" }}
    />
    <div
      className="absolute bottom-0 right-1/4 w-[50vw] h-[50vw] rounded-full"
      style={{ background: "radial-gradient(circle, rgba(0,229,255,0.14) 0%, transparent 70%)" }}
    />
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
          <span className="font-pixel text-[10px] md:text-xs text-white/45 mt-3">
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
    <main className="scanlines neo-vignette relative w-full text-white bg-[#020204] overflow-x-hidden selection:bg-bloom-pink/30 selection:text-white min-h-screen">
      
      <FloralBackground />
      <PixelGarden />

      {/* ── HERO ── */}
      <section className="relative w-full min-h-screen flex flex-col justify-center items-center overflow-hidden">

        {/* Synthwave horizon grid */}
        <div className="neo-grid z-[1]" aria-hidden="true" />

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
          <div className="pixel-frame pixel-cyan hud inline-flex items-center gap-3 px-5 py-2.5 bg-white/5 mb-10 hover:bg-white/10 transition-colors duration-300 cursor-pointer group">
            <span className="neo-blink h-2 w-2 bg-bloom-lime shadow-[0_0_10px_rgba(200,255,0,0.9)]" aria-hidden />
            <PixelSprite map={BLOOM} palette="pink" scale={2} glow className="animate-bob" />
            <span className="font-pixel text-[10px] md:text-xs text-white/80 group-hover:text-white transition-colors">
              Data Science @ Georgia Tech
            </span>
            <PixelSprite map={BLOOM} palette="cyan" scale={2} glow className="animate-bob" />
          </div>

          {/* Main title - Elegantly oversized, tight tracking */}
          <div className="flex items-end justify-center gap-4 md:gap-10 mb-8">
            <PixelSprite
              map={TULIP}
              palette="pink"
              scale={7}
              glow
              className="hidden lg:block animate-sway origin-bottom"
              style={{ animationDuration: "6s" }}
            />
            <h1
              data-text="Hacklytics"
              className="neo-split neo-glitch font-sans font-medium text-[16vw] sm:text-[14vw] md:text-[11vw] lg:text-[10rem] xl:text-[12rem] leading-[0.8] tracking-[-0.04em] text-white"
            >
              Hacklytics
            </h1>
            <PixelSprite
              map={DAISY}
              palette="cyan"
              scale={7}
              glow
              className="hidden lg:block animate-sway origin-bottom"
              style={{ animationDuration: "7.5s", animationDelay: "-2s" }}
            />
          </div>

          <p className="font-sans text-lg md:text-xl lg:text-2xl text-white/50 max-w-2xl mx-auto leading-relaxed mb-12 font-light tracking-wide">
            36 hours of intelligence, innovation, and digital bloom. <br className="hidden md:block"/>
            Join 1,000+ hackers in Atlanta, GA.
          </p>

          {/* Framer-style CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 w-full sm:w-auto">
            <a
              href={INTEREST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="pixel-btn relative inline-flex items-center justify-center px-10 py-4 font-pixel text-xs overflow-hidden group w-full sm:w-auto"
            >
              <span className="relative flex items-center gap-3">
                NOTIFY ME
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            </a>
            
            <a
              href="#about"
              className="pixel-frame pixel-lime inline-flex items-center justify-center gap-3 px-10 py-4 font-pixel text-xs text-white/80 hover:text-white bg-white/[0.03] w-full sm:w-auto"
            >
              <PixelSprite map={SPROUT} palette="lime" scale={2} glow />
              EXPLORE
            </a>
          </div>

          <Countdown targetDate={new Date("2027-02-26T23:59:59")} />

        </div>
        
        {/* Pixel garden bed the hero stands in */}
        <div className="absolute bottom-0 left-0 right-0 z-[2] pointer-events-none">
          <PixelGround seed={5} count={12} />
        </div>
      </section>

      <div className="relative z-10 bg-[#020204]/70 border-t border-white/5">
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
