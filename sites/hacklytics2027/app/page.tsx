"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";

// Digital Bloom Countdown Timer (Brutalist style)
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
      <div className="flex gap-0 border-t border-b border-gridline w-full">
        {["DAYS", "HOURS", "MINUTES", "SECONDS"].map((label, i) => (
          <div
            key={i}
            className={`flex-1 flex flex-col items-center justify-center py-6 md:py-10 bg-[#0b0c10] ${i !== 3 ? 'border-r border-gridline' : ''} hover:bg-white/5 transition-colors`}
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
    <div className="flex gap-0 border-t border-b border-gridline w-full mt-12 md:mt-24">
      {[
        { label: "DAYS", value: timeLeft.days, color: "text-bloom-pink" },
        { label: "HOURS", value: timeLeft.hours, color: "text-bloom-cyan" },
        { label: "MINUTES", value: timeLeft.minutes, color: "text-bloom-lime" },
        { label: "SECONDS", value: timeLeft.seconds, color: "text-white" },
      ].map((unit, i) => (
        <div
          key={i}
          className={`flex-1 flex flex-col items-center justify-center py-6 md:py-10 bg-[#0b0c10] relative overflow-hidden group ${i !== 3 ? 'border-r border-gridline' : ''} hover:bg-[#111] transition-colors`}
        >
          {/* Subtle Bloom effect on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-gradient-to-b from-transparent to-current" style={{ color: `var(--${unit.color.split('-')[1]}-${unit.color.split('-')[2]})` }}></div>

          <span className={`text-5xl md:text-8xl font-sans font-bold tracking-tighter ${unit.color}`}>
            {formatUnit(unit.value)}
          </span>
          <span className="text-gray-500 group-hover:text-gray-300 transition-colors text-xs md:text-sm tracking-[0.2em] mt-2 font-mono uppercase">{unit.label}</span>
        </div>
      ))}
    </div>
  );
};


export default function HomePage() {
  return (
    <>
      <style jsx global>{`
        .bg-noise {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          opacity: 0.03;
          pointer-events: none;
        }
      `}</style>

      <main className="relative w-full min-h-screen bg-[#0b0c10] text-white bg-brutalist-grid selection:bg-bloom-lime selection:text-black font-mono">
        {/* Grain overlay */}
        <div className="absolute inset-0 z-0 bg-noise mix-blend-overlay"></div>

        {/* MLH Trust Badge */}
        <a
          id="mlh-trust-badge"
          href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
          target="_blank"
          className="absolute top-0 right-4 md:right-[50px] z-50 block w-[10%] max-w-[100px] min-w-[60px] transition-transform hover:scale-105"
        >
          <img
            src="https://s3.amazonaws.com/logged-assets/trust-badge/2026/mlh-trust-badge-2026-white.svg"
            alt="Major League Hacking 2026 Hackathon Season"
            className="w-full grayscale hover:grayscale-0 transition-all duration-300"
          />
        </a>

        {/* Hero Section - Brutalist Modular Grid */}
        <div className="relative w-full pt-32 pb-16 md:pt-48 md:pb-24 border-b border-gridline flex flex-col justify-center min-h-[90vh]">
          
          {/* Abstract Glowing Orbs (Digital Bloom) */}
          <div className="absolute top-[20%] left-[10%] w-[300px] h-[300px] bg-bloom-pink/20 rounded-full blur-[100px] pointer-events-none mix-blend-screen"></div>
          <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] bg-bloom-cyan/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen"></div>
          <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-bloom-lime/10 rounded-full blur-[80px] pointer-events-none mix-blend-screen"></div>

          <div className="px-6 md:px-12 xl:px-24 w-full relative z-10 flex flex-col h-full justify-between">
            
            {/* Top Grid Area */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-0">
              <div className="md:col-span-8 flex flex-col justify-end border-l-4 border-bloom-lime pl-6 py-2">
                <p className="text-gray-400 font-mono text-sm md:text-base tracking-widest uppercase mb-4">
                  Data Science @ Georgia Tech
                </p>
                <h1 className="font-sans text-[12vw] md:text-[8vw] font-bold leading-[0.85] tracking-tighter text-white">
                  HACKLYTICS<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-bloom-pink via-bloom-purple to-bloom-cyan">
                    2027
                  </span>
                </h1>
              </div>

              <div className="md:col-span-4 flex flex-col justify-end md:items-end mt-8 md:mt-0">
                <div className="inline-flex items-center gap-3 border border-gridline px-4 py-2 bg-black/50 backdrop-blur-sm rounded-full w-max md:w-auto">
                  <span className="w-2 h-2 rounded-full bg-bloom-lime animate-pulse"></span>
                  <span className="text-xs tracking-widest uppercase text-gray-300">Registration Open</span>
                </div>
                <div className="mt-8 text-left md:text-right">
                  <p className="text-xl md:text-2xl font-mono text-gray-300 font-light">
                    THE PREMIER<br />
                    DATA SCIENCE<br />
                    <span className="text-bloom-cyan font-bold block mt-1">HACKATHON</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Grid Area / Countdown */}
            <div className="mt-auto">
              <Countdown targetDate={new Date("2027-02-20T23:59:59")} />
            </div>

            {/* Brutalist Footer Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-gridline mt-12 md:mt-16">
              {[
                { label: "PRIZES", value: "$30K+" },
                { label: "HACKERS", value: "1000+" },
                { label: "HOURS", value: "36" },
                { label: "LOCATION", value: "ATLANTA" }
              ].map((stat, idx) => (
                <div key={idx} className={`p-6 bg-black/40 backdrop-blur-md border-t border-gridline ${idx % 2 === 0 ? 'border-r' : ''} ${idx < 3 ? 'md:border-r' : ''} border-gridline flex flex-col justify-between min-h-[120px] group hover:bg-white/5 transition-colors`}>
                  <span className="text-xs text-gray-500 font-mono tracking-widest group-hover:text-bloom-lime transition-colors">{stat.label}</span>
                  <span className="text-3xl md:text-4xl font-sans font-bold text-white mt-4">{stat.value}</span>
                </div>
              ))}
            </div>

          </div>
        </div>

        <div className="relative z-10 bg-[#0b0c10]">
          <HomeSections />
        </div>
      </main>
    </>
  );
}

