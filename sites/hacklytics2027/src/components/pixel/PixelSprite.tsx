import React from "react";
import { STEM_COLORS } from "./sprites";
import { spriteToDataUri } from "./spriteUri";
import { HEADS, TINTS } from "./tints";
import type { Palette, SpriteMap } from "./sprites";
import type { Tint } from "./tints";

/**
 * A sprite rendered as a single <img> off a data URI instead of ~25 <rect>
 * nodes. Flora is repeated dozens of times, and the browser decodes an
 * identical data URI once and reuses it — far cheaper than the equivalent SVG
 * DOM.
 */
export function PixelImage({
  map,
  palette,
  scale = 4,
  className = "",
  style,
}: {
  map: SpriteMap;
  palette: Palette;
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
      style={{
        imageRendering: "pixelated",
        // A bed sets --bed to double its plants. Always a whole number, so a
        // sprite pixel stays a whole number of screen pixels.
        width: `calc(${w * scale}px * var(--bed, 1))`,
        height: `calc(${h * scale}px * var(--bed, 1))`,
        ...style,
      }}
    />
  );
}

/* Stem pixels grow from the soil; everything else is the head. */
export const STEM_KEYS = new Set(["g", "G", "d", "r"]);

type Theme = "dark" | "light";

/** A flower drawn whole, stem and head, in one image: what a plant is when it
 *  does not grow in. Never grey: the head is always one of the tints. */
export const spritePalette = (theme: Theme, tint: Tint): Palette => ({
  ...STEM_COLORS[theme],
  ...HEADS[theme][tint],
});

const WHOLE = Object.fromEntries(
  (["dark", "light"] as const).map((theme) => [
    theme,
    Object.fromEntries(TINTS.map((tint) => [tint, spritePalette(theme, tint)])),
  ]),
) as Record<Theme, Record<Tint, Palette>>;

/** The plant drawn twice, in the night and the day colours, which are baked
 *  into the images. The day copy sits on top of the night one, and .px-light
 *  in app/globals.css fades out whichever does not match the theme. Opacity,
 *  not display: hiding with display would restart the bloom animations on
 *  every theme change. The night copy stays in flow, so its absolute layers
 *  still place against the plant's own box. */
function BothThemes({ draw }: { draw: (theme: Theme) => React.ReactNode }) {
  return (
    <>
      <span className="px-dark block">{draw("dark")}</span>
      <span className="px-light absolute inset-0 block">{draw("light")}</span>
    </>
  );
}

/** Per-row growth speed of a stem, and how long the closed bud holds. */
const ROW_MS = 40;
const BUD_MS = 220;

/** First row with a stem pixel; the sprite's height if it has none. */
function stemTop(map: SpriteMap) {
  const i = map.findIndex((row) => [...row].some((ch) => STEM_KEYS.has(ch)));
  return i === -1 ? map.length : i;
}

const ms = (n: number) => `${Math.round(n)}ms`;

/**
 * A plant in a bed. One that does not bloom is a single image of the whole
 * flower, open, in its tint. One that blooms is two stacked copies (stem and
 * head), each drawn in the night and the day colours, that the stylesheet plays
 * in order once the bed's data-bloom is "on": the stem grows row by row, the
 * head appears as a small bud in its tint, then pops open. Nothing on the site
 * is ever grey. The timings are computed here and handed over as custom
 * properties; see .flower-stem in app/globals.css.
 */
export function BloomSprite({
  map,
  scale = 4,
  blooms = false,
  tint = "lotus",
  index = 0,
  flip = false,
  className = "inline-block",
}: {
  map: SpriteMap;
  scale?: number;
  blooms?: boolean;
  /** The colour it opens in. */
  tint?: Tint;
  /** Place in the left-to-right wave. It starts growing index × --step
   *  (80ms unless the bed sets it) after the bed blooms. */
  index?: number;
  flip?: boolean;
  /** Includes the display class (inline-block by default) so a bed can hide it per breakpoint. */
  className?: string;
}) {
  // Flip lives on the wrapper: the layers' own transforms are the animation.
  const flipStyle = flip ? { transform: "scaleX(-1)" } : undefined;

  if (!blooms) {
    return (
      <span className={`relative shrink-0 ${className}`} style={flipStyle}>
        <BothThemes
          draw={(theme) => (
            <PixelImage map={map} palette={WHOLE[theme][tint]} scale={scale} className="block" />
          )}
        />
      </span>
    );
  }

  const top = stemTop(map);
  const rows = map.length - top;
  const grow = Math.max(1, rows * ROW_MS);
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
    "--px": `calc(${scale}px * var(--bed, 1))`,
  } as React.CSSProperties;

  return (
    <span
      className={`relative shrink-0 ${className}`}
      style={{ ...vars, ...flipStyle }}
    >
      <BothThemes
        draw={(theme) => (
          <>
            <PixelImage map={map} palette={STEM_COLORS[theme]} scale={scale} className="flower-stem relative block" />
            <PixelImage map={map} palette={HEADS[theme][tint]} scale={scale} className="flower-head absolute left-0 top-0 block" />
          </>
        )}
      />
    </span>
  );
}
