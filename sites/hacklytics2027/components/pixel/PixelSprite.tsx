import React from "react";
import { PALETTES } from "./sprites";
import { spriteToDataUri } from "./spriteUri";
import type { PaletteName, Palette, SpriteMap } from "./sprites";

/**
 * A sprite rendered as a single <img> off a data URI instead of ~25 <rect>
 * nodes. Flora is repeated dozens of times, and the browser decodes an
 * identical data URI once and reuses it — far cheaper than the equivalent SVG
 * DOM.
 */
export function PixelImage({
  map,
  palette = "dormant",
  scale = 4,
  className = "",
  style,
}: {
  map: SpriteMap;
  palette?: PaletteName | Palette;
  /** Pixels per sprite pixel. */
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { uri, w, h } = spriteToDataUri(map, palette);
  const src = uri.slice(5, -2); // strip url(" ... ")

  return (
    <img
      src={src}
      alt=""
      width={w * scale}
      height={h * scale}
      decoding="async"
      className={className}
      style={{ imageRendering: "pixelated", ...style }}
    />
  );
}

/* Stem pixels grow from the soil; everything else is the head. */
const STEM_KEYS = new Set(["g", "G", "s", "S", "d", "r"]);
const pick = (palette: Palette, stem: boolean): Palette =>
  Object.fromEntries(Object.entries(palette).filter(([k]) => STEM_KEYS.has(k) === stem));

const STEM = pick(PALETTES.dormant, true);
const BUD = pick(PALETTES.dormant, false); // the closed bud: grey
const HEAD = pick(PALETTES.bloom, false); // open: pink

/** Per-row growth speed of a stem, and how long the grey bud holds. */
const ROW_MS = 40;
const BUD_MS = 220;
const FLASH_MS = 120;
const BREATHE_MS = 4000;

/** First row with a stem pixel; the sprite's height if it has none. */
function stemTop(map: SpriteMap) {
  const i = map.findIndex((row) => [...row].some((ch) => STEM_KEYS.has(ch)));
  return i === -1 ? map.length : i;
}

const ms = (n: number) => `${Math.round(n)}ms`;

/**
 * One plant in a bed. A dormant one is a single grey image. One that blooms
 * is four stacked copies (stem, grey bud, neon halo, pink head) that the
 * stylesheet plays in order once the bed's data-bloom is "on": the stem grows
 * row by row, the bud appears, then pops open pink with a neon flash, and the
 * halo breathes. The timings are computed here and handed over as custom
 * properties; see .flower-stem in app/globals.css.
 */
export function BloomSprite({
  map,
  scale = 4,
  blooms = false,
  index = 0,
  phase,
  flip = false,
  className = "inline-block",
}: {
  map: SpriteMap;
  scale?: number;
  blooms?: boolean;
  /** Place in the left-to-right wave. It starts growing index × --step
   *  (80ms unless the bed sets it) after the bed blooms. */
  index?: number;
  /** Offset of this flower's breathing, so a bed never pulses in unison. */
  phase?: number;
  flip?: boolean;
  /** Includes the display class (inline-block by default) so a bed can hide it per breakpoint. */
  className?: string;
}) {
  // Flip lives on the wrapper: the layers' own transforms are the animation.
  const flipStyle = flip ? { transform: "scaleX(-1)" } : undefined;

  if (!blooms) {
    return (
      <span className={`relative shrink-0 ${className}`} style={flipStyle}>
        <PixelImage map={map} palette="dormant" scale={scale} className="block" />
      </span>
    );
  }

  const top = stemTop(map);
  const rows = map.length - top;
  const grow = Math.max(1, rows * ROW_MS);
  const breathe = (phase ?? index * 1040) % BREATHE_MS;
  // The delays chain off --d in CSS, because --step (and so --d) can change
  // with the breakpoint: a bed showing every other plant on phones keeps
  // its neighbours 80ms apart.
  const vars = {
    "--top": `${(top / map.length) * 100}%`,
    "--rows": String(Math.max(1, rows)),
    "--grow": ms(grow),
    "--bud": ms(BUD_MS),
    "--d": `calc(${index} * var(--step, 80ms))`,
    "--t1": `calc(var(--d) + ${ms(grow)})`,
    "--t2": `calc(var(--t1) + ${ms(BUD_MS)})`,
    "--t3": `calc(var(--t2) + ${ms(FLASH_MS + breathe)})`,
    "--px": `${scale}px`,
  } as React.CSSProperties;

  return (
    <span
      className={`relative shrink-0 ${className}`}
      style={{ ...vars, ...flipStyle }}
    >
      <PixelImage map={map} palette={STEM} scale={scale} className="flower-stem relative block" />
      <PixelImage map={map} palette={BUD} scale={scale} className="flower-bud absolute left-0 top-0 block" />
      <PixelImage map={map} palette={HEAD} scale={scale} className="flower-neon absolute left-0 top-0 block" />
      <PixelImage map={map} palette={HEAD} scale={scale} className="flower-head absolute left-0 top-0 block" />
    </span>
  );
}
