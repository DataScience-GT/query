import React from "react";
import { BloomSprite } from "./pixel/PixelSprite";
import { BUD, DAISY, BLOOM, MUSHROOM, SPROUT, TULIP } from "./pixel/sprites";
import type { SpriteMap } from "./pixel/sprites";
import type { Tint } from "./pixel/tints";

/*
 * The pixel plants the event kit's sections draw: one per track, a plot of
 * seedlings under Judges and Sponsors, and the bud and tulip at the ends of
 * the schedule rail. Handed to <HomeSections art={...}> from pages/index.astro.
 */

const TRACK_SPRITES: Record<string, { map: SpriteMap; tint: Tint }> = {
  Finance: { map: DAISY, tint: "cherry_blossom" },
  "Sports Analytics": { map: TULIP, tint: "lily" },
  Healthcare: { map: BLOOM, tint: "rose" },
  Entertainment: { map: MUSHROOM, tint: "sunflower" },
};

const FALLBACK_TRACK: { map: SpriteMap; tint: Tint } = { map: DAISY, tint: "lotus" };

// The signature: the plants are dormant until the row is seen, then open in
// their own colours one after another, left to right. scripts/bloom.ts flips
// data-bloom on the first time the row is in view.
export function TrackArt({ track, index }: { track: { title: string }; index: number }) {
  const { map, tint } = TRACK_SPRITES[track.title] ?? FALLBACK_TRACK;
  return <BloomSprite map={map} scale={6} blooms tint={tint} index={index} />;
}

// A seed, a bud and a bloom, growing one after another when the block is seen.
export const ThemeArt = () => (
  <>
    <BloomSprite map={SPROUT} scale={6} blooms index={0} />
    <BloomSprite map={BUD} scale={8} blooms tint="tulip" index={1} />
    <BloomSprite map={DAISY} scale={6} blooms tint="sunflower" index={2} />
  </>
);

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
export const RailEnd = () => <BloomSprite map={TULIP} scale={3} blooms tint="sunflower" />;
