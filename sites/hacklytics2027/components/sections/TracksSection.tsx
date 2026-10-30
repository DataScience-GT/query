"use client";
import React from "react";
import { BloomSprite } from "../pixel/PixelSprite";
import { useBloomInView } from "../pixel/useInView";
import { BLOOM, DAISY, MUSHROOM, TULIP } from "../pixel/sprites";
import type { SpriteMap } from "../pixel/sprites";

const tracks: { title: string; description: string; sprite: SpriteMap }[] = [
  { title: "Finance", description: "Markets, models, and fintech", sprite: DAISY },
  { title: "Sports Analytics", description: "Performance, strategy, and the game", sprite: TULIP },
  { title: "Healthcare", description: "Care, bioinformatics, and health tech", sprite: BLOOM },
  { title: "Entertainment", description: "Media, games, and interactive AI", sprite: MUSHROOM },
];

export default function TracksSection() {
  // The signature: the four plants are dormant until the row is seen, then
  // ribbon pink one after another, left to right.
  const bedRef = useBloomInView<HTMLUListElement>();

  return (
    <section id="tracks" className="section-anchor relative">
      <div className="wrap py-12 md:py-24">
        <h2 className="section-title mb-10 md:mb-20">Tracks</h2>

        {/* One plot per track. A phone gets rows, plant left of its words.
            From sm each li is a subgrid, so titles and descriptions line up
            across a row. The space between rows there is the li's pb-14, not
            a row gap, which the subgrid would also put between a title and
            its description; -mb-14 takes it back off the last row. */}
        <ul
          ref={bedRef}
          data-bloom="off"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 sm:-mb-14 [--bed:1] md:[--bed:2]"
        >
          {tracks.map((t, i) => (
            <li
              key={t.title}
              className="grid grid-cols-[5rem_1fr] gap-x-4 py-4 border-b border-sage sm:grid-cols-none sm:grid-rows-subgrid sm:row-span-3 sm:py-0 sm:pb-14 sm:border-b-0"
            >
              <div className="row-span-2 flex items-end sm:row-span-1 sm:h-32 md:h-60 sm:border-b sm:border-sage">
                <BloomSprite map={t.sprite} scale={6} blooms index={i} />
              </div>
              <h3 className="font-display -ml-[0.125em] text-[24px] leading-snug text-ink self-end sm:mt-5">
                {t.title}
              </h3>
              <p className="font-sans text-[17px] leading-[1.5] text-ink-2 mt-1 sm:mt-3">{t.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
