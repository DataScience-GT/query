"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";
import { FlowerDivider, FlowerAccent } from "@/components/FloatingFlowers";

// Digital Bloom — A real SVG flower with organic petals
const FlowerBloom = () => {
  // Each petal is a cubic-bezier SVG path radiating from center
  // We build 3 concentric rings: outer (8 petals), mid (10 petals), inner (6 petals)
  const cx = 400, cy = 400;

  // Build an organic petal path from center outward along angle
  const petalPath = (angle: number, length: number, width: number, curve: number) => {
    const rad = (angle * Math.PI) / 180;
    const perpRad = rad + Math.PI / 2;
    // Tip of the petal
    const tx = cx + Math.cos(rad) * length;
    const ty = cy + Math.sin(rad) * length;
    // Control points — offset perpendicular to create width/curve
    const c1x = cx + Math.cos(rad) * (length * 0.35) + Math.cos(perpRad) * width;
    const c1y = cy + Math.sin(rad) * (length * 0.35) + Math.sin(perpRad) * width;
    const c2x = cx + Math.cos(rad) * (length * 0.7) + Math.cos(perpRad) * (width * curve);
    const c2y = cy + Math.sin(rad) * (length * 0.7) + Math.sin(perpRad) * (width * curve);
    // Mirror side
    const c3x = cx + Math.cos(rad) * (length * 0.7) - Math.cos(perpRad) * (width * curve);
    const c3y = cy + Math.sin(rad) * (length * 0.7) - Math.sin(perpRad) * (width * curve);
    const c4x = cx + Math.cos(rad) * (length * 0.35) - Math.cos(perpRad) * width;
    const c4y = cy + Math.sin(rad) * (length * 0.35) - Math.sin(perpRad) * width;

    return `M ${cx} ${cy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty} C ${c3x} ${c3y}, ${c4x} ${c4y}, ${cx} ${cy} Z`;
  };

  // Outer ring: 8 big petals — hot pink to purple
  const outerPetals = Array.from({ length: 8 }, (_, i) => ({
    d: petalPath(i * 45 + 10, 320, 70, 0.4),
    delay: i * 0.15,
    fill: "url(#petalOuter)",
    opacity: 0.7,
  }));

  // Mid ring: 10 petals offset — cyan to purple
  const midPetals = Array.from({ length: 10 }, (_, i) => ({
    d: petalPath(i * 36 + 18, 220, 55, 0.55),
    delay: 0.8 + i * 0.1,
    fill: "url(#petalMid)",
    opacity: 0.65,
  }));

  // Inner ring: 6 smaller petals — lime to cyan, tighter
  const innerPetals = Array.from({ length: 6 }, (_, i) => ({
    d: petalPath(i * 60 + 30, 130, 40, 0.65),
    delay: 1.6 + i * 0.12,
    fill: "url(#petalInner)",
    opacity: 0.8,
  }));

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 w-[800px] h-[800px]">
      <svg
        viewBox="0 0 800 800"
        className="w-full h-full"
        style={{ animation: "bloomSpin 200s linear infinite" }}
      >
        <defs>
          {/* Outer petal gradient: pink → purple tip */}
          <radialGradient id="petalOuter" cx="0.3" cy="0.5" r="0.8">
            <stop offset="0%" stopColor="#ff007f" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#9d00ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#9d00ff" stopOpacity="0" />
          </radialGradient>
          {/* Mid petal gradient: cyan → purple */}
          <radialGradient id="petalMid" cx="0.3" cy="0.5" r="0.8">
            <stop offset="0%" stopColor="#00f3ff" stopOpacity="0.5" />
            <stop offset="50%" stopColor="#9d00ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff007f" stopOpacity="0" />
          </radialGradient>
          {/* Inner petal gradient: lime → cyan */}
          <radialGradient id="petalInner" cx="0.3" cy="0.5" r="0.8">
            <stop offset="0%" stopColor="#ccff00" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#00f3ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00f3ff" stopOpacity="0" />
          </radialGradient>
          {/* Center glow */}
          <radialGradient id="centerGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="30%" stopColor="#ccff00" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#00f3ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00f3ff" stopOpacity="0" />
          </radialGradient>
          {/* Gaussian blur for glow */}
          <filter id="petalGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="bigGlow">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>

        {/* Outer petals */}
        <g filter="url(#petalGlow)" style={{ mixBlendMode: "screen" }}>
          {outerPetals.map((p, i) => (
            <path
              key={`outer-${i}`}
              d={p.d}
              fill={p.fill}
              opacity={p.opacity}
              stroke="rgba(255,0,127,0.15)"
              strokeWidth="0.5"
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                animation: `bloomPetal 4s ease-out ${p.delay}s both, petalBreath 6s ease-in-out ${p.delay + 2}s infinite alternate`,
              }}
            />
          ))}
        </g>

        {/* Mid petals */}
        <g filter="url(#petalGlow)" style={{ mixBlendMode: "screen" }}>
          {midPetals.map((p, i) => (
            <path
              key={`mid-${i}`}
              d={p.d}
              fill={p.fill}
              opacity={p.opacity}
              stroke="rgba(0,243,255,0.12)"
              strokeWidth="0.5"
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                animation: `bloomPetal 3.5s ease-out ${p.delay}s both, petalBreath 5s ease-in-out ${p.delay + 2}s infinite alternate`,
              }}
            />
          ))}
        </g>

        {/* Inner petals */}
        <g filter="url(#petalGlow)" style={{ mixBlendMode: "screen" }}>
          {innerPetals.map((p, i) => (
            <path
              key={`inner-${i}`}
              d={p.d}
              fill={p.fill}
              opacity={p.opacity}
              stroke="rgba(204,255,0,0.15)"
              strokeWidth="0.5"
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                animation: `bloomPetal 3s ease-out ${p.delay}s both, petalBreath 4.5s ease-in-out ${p.delay + 2}s infinite alternate`,
              }}
            />
          ))}
        </g>

        {/* Stamen — small dots around center */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const r = 35 + (i % 3) * 12;
          return (
            <circle
              key={`stamen-${i}`}
              cx={cx + Math.cos(a) * r}
              cy={cy + Math.sin(a) * r}
              r={2.5 + (i % 2)}
              fill="#ccff00"
              opacity={0.6}
              style={{
                animation: `stamenPulse 3s ease-in-out ${i * 0.2}s infinite alternate`,
              }}
            />
          );
        })}

        {/* Center pistil — bright warm glow */}
        <circle cx={cx} cy={cy} r="55" fill="url(#centerGlow)" filter="url(#bigGlow)" style={{ mixBlendMode: "screen" }} />
        <circle cx={cx} cy={cy} r="25" fill="url(#centerGlow)" opacity="0.9" style={{ mixBlendMode: "screen" }} />
        <circle cx={cx} cy={cy} r="8" fill="white" opacity="0.9">
          <animate attributeName="r" values="7;10;7" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
};

