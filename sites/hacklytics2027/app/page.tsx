"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";

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
          
          {/* Additional floating abstract glowing orbs */}
          <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] bg-bloom-pink/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen animate-pulse"></div>
          <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] bg-bloom-cyan/20 rounded-full blur-[150px] pointer-events-none mix-blend-screen animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[300px] h-[300px] bg-bloom-purple/30 rounded-full blur-[100px] pointer-events-none mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }}></div>

          <div className="px-6 md:px-12 xl:px-24 w-full relative z-10 flex flex-col h-full justify-between max-w-7xl mx-auto">
            
            {/* Top Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-16">
              <div className="flex flex-col justify-end glass-panel px-8 py-6 md:px-12 md:py-10 border-l-4 border-bloom-cyan shadow-[0_0_30px_rgba(0,243,255,0.15)] relative overflow-hidden group">
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

              <div className="flex flex-col justify-end md:items-end mt-8 md:mt-0 relative z-10">
                <div className="inline-flex items-center gap-3 glass-panel px-6 py-3 rounded-full shadow-[0_0_20px_rgba(204,255,0,0.2)] border border-bloom-lime/50">
                  <span className="w-2 h-2 rounded-full bg-bloom-lime animate-ping"></span>
                  <span className="w-2 h-2 rounded-full bg-bloom-lime absolute"></span>
                  <span className="text-xs tracking-widest uppercase text-white font-bold ml-2">Registration Open</span>
                </div>
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

        <div className="relative z-10 bg-transparent flex flex-col items-center">
          <div className="w-full max-w-7xl mx-auto">
            <HomeSections />
          </div>
        </div>
      </main>
    </>
  );
}

