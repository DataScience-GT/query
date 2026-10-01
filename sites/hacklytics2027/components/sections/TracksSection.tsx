"use client";
import React, { useMemo } from "react";
import PixelSprite from "../pixel/PixelSprite";
import { BLOOM, DAISY, GROUND, MUSHROOM, SPROUT, TULIP } from "../pixel/sprites";
import type { PaletteName, SpriteMap } from "../pixel/sprites";
import { spriteToDataUri } from "../pixel/spriteUri";

const tracks: {
  title: string;
  description: string;
  sprite: SpriteMap;
  palette: PaletteName;
}[] = [
  { title: "Finance", description: "Markets, models, and fintech.", sprite: DAISY, palette: "lime" },
  { title: "Sports Analytics", description: "Performance, strategy, and the game.", sprite: TULIP, palette: "cyan" },
  { title: "Healthcare", description: "Care, bioinformatics, and health tech.", sprite: BLOOM, palette: "pink" },
  { title: "Entertainment", description: "Media, games, and interactive AI.", sprite: MUSHROOM, palette: "purple" },
  { title: "Pure Imagination", description: "Wildcard. Build the unexpected.", sprite: SPROUT, palette: "lime" },
];

const GROUND_SCALE = 4;

export default function TracksSection() {
  const ground = useMemo(() => spriteToDataUri(GROUND, "lime"), []);

  return (
    <section id="tracks" className="section-anchor relative text-white">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl text-white leading-[1] tracking-[-0.03em] mb-14 md:mb-20">
          Tracks
        </h2>

        {/* The tracks are the garden: one plant each, rooted in the same bed
            of soil as the hero. Phones get a plain list; five plants do not
            share a 390px bed. */}
        <ul className="lg:hidden flex flex-col gap-8">
          {tracks.map((t) => (
            <li key={t.title} className="flex items-end gap-5">
              <span className="flex w-14 shrink-0 justify-center">
                <PixelSprite map={t.sprite} palette={t.palette} scale={4} glow />
              </span>
              <div className="pb-1">
                <h3 className="font-sans font-bold text-xl text-white tracking-tight">{t.title}</h3>
                <p className="font-sans text-base text-white/65 mt-1">{t.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden lg:block">
          <ul className="grid grid-cols-5 items-end">
            {tracks.map((t, i) => (
              <li key={t.title} className="flex justify-center">
                <PixelSprite
                  map={t.sprite}
                  palette={t.palette}
                  scale={7}
                  glow
                  className="animate-sway origin-bottom"
                  style={{ animationDuration: `${6 + i * 0.7}s`, animationDelay: `${-i * 1.3}s` }}
                />
              </li>
            ))}
          </ul>
          <div
            aria-hidden
            className="w-full"
            style={{
              backgroundImage: ground.uri,
              backgroundRepeat: "repeat-x",
              backgroundSize: `${ground.w * GROUND_SCALE}px ${ground.h * GROUND_SCALE}px`,
              height: ground.h * GROUND_SCALE,
              imageRendering: "pixelated",
            }}
          />
          <ul className="grid grid-cols-5 gap-6 mt-8">
            {tracks.map((t) => (
              <li key={t.title} className="text-center">
                <h3 className="font-sans font-bold text-xl xl:text-2xl text-white tracking-tight">{t.title}</h3>
                <p className="font-sans text-base text-white/65 mt-2">{t.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
