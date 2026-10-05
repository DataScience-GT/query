"use client";
import React from "react";
import { BloomSprite } from "../pixel/PixelSprite";
import { useBloomInView } from "../pixel/useInView";
import { BLOOM, DAISY, MUSHROOM, TULIP } from "../pixel/sprites";
import type { SpriteMap } from "../pixel/sprites";

const tracks: { title: string; description: string; sprite: SpriteMap }[] = [
  { title: "Finance", description: "Markets, models, and fintech.", sprite: DAISY },
  { title: "Sports Analytics", description: "Performance, strategy, and the game.", sprite: TULIP },
  { title: "Healthcare", description: "Care, bioinformatics, and health tech.", sprite: BLOOM },
  { title: "Entertainment", description: "Media, games, and interactive AI.", sprite: MUSHROOM },
];

export default function TracksSection() {
  // The signature: the four plants are dormant until the row is seen, then
  // bloom pink one after another, left to right.
  const bedRef = useBloomInView<HTMLUListElement>();

  return (
    <section id="tracks" className="section-anchor relative border-t border-rule">
      <div className="wrap py-24 md:py-32">
        <p className="kicker mb-5">Four tracks</p>
        <h2 className="section-title mb-14 md:mb-20">Tracks</h2>

        {/* One plant per track, each standing on the same hairline. */}
        <ul
          ref={bedRef}
          data-bloom="off"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-14"
        >
          {tracks.map((t, i) => (
            <li key={t.title}>
              <div className="flex h-32 items-end border-b border-rule">
                <BloomSprite map={t.sprite} scale={6} blooms index={i} />
              </div>
              <h3 className="font-display font-bold text-[16px] sm:text-[17px] leading-snug text-ink mt-5">
                {t.title}
              </h3>
              <p className="font-sans text-[17px] leading-[1.5] text-ink-2 mt-2">{t.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
