"use client";
import React from "react";
import { PixelLabel } from "../pixel/PixelBits";
import PixelSprite from "../pixel/PixelSprite";
import { BLOOM, DAISY, MUSHROOM, SPROUT, TULIP } from "../pixel/sprites";
const TRACK_SPRITES = [DAISY, TULIP, BLOOM, MUSHROOM, SPROUT];
const TRACK_TINTS = ["lime", "cyan", "pink", "purple", "lime"] as const;

const tracks = [
  {
    num: "01",
    title: "Finance",
    description: "Analyze market trends, predict stock movements, and build next-generation fintech solutions using real-world data.",
    color: "var(--bloom-lime)",
  },
  {
    num: "02",
    title: "Sports Analytics",
    description: "Dive into player performance data, game strategy, and the future of sports technology.",
    color: "var(--bloom-cyan)",
  },
  {
    num: "03",
    title: "Healthcare",
    description: "Innovate in bioinformatics, patient care, and personal health technology with life-changing data.",
    color: "var(--bloom-pink)",
  },
  {
    num: "04",
    title: "Pure Imagination",
    description: "Unleash your creativity — explore unconventional ideas and use data to build the most unique project.",
    color: "var(--bloom-purple)",
  },
  {
    num: "05",
    title: "Entertainment",
    description: "Discover how AI is transforming movies, gaming, interactive experiences, and the media landscape.",
    color: "var(--bloom-lime)",
  },
];

export default function TracksSection() {
  return (
    <section id="tracks" className="section-anchor relative text-white">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 lg:py-40">

        {/* Header row */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-10 mb-20 md:mb-28">
          <div className="max-w-3xl">
            <PixelLabel text="Competition Tracks" tint="lime" />
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
          {tracks.map(({ num, title, description, color }, i) => (
            <div
              key={num}
              className={`group flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-10 pixel-frame pixel-${TRACK_TINTS[i]} bg-white/[0.03] p-8 md:p-10 relative overflow-hidden`}
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
              <span className="font-pixel text-xs text-white/35 group-hover:text-white transition-colors duration-200 w-8 shrink-0 relative z-10">
                {num}
              </span>

              {/* Pixel specimen for the track */}
              <div className="shrink-0 relative z-10">
                <PixelSprite
                  map={TRACK_SPRITES[i]}
                  palette={TRACK_TINTS[i]}
                  scale={4}
                  glow
                  className="animate-sway origin-bottom"
                  style={{ animationDuration: `${5 + i}s` }}
                />
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
