import React from "react";
import { BloomSprite } from "./pixel/PixelSprite";
import { BUD, DAISY, BLOOM, MUSHROOM, SPROUT, TULIP } from "./pixel/sprites";
import type { SpriteMap } from "./pixel/sprites";

/*
 * The pixel plants the event kit's sections draw: one per track, a plot of
 * seedlings under Judges and Sponsors, and the bud and tulip at the ends of
 * the schedule rail. Handed to <HomeSections art={...}> from pages/index.astro.
 */

const TRACK_SPRITES: Record<string, SpriteMap> = {
  Finance: DAISY,
  "Sports Analytics": TULIP,
  Healthcare: BLOOM,
  Entertainment: MUSHROOM,
};

// The signature: the plants are dormant until the row is seen, then ribbon
// pink one after another, left to right. scripts/bloom.ts flips data-bloom on
// the first time the row is in view.
export function TrackArt({ track, index }: { track: { title: string }; index: number }) {
  return <BloomSprite map={TRACK_SPRITES[track.title] ?? DAISY} scale={6} blooms index={index} />;
}

const plot = (maps: SpriteMap[]) =>
  function Plot() {
    return (
      <>
        {maps.map((map, i) => (
          <BloomSprite key={i} map={map} scale={4} />
        ))}
      </>
    );
  };

export const JudgesPlot = plot([SPROUT, DAISY, SPROUT, TULIP, SPROUT]);
// An empty plot: the seedlings are the 2027 partners, not announced yet.
export const SponsorsPlot = plot([BUD, TULIP, BUD, DAISY, BUD]);

// A bud where hacking begins, in bloom where it ends.
export const RailStart = () => <BloomSprite map={BUD} scale={3} />;
export const RailEnd = () => <BloomSprite map={TULIP} scale={3} blooms />;
