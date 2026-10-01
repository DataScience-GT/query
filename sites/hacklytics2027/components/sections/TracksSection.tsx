"use client";
import React from "react";
import PixelSprite from "../pixel/PixelSprite";
import { BLOOM, DAISY, MUSHROOM, SPROUT, TULIP } from "../pixel/sprites";
import type { PaletteName, SpriteMap } from "../pixel/sprites";
import Eyebrow from "./Eyebrow";

const tracks: {
  num: string;
  title: string;
  description: string;
  sprite: SpriteMap;
  palette: PaletteName;
}[] = [
  {
    num: "01",
    title: "Finance",
    description: "Markets, models, and fintech.",
    sprite: DAISY,
    palette: "lime",
  },
  {
    num: "02",
    title: "Sports Analytics",
    description: "Performance, strategy, and the game.",
    sprite: TULIP,
    palette: "cyan",
  },
  {
    num: "03",
    title: "Healthcare",
    description: "Care, bioinformatics, and health tech.",
    sprite: BLOOM,
    palette: "pink",
  },
  {
    num: "04",
    title: "Entertainment",
    description: "Media, games, and interactive AI.",
    sprite: MUSHROOM,
    palette: "purple",
  },
  {
    num: "05",
    title: "Pure Imagination",
    description: "Wildcard. Build the unexpected.",
    sprite: SPROUT,
    palette: "lime",
  },
];

const FRAME: Record<PaletteName, string> = {
  pink: "pixel-pink",
  cyan: "pixel-cyan",
  lime: "pixel-lime",
  purple: "pixel-purple",
};

const NUM: Record<PaletteName, string> = {
  pink: "text-bloom-pink",
  cyan: "text-bloom-cyan",
  lime: "text-bloom-lime",
  purple: "text-[#c77dff]",
};

export default function TracksSection() {
  return (
    <section id="tracks" className="section-anchor relative text-white">
      <div className="section-wrap max-w-7xl mx-auto py-20 md:py-28 px-6">
        <Eyebrow index="02" tone="lime">Tracks</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-12 md:mb-16 max-w-3xl">
          Five tracks. <span className="neon-lime">One weekend.</span>
        </h2>

        {/* Six columns so three cards fill the first row and two wider ones
            the second, instead of a lone card stranded on the last row. */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-5">
          {tracks.map(({ num, title, description, sprite, palette }, i) => (
            <li
              key={num}
              className={`group pixel-frame ${FRAME[palette]} relative overflow-hidden bg-white/[0.03] p-6 md:p-8 min-h-[15rem] flex flex-col transition-colors duration-300 hover:bg-white/[0.06] ${
                i < 3 ? "lg:col-span-2" : "lg:col-span-3"
              } ${i === 4 ? "sm:col-span-2 lg:col-span-3" : ""}`}
            >
              <div className="flex items-start justify-between">
                <PixelSprite
                  map={sprite}
                  palette={palette}
                  scale={5}
                  glow
                  className="transition-transform duration-300 group-hover:-translate-y-1"
                />
                <span className={`font-pixel text-xs ${NUM[palette]}`}>{num}</span>
              </div>
              <h3 className="font-sans font-bold text-2xl md:text-3xl text-white tracking-tight mt-auto pt-8">
                {title}
              </h3>
              <p className="font-sans text-base text-white/65 mt-2">{description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
