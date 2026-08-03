"use client";
import React from "react";
import Image from "next/image";

// ─── Grand Prize Card ──────────────────────────────────────────────────────
const GrandPrize: React.FC<{
  rank: "1st" | "2nd" | "3rd";
  prize: string;
  image: string;
  featured?: boolean;
}> = ({ rank, prize, image, featured }) => {
  const rankColor = rank === "1st" ? "var(--bloom-lime)" : rank === "2nd" ? "var(--bloom-cyan)" : "var(--bloom-pink)";
  return (
    <div className={`flex flex-col rounded-[2rem] overflow-hidden transition-all duration-500 hover:-translate-y-2 ${
      featured
        ? "border border-white/20 bg-white/[0.04] backdrop-blur-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        : "border border-white/[0.05] bg-white/[0.02] backdrop-blur-2xl hover:bg-white/[0.04] hover:border-white/10"
    }`}>
      {/* Image area */}
      <div className="relative h-48 md:h-64 flex items-center justify-center p-8 overflow-hidden group">
        <div className="absolute inset-0 opacity-[0.15] transition-opacity duration-700 group-hover:opacity-[0.25]" style={{ background: `radial-gradient(circle at center, ${rankColor}, transparent 70%)` }} />
        <Image src={image} alt={prize} fill className="object-contain p-8 md:p-12 filter drop-shadow-2xl group-hover:scale-105 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]" />
      </div>
      {/* Info */}
      <div className="px-8 py-6 border-t border-white/5 relative z-10 bg-black/20">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] block mb-2" style={{ color: rankColor }}>{rank} Place</span>
        <p className="font-sans font-medium text-xl md:text-2xl text-white leading-tight tracking-tight">{prize}</p>
      </div>
    </div>
  );
};

// ─── Track Prize Row ────────────────────────────────────────────────────────
const TrackRow: React.FC<{
  num: string;
  trackName: string;
  description: string;
  prizes: string[];
  color: string;
}> = ({ num, trackName, description, prizes, color }) => (
  <div className="group grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-10 border-b border-white/5 py-8 md:py-10 hover:bg-white/[0.015] transition-colors duration-500 rounded-2xl px-4 md:px-6 -mx-4 md:-mx-6">
    <div className="md:col-span-2 flex items-start gap-6">
      <span className="font-mono text-sm text-white/20 mt-1 shrink-0 group-hover:text-[var(--c)] transition-colors duration-500" style={{ "--c": color } as React.CSSProperties}>{num}</span>
      <div>
        <h3 className="font-sans font-medium text-2xl md:text-3xl text-white group-hover:text-[var(--c)] transition-colors duration-500 tracking-tight [--c:inherit]" style={{ "--c": color } as React.CSSProperties}>{trackName}</h3>
        <p className="font-sans text-base text-white/40 mt-2 leading-relaxed font-light">{description}</p>
      </div>
    </div>
    <div className="md:col-span-3 flex flex-wrap items-center gap-3">
      {prizes.map((p, i) => (
        <span key={i} className="font-sans text-sm text-white/60 border border-white/10 rounded-full px-5 py-2 hover:border-white/30 hover:bg-white/[0.02] hover:text-white transition-all duration-300 font-light cursor-default">
          <span className="font-mono text-[10px] mr-2" style={{ color: ["var(--bloom-lime)","var(--bloom-cyan)","var(--bloom-pink)"][i] }}>{["1st","2nd","3rd"][i]}</span>
          {p}
        </span>
      ))}
    </div>
  </div>
);

// ─── Speaker Avatar ─────────────────────────────────────────────────────────
const SpeakerCard: React.FC<{ name: string; title: string; company: string; color: string }> = ({ name, title, company, color }) => (
  <div className="flex flex-col items-center text-center gap-5 p-8 border border-white/[0.05] rounded-[2rem] bg-white/[0.02] backdrop-blur-xl hover:bg-white/[0.04] hover:border-white/10 transition-all duration-500 group shadow-[0_0_30px_rgba(0,0,0,0.2)]">
    {/* Avatar placeholder */}
    <div className="w-24 h-24 rounded-full border border-white/10 group-hover:border-[var(--c)] transition-colors duration-500 bg-white/[0.02] flex items-center justify-center [--c:inherit] shadow-inner" style={{ "--c": color } as React.CSSProperties}>
      <svg className="w-8 h-8 text-white/20 group-hover:text-[var(--c)] transition-colors duration-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
      </svg>
    </div>
    <div>
      <p className="font-sans font-medium text-white text-lg md:text-xl tracking-tight mb-1">{name}</p>
      <p className="font-sans text-sm text-white/40 font-light">{title}</p>
      <p className="font-mono text-[10px] mt-2 uppercase tracking-[0.2em]" style={{ color }}>{company}</p>
    </div>
  </div>
);

