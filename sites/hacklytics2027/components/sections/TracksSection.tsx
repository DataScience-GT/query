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
    palette: "pink",
  },
  {
    num: "05",
    title: "Pure Imagination",
    description: "Wildcard. Build the unexpected.",
    sprite: SPROUT,
    palette: "lime",
  },
];

export default function TracksSection() {
  return (
    <section id="tracks" className="section-anchor relative text-white border-t border-white/[0.06]">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <Eyebrow>Tracks</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-12 md:mb-16 max-w-3xl">
          Five tracks. One weekend.
        </h2>

        <ul className="flex flex-col border-t border-white/10">
          {tracks.map(({ num, title, description, sprite, palette }) => (
            <li
              key={num}
              className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 border-b border-white/10 py-6 md:py-8"
            >
              <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                <PixelSprite
                  map={sprite}
                  palette={palette}
                  scale={3}
                  className="shrink-0"
                />
                <span className="font-sans text-xs text-white/35 w-6 shrink-0 tabular-nums">
                  {num}
                </span>
                <h3 className="font-sans font-bold text-xl md:text-2xl text-white tracking-tight">
                  {title}
                </h3>
              </div>
              <p className="font-sans text-sm md:text-base text-white/45 sm:ml-auto sm:text-right max-w-md pl-14 sm:pl-0">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
