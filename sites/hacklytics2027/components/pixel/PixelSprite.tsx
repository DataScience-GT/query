import React from "react";
import { PALETTES } from "./sprites";
import { spriteToDataUri } from "./spriteUri";
import type { PaletteName, Palette, SpriteMap } from "./sprites";

/**
 * Renders a pixel map as an SVG of 1×1 rects. Runs of identical pixels on a row
 * are merged into a single rect so a 16×16 sprite costs ~30 nodes, not 256.
 */
function rowRects(row: string, y: number, palette: Palette) {
  const rects: React.ReactElement[] = [];
  let x = 0;

  while (x < row.length) {
    const ch = row[x];
    if (ch === "." || !palette[ch]) {
      x++;
      continue;
    }
    let run = 1;
    while (row[x + run] === ch) run++;
    rects.push(
      <rect key={`${y}-${x}`} x={x} y={y} width={run} height={1} fill={palette[ch]} />,
    );
    x += run;
  }
  return rects;
}

export default function PixelSprite({
  map,
  palette = "pink",
  scale = 4,
  className = "",
  style,
  glow = false,
}: {
  map: SpriteMap;
  palette?: PaletteName | Palette;
  /** Pixels per sprite pixel. */
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Drop a colored halo behind the sprite — used for the neon blooms. */
  glow?: boolean;
}) {
  const colors = typeof palette === "string" ? PALETTES[palette] : palette;
  const w = Math.max(...map.map((r) => r.length));
  const h = map.length;

  const svg = (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={glow ? "relative block" : className}
      style={glow ? { imageRendering: "pixelated" } : { imageRendering: "pixelated", ...style }}
    >
      {map.map((row, y) => rowRects(row, y, colors))}
    </svg>
  );

  if (!glow) return svg;
  return withGlow(svg, w * scale, h * scale, colors, className, style);
}

/** Shared halo wrapper for both the SVG and the image renderer. */
function withGlow(
  node: React.ReactNode,
  w: number,
  h: number,
  colors: Palette,
  className = "",
  style?: React.CSSProperties,
) {
  return (
    <span className={`relative inline-block ${className}`} style={style} aria-hidden="true">
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: w * 2,
          height: h * 2,
          background: `radial-gradient(circle, ${colors.P ?? "#fff"}55 0%, transparent 65%)`,
        }}
      />
      {node}
    </span>
  );
}

/**
 * Same art, rendered as a single <img> off a data URI instead of ~25 <rect>
 * nodes. Decorative sprites are repeated dozens of times, and the browser
 * decodes an identical data URI once and reuses it — far cheaper than the
 * equivalent SVG DOM. Use this for background flora; use PixelSprite where the
 * sprite is small in number or needs to stay inline with text.
 */
export function PixelImage({
  map,
  palette = "pink",
  scale = 4,
  className = "",
  style,
  glow = false,
}: {
  map: SpriteMap;
  palette?: PaletteName | Palette;
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
  glow?: boolean;
}) {
  const colors = typeof palette === "string" ? PALETTES[palette] : palette;
  const { uri, w, h } = spriteToDataUri(map, palette);
  const src = uri.slice(5, -2); // strip url(" ... ")

  const img = (
     
    <img
      src={src}
      alt=""
      width={w * scale}
      height={h * scale}
      decoding="async"
      className={glow ? "relative block" : className}
      style={glow ? { imageRendering: "pixelated" } : { imageRendering: "pixelated", ...style }}
    />
  );

  if (!glow) return img;
  return withGlow(img, w * scale, h * scale, colors, className, style);
}