// ─── Main Section ───────────────────────────────────────────────────────────
export default function PrizeAndSpeakerSection() {
  const grandPrizes = [
    { rank: "2nd" as const, prize: "Apple AirPods Max", image: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-max-select-spacegray-202011?wid=400&hei=400&fmt=png-alpha" },
    { rank: "1st" as const, prize: "Apple MacBook Air M4", image: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=400&hei=400&fmt=png-alpha", featured: true },
    { rank: "3rd" as const, prize: "Samsung Odyssey G5 Monitor", image: "/prizes/samsung-monitor.jpg" },
  ];

  const trackPrizes = [
    { num: "01", trackName: "Finance",          description: "Market trends & fintech",          color: "var(--bloom-lime)",   prizes: ["Nespresso Virtuo Next", "JBL Grip Speaker", "Clay Poker Set"] },
    { num: "02", trackName: "Sports Analytics", description: "Player performance & data",        color: "var(--bloom-cyan)",   prizes: ["Apple Watch SE 3", "JBL Grip Speaker", "Pickleball Set"] },
    { num: "03", trackName: "Healthcare",       description: "Bioinformatics & health tech",    color: "var(--bloom-pink)",   prizes: ["Theragun Mini Gen 3", "Fitbit Inspire 3", "Owala Waterbottle"] },
    { num: "04", trackName: "Entertainment",    description: "AI in media & gaming",            color: "var(--bloom-purple)", prizes: ["Projector", "Karaoke Machine", "Vinyl Turntable"] },
    { num: "05", trackName: "Pure Imagination", description: "Wildcard — most creative project", color: "var(--bloom-lime)",   prizes: ["Ninja CREAMi Soft Serve"] },
  ];

  const speakers = [
    { name: "TBD", title: "Keynote Speaker",  company: "Coming Soon", color: "var(--bloom-purple)" },
    { name: "TBD", title: "Guest Speaker",    company: "Coming Soon", color: "var(--bloom-pink)" },
    { name: "TBD", title: "Workshop Lead",    company: "Coming Soon", color: "var(--bloom-lime)" },
    { name: "TBD", title: "Guest Speaker",    company: "Coming Soon", color: "var(--bloom-cyan)" },
  ];

  return (
    <section id="prizes" className="section-anchor text-white relative">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">

        {/* Grand Prizes */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-[1px] bg-gradient-to-r from-bloom-lime to-transparent" />
          <span className="font-mono text-[10px] md:text-xs text-bloom-lime uppercase tracking-[0.4em] font-medium">Grand Prizes</span>
        </div>
        <h2 className="font-sans font-medium text-5xl md:text-7xl lg:text-[6rem] text-white leading-[0.9] tracking-[-0.03em] mb-16 md:mb-24">
          Win <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">Big</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 mb-24 md:mb-32">
          {grandPrizes.map((p) => <GrandPrize key={p.rank} {...p} />)}
        </div>

        {/* Track Prizes */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-[1px] bg-gradient-to-r from-bloom-purple to-transparent" />
          <span className="font-mono text-[10px] md:text-xs text-bloom-purple uppercase tracking-[0.4em] font-medium">Track Prizes</span>
        </div>
        <h2 className="font-sans font-medium text-4xl md:text-6xl text-white leading-[0.9] tracking-[-0.03em] mb-12">
          By Track
        </h2>

        <div className="border-t border-white/5 mb-24 md:mb-32">
          {trackPrizes.map((t) => <TrackRow key={t.num} {...t} />)}
        </div>

        {/* Speakers */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-[1px] bg-gradient-to-r from-bloom-pink to-transparent" />
          <span className="font-mono text-[10px] md:text-xs text-bloom-pink uppercase tracking-[0.4em] font-medium">Guest Speakers</span>
        </div>
        <h2 className="font-sans font-medium text-4xl md:text-6xl text-white leading-[0.9] tracking-[-0.03em] mb-12">
          Speakers
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {speakers.map((s, i) => <SpeakerCard key={i} {...s} />)}
        </div>

      </div>
    </section>
  );
}
