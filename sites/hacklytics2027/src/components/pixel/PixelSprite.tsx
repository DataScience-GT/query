import React from "react";
import { PALETTES, PALETTES_LIGHT } from "./sprites";
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
const STEM_KEYS = new Set(["g", "G", "s", "S", "d", "r"]);
const pick = (palette: Palette, stem: boolean): Palette =>
  Object.fromEntries(Object.entries(palette).filter(([k]) => STEM_KEYS.has(k) === stem));

const STEM = pick(PALETTES.dormant, true);
const BUD = pick(PALETTES.dormant, false); // the closed bud: grey
const HEAD = pick(PALETTES.bloom, false); // open: pink
const STEM_L = pick(PALETTES_LIGHT.dormant, true);
const BUD_L = pick(PALETTES_LIGHT.dormant, false);
const HEAD_L = pick(PALETTES_LIGHT.bloom, false);

type Theme = "dark" | "light";

const LAYERS: Record<Theme, { stem: Palette; bud: Palette; head: Palette; dormant: Palette }> = {
  dark: { stem: STEM, bud: BUD, head: HEAD, dormant: PALETTES.dormant },
  light: { stem: STEM_L, bud: BUD_L, head: HEAD_L, dormant: PALETTES_LIGHT.dormant },
};

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

/** Per-row growth speed of a stem, and how long the grey bud holds. */
const ROW_MS = 40;
const BUD_MS = 220;

/** First row with a stem pixel; the sprite's height if it has none. */
function stemTop(map: SpriteMap) {
  const i = map.findIndex((row) => [...row].some((ch) => STEM_KEYS.has(ch)));
  return i === -1 ? map.length : i;
}

const ms = (n: number) => `${Math.round(n)}ms`;

/**
 * One plant in a bed. A dormant one is a single grey image. One that blooms
 * is three stacked copies (stem, grey bud, pink head), each drawn in the night
 * and the day colours, that the stylesheet plays in order once the bed's
 * data-bloom is "on": the stem grows row by row, the bud appears, then pops
 * open pink. The timings are computed here and handed over as custom
 * properties; see .flower-stem in app/globals.css.
 */
export function BloomSprite({
  map,
  scale = 4,
  blooms = false,
  index = 0,
  flip = false,
  className = "inline-block",
}: {
  map: SpriteMap;
  scale?: number;
  blooms?: boolean;
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
            <PixelImage map={map} palette={LAYERS[theme].dormant} scale={scale} className="block" />
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
            <PixelImage map={map} palette={LAYERS[theme].stem} scale={scale} className="flower-stem relative block" />
            <PixelImage map={map} palette={LAYERS[theme].bud} scale={scale} className="flower-bud absolute left-0 top-0 block" />
            <PixelImage map={map} palette={LAYERS[theme].head} scale={scale} className="flower-head absolute left-0 top-0 block" />
          </>
        )}
      />
    </span>
  );
}
