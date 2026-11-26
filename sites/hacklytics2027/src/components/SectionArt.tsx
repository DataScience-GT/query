import React from "react";
import { BLOOM_TINTS } from "@query/core";
import { BloomSprite } from "./pixel/PixelSprite";
import { ASTER, BUD, DAISY, BLOOM, SPROUT, TULIP } from "./pixel/sprites";
import type { SpriteMap } from "./pixel/sprites";
import type { Tint } from "./pixel/tints";

/*
 * The pixel plants the event kit's sections draw: one per track, a plot of
 * seedlings under Judges and Sponsors, and the bud and tulip at the ends of
 * the schedule rail. Handed to <HomeSections art={...}> from pages/index.astro.
 */

/* Four equal cards: every track's flower is a 16 by 11 box of sprite pixels,
   drawn at the same scale, in a colour of its own. A sprite smaller than that
   gets blank rows on top and blank columns on both sides, so its head does not
   sit lower than the others' or its stem off centre. */
const TRACK_ROWS = 16;
const TRACK_COLS = 11;
const boxed = (map: SpriteMap): SpriteMap => {
  const left = Math.floor((TRACK_COLS - Math.max(...map.map((row) => row.length))) / 2);
  return [
    ...Array<string>(TRACK_ROWS - map.length).fill(".".repeat(TRACK_COLS)),
    ...map.map((row) => ".".repeat(left) + row.padEnd(TRACK_COLS - left, ".")),
  ];
};

export const TRACK_SPRITES: Record<string, { map: SpriteMap; tint: Tint }> = {
  Finance: { map: boxed(DAISY), tint: "cherry_blossom" },
  "Sports Analytics": { map: boxed(TULIP), tint: "lily" },
  Healthcare: { map: boxed(BLOOM), tint: "rose" },
  Entertainment: { map: boxed(ASTER), tint: "sunflower" },
};

const FALLBACK_TRACK: { map: SpriteMap; tint: Tint } = { map: boxed(DAISY), tint: "lotus" };

// The signature: the plants are dormant until the row is seen, then open in
// their own colours one after another, left to right. scripts/bloom.ts flips
// data-bloom on the first time the row is in view. The card's art cell gets a
// wash of the flower's colour behind it.
export function TrackArt({ track, index }: { track: { title: string }; index: number }) {
  const { map, tint } = TRACK_SPRITES[track.title] ?? FALLBACK_TRACK;
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: `color-mix(in srgb, ${BLOOM_TINTS[tint]} 14%, transparent)` }}
      />
      <BloomSprite map={map} scale={6} blooms tint={tint} index={index} />
    </>
  );
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
// Five plants in five of the portal's tints, opening one after another when the
// plot is seen: the people who keep the weekend growing.
export const VolunteersPlot = () => (
  <>
    <BloomSprite map={BUD} scale={4} blooms tint="orchid" index={0} />
    <BloomSprite map={TULIP} scale={4} blooms tint="tulip" index={1} />
    <BloomSprite map={DAISY} scale={4} blooms tint="lotus" index={2} />
    <BloomSprite map={BUD} scale={4} blooms tint="cherry_blossom" index={3} />
    <BloomSprite map={TULIP} scale={4} blooms tint="lily" index={4} />
  </>
);

// An empty plot: the seedlings are the 2027 partners, not announced yet.
export const SponsorsPlot = plot([BUD, TULIP, BUD, DAISY, BUD]);

// A bud where hacking begins, in bloom where it ends.
export const RailStart = () => <BloomSprite map={BUD} scale={3} />;
export const RailEnd = () => <BloomSprite map={TULIP} scale={3} blooms tint="sunflower" />;