// Cybernetic Digital Bloom Countdown Timer
const Countdown: React.FC<{ targetDate: Date }> = ({ targetDate }) => {
  const getTimeLeft = React.useCallback(() => {
    const now = new Date().getTime();
    const distance = targetDate.getTime() - now;

    if (distance <= 0) return null;

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((distance / (1000 * 60)) % 60);
    const seconds = Math.floor((distance / 1000) % 60);

    return { days, hours, minutes, seconds };
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState(getTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, [getTimeLeft]);

  function formatUnit(unit?: number) {
    return unit != null ? String(unit).padStart(2, "0") : "00";
  }

  if (!timeLeft) {
    return (
      <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-6 w-full justify-center">
        {["DAYS", "HOURS", "MINUTES", "SECONDS"].map((label, i) => (
          <div
            key={i}
            className={`flex-1 flex flex-col items-center justify-center py-6 md:py-10 glass-panel min-w-[120px]`}
          >
            <span className="text-white text-5xl md:text-8xl font-sans font-bold tracking-tighter">
              00
            </span>
            <span className="text-bloom-cyan text-xs md:text-sm tracking-[0.2em] mt-2 font-mono uppercase">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-6 w-full mt-12 md:mt-24 justify-center">
      {[
        { label: "DAYS", value: timeLeft.days, color: "text-bloom-pink", glow: "hover-bloom-glow", glowColor: "var(--bloom-pink)" },
        { label: "HOURS", value: timeLeft.hours, color: "text-bloom-cyan", glow: "hover-bloom-glow", glowColor: "var(--bloom-cyan)" },
        { label: "MINUTES", value: timeLeft.minutes, color: "text-bloom-lime", glow: "hover-bloom-glow", glowColor: "var(--bloom-lime)" },
        { label: "SECONDS", value: timeLeft.seconds, color: "text-white", glow: "hover-bloom-glow", glowColor: "white" },
      ].map((unit, i) => (
        <div
          key={i}
          className={`flex-1 flex flex-col items-center justify-center py-6 md:py-10 glass-panel relative overflow-hidden group min-w-[120px] transition-all duration-500 ${unit.glow} hover:-translate-y-2`}
        >
          {/* Glowing orbital background inside panel */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-t from-current to-transparent mix-blend-screen" style={{ color: unit.glowColor }}></div>

          <span className={`text-5xl md:text-8xl font-sans font-bold tracking-tighter relative z-10 ${unit.color} group-hover:bloom-text-glow transition-all duration-300`}>
            {formatUnit(unit.value)}
          </span>
          <span className="text-gray-400 group-hover:text-white transition-colors text-xs md:text-sm tracking-[0.2em] mt-2 font-mono uppercase relative z-10">{unit.label}</span>
        </div>
      ))}
    </div>
  );
};


export default function HomePage() {
  return (
    <>
      <main className="relative w-full min-h-screen bg-transparent text-white selection:bg-bloom-cyan selection:text-black font-mono">
        {/* Grain overlay */}
        <div className="fixed inset-0 z-0 bg-noise mix-blend-overlay"></div>

        {/* MLH Trust Badge */}
        <a
          id="mlh-trust-badge"
          href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
          target="_blank"
          className="absolute top-0 right-4 md:right-[50px] z-50 block w-[10%] max-w-[100px] min-w-[60px] transition-transform hover:scale-105"
        >
          <img
            src="/mlh-trust-badge.svg"
            alt="Major League Hacking 2027 Hackathon Season"
            className="w-full drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all duration-300"
          />
        </a>

        {/* Hero Section - Cybernetic Glassmorphic */}
        <div className="relative w-full pt-32 pb-16 md:pt-48 md:pb-24 flex flex-col justify-center min-h-screen">
          
          {/* Literal Digital Flower Bloom */}
          <FlowerBloom />

          {/* Additional floating abstract glowing orbs */}
          <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] bg-bloom-pink/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen animate-pulse"></div>
          <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] bg-bloom-cyan/20 rounded-full blur-[150px] pointer-events-none mix-blend-screen animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[300px] h-[300px] bg-bloom-purple/30 rounded-full blur-[100px] pointer-events-none mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }}></div>

          <div className="px-6 md:px-12 xl:px-24 w-full relative z-10 flex flex-col h-full justify-between max-w-7xl mx-auto">
            
            {/* Top Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-16">
              <div className="flex flex-col justify-end glass-panel px-8 py-6 md:px-12 md:py-10 border-l-4 border-bloom-cyan shadow-[0_0_30px_rgba(0,243,255,0.15)] relative overflow-hidden group">
                <FlowerAccent position="top-right" color="#ff007f" size={45} />
                <FlowerAccent position="bottom-left" color="#00f3ff" size={35} />
                <div className="absolute inset-0 bg-gradient-to-r from-bloom-cyan/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                
                <p className="text-bloom-cyan font-mono text-sm md:text-base tracking-widest uppercase mb-4 relative z-10 font-bold">
                  Data Science @ Georgia Tech
                </p>
                <h1 className="font-sans text-[12vw] md:text-[8vw] lg:text-[7rem] font-bold leading-[0.85] tracking-tighter text-white relative z-10 drop-shadow-2xl">
                  HACKLYTICS<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-pink via-bloom-purple to-bloom-cyan bloom-text-glow">
                    2027
                  </span>
                </h1>
              </div>

              {/* CTA Button */}
              <a
                href="https://form.typeform.com/to/GvqBCdAe"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-3 group relative overflow-hidden glass-panel px-8 py-4 border border-bloom-pink/60 hover:border-bloom-cyan shadow-[0_0_20px_rgba(255,0,127,0.2)] hover:shadow-[0_0_30px_rgba(0,243,255,0.3)] transition-all duration-500 rounded-2xl self-start"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-bloom-pink/20 to-bloom-cyan/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <span className="relative z-10 font-mono text-sm md:text-base font-bold tracking-widest uppercase text-white group-hover:text-bloom-cyan transition-colors">Register Now</span>
                <svg className="relative z-10 w-4 h-4 text-bloom-pink group-hover:text-bloom-cyan group-hover:translate-x-1 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </a>

              <div className="flex flex-col justify-end md:items-end mt-8 md:mt-0 relative z-10">
                <a href="https://form.typeform.com/to/GvqBCdAe" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 glass-panel px-6 py-3 rounded-full shadow-[0_0_20px_rgba(204,255,0,0.2)] border border-bloom-lime/50 hover:shadow-[0_0_30px_rgba(204,255,0,0.4)] hover:border-bloom-lime transition-all duration-300 group/reg">
                  <span className="w-2 h-2 rounded-full bg-bloom-lime animate-ping"></span>
                  <span className="w-2 h-2 rounded-full bg-bloom-lime absolute"></span>
                  <span className="text-xs tracking-widest uppercase text-white font-bold ml-2 group-hover/reg:text-bloom-lime transition-colors">Interest Form Open</span>
                </a>
                <div className="mt-8 text-left md:text-right glass-panel p-6 shadow-xl border-t border-white/10">
                  <p className="text-xl md:text-2xl font-mono text-gray-300 font-light leading-snug">
                    THE PREMIER<br />
                    DATA SCIENCE<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-cyan to-white font-bold block mt-1 tracking-widest bloom-text-glow">HACKATHON</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Countdown Area */}
            <div className="mt-auto z-10">
              <Countdown targetDate={new Date("2027-02-20T23:59:59")} />
            </div>

            {/* Glassmorphic Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-12 md:mt-16 z-10">
              {[
                { label: "PRIZES", value: "$30K+", color: "text-bloom-lime" },
                { label: "HACKERS", value: "1000+", color: "text-bloom-cyan" },
                { label: "HOURS", value: "36", color: "text-bloom-pink" },
                { label: "LOCATION", value: "ATLANTA", color: "text-bloom-purple" }
              ].map((stat, idx) => (
                <div key={idx} className={`p-6 glass-panel flex flex-col justify-between min-h-[120px] group hover-bloom-glow transition-all duration-300 hover:-translate-y-1 relative overflow-hidden`}>
                  <div className="absolute -inset-4 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                  <span className="text-xs text-gray-400 font-mono tracking-widest uppercase group-hover:text-white transition-colors relative z-10">{stat.label}</span>
                  <span className={`text-3xl md:text-5xl font-sans font-bold ${stat.color} mt-4 drop-shadow-[0_0_10px_currentColor] relative z-10`}>{stat.value}</span>
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Flower divider between hero and content */}
        <FlowerDivider variant="pink" />

        <div className="relative z-10 bg-transparent flex flex-col items-center">
          <div className="w-full max-w-7xl mx-auto">
            <HomeSections />
          </div>
        </div>
      </main>
    </>
  );
}

