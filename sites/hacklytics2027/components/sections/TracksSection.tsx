"use client";
import React from "react";

const tracks = [
  {
    num: "01",
    title: "Finance",
    description: "Analyze market trends, predict stock movements, and build next-generation fintech solutions using real-world data.",
    color: "var(--bloom-lime)",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Sports Analytics",
    description: "Dive into player performance data, game strategy, and the future of sports technology.",
    color: "var(--bloom-cyan)",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        <path d="M2 12h20" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Healthcare",
    description: "Innovate in bioinformatics, patient care, and personal health technology with life-changing data.",
    color: "var(--bloom-pink)",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    num: "04",
    title: "Pure Imagination",
    description: "Unleash your creativity — explore unconventional ideas and use data to build the most unique project.",
    color: "var(--bloom-purple)",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    num: "05",
    title: "Entertainment",
    description: "Discover how AI is transforming movies, gaming, interactive experiences, and the media landscape.",
    color: "var(--bloom-lime)",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    ),
  },
];

export default function TracksSection() {
  return (
    <section id="tracks" className="section-anchor relative text-white">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 lg:py-40">

        {/* Header row */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-10 mb-20 md:mb-28">
          <div className="max-w-3xl">
            <div className="flex items-center gap-4 mb-8">
              <span className="w-8 h-[1px] bg-gradient-to-r from-bloom-lime to-transparent" />
              <span className="font-mono text-[10px] md:text-xs text-bloom-lime uppercase tracking-[0.4em] font-medium">Competition Tracks</span>
            </div>
            <h2 className="font-sans font-medium text-5xl md:text-7xl lg:text-[6rem] text-white leading-[0.9] tracking-[-0.03em]">
              The<br />
              <span className="text-bloom-lime">
                Tracks
              </span>
            </h2>
          </div>
          <p className="font-sans text-base md:text-lg text-white/40 max-w-sm leading-relaxed md:text-right font-light">
            Compete to win overall or track-specific prizes across 5 digital tracks.
          </p>
        </div>

        {/* Track cards */}
        <div className="flex flex-col gap-4 md:gap-6">
          {tracks.map(({ num, title, description, color, icon }) => (
            <div
              key={num}
              className="group flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-10 border border-white/[0.05] bg-white/[0.02] backdrop-blur-2xl rounded-3xl p-8 md:p-10 transition-all duration-500 hover:bg-white/[0.04] hover:border-white/[0.1] relative overflow-hidden"
            >
              {/* Subtle hover gradient background effect */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-700 pointer-events-none"
                style={{ background: `radial-gradient(circle at center, ${color} 0%, transparent 70%)` }}
              />

              {/* Left accent line that appears on hover */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: `linear-gradient(to bottom, transparent, ${color}, transparent)` }}
              />

              {/* Number */}
              <span className="font-mono text-sm md:text-base text-white/20 group-hover:text-white/40 transition-colors duration-500 w-8 shrink-0 relative z-10">
                {num}
              </span>

              {/* Icon */}
              <div className="text-white/30 group-hover:text-[var(--c)] transition-colors duration-500 shrink-0 [--c:inherit] relative z-10"
                style={{ "--c": color } as React.CSSProperties}>
                {icon}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0 relative z-10">
                <h3 className="font-sans font-medium text-2xl md:text-3xl text-white group-hover:text-[var(--c)] transition-colors duration-500 mb-3 tracking-tight [--c:inherit]"
                  style={{ "--c": color } as React.CSSProperties}>
                  {title}
                </h3>
                <p className="font-sans text-sm md:text-base text-white/50 leading-relaxed font-light max-w-2xl">
                  {description}
                </p>
              </div>

              {/* Arrow — appears on hover */}
              <svg className="w-6 h-6 text-white/10 group-hover:text-[var(--c)] group-hover:translate-x-2 transition-all duration-500 shrink-0 relative z-10 [--c:inherit]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ "--c": color } as React.CSSProperties}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
