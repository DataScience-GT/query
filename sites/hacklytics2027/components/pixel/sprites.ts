/**
 * Pixel-art sprite maps — Terraria-style flora for the Digital Bloom theme.
 *
 * Each sprite is a string[] where one character = one pixel. Characters are
 * looked up in a palette, so the same map can be tinted pink / cyan / lime /
 * purple. "." is transparent.
 *
 *   p/P  petal dark / light      c  petal core      Y  bloom center
 *   W    highlight               g  stem            G  leaf
 *   m/M  cap dark / light        w  cap spots       s/S stalk
 *   d    soil                    r  rock
 */

export type SpriteMap = string[];
export type Palette = Record<string, string>;

/* ─── Flora ────────────────────────────────────────────────────────────── */

export const DAISY: SpriteMap = [
  "....ppp....",
  "...pPPPp...",
  "..pPcccPp..",
  "..pPcYcPp..",
  "..pPcccPp..",
  "...pPPPp...",
  "....ppp....",
  ".....g.....",
  ".....g.....",
  "..GG.g.....",
  ".G..Gg.....",
  ".....g.GG..",
  ".....gG..G.",
  ".....g.....",
  ".....g.....",
  "....ggg....",
];

export const TULIP: SpriteMap = [
  "..p.p.p..",
  ".pPpPpPp.",
  ".pPPcPPp.",
  ".pPPcPPp.",
  "..pPcPp..",
  "...ppp...",
  "....g....",
  "....g....",
  "..GGg....",
  ".G..g....",
  "....gGG..",
  "....g..G.",
  "....g....",
  "....g....",
  "...ggg...",
];

/** Radial bloom — the "digital lotus", but made of pixels. */
export const BLOOM: SpriteMap = [
  ".....p.....",
  "..p..P..p..",
  "...pPPPp...",
  "..pPPcPPp..",
  ".pPPcYcPPp.",
  "pPPcYWYcPPp",
  ".pPPcYcPPp.",
  "..pPPcPPp..",
  "...pPPPp...",
  "..p..P..p..",
  ".....p.....",
];

/** Small tintable bud — used inline next to text. */
export const BUD: SpriteMap = [
  "..ppp..",
  ".pPPPp.",
  ".pPcPp.",
  "..ppp..",
  "...g...",
  "..Gg...",
  "...gG..",
  "...g...",
  "..ggg..",
];

export const SPROUT: SpriteMap = [
  "...G...",
  "..GGG..",
  ".G.g.G.",
  "...g...",
  "..GgG..",
  "...g...",
  "...g...",
  "..ggg..",
];

export const MUSHROOM: SpriteMap = [
  "..mmmmm..",
  ".mMwwwMm.",
  "mMwwwwwMm",
  "mMwwwwwMm",
  ".mmMMMmm.",
  "...sss...",
  "...sSs...",
  "...sss...",
  "..ddddd..",
];

/** Tiny pixel globe — DS@GT mark, not hero art. Cyan water + green land. */
export const GLOBE: SpriteMap = [
  "....ppp....",
  "..ppGGGpp..",
  ".pGGppGGpp.",
  ".pGpppGGGp.",
  "pGppppGGGGp",
  "pGppGGppGGp",
  "pGGpppppGGp",
  ".pGGppGGpp.",
  ".ppGGGGppp.",
  "..ppGGGpp..",
  "....ppp....",
];

/** Vertically tileable vine segment. */
export const VINE: SpriteMap = [
  "...g...",
  "..Gg...",
  ".G.g...",
  "...gG..",
  "...g.G.",
  "...g...",
  "..Gg...",
  "...g...",
];

/** Horizontally tileable grass + soil strip. */
export const GROUND: SpriteMap = [
  "G.G..G.G..G.G..G",
  "GGGGGGGGGGGGGGGG",
  "GGGGGGGGGGGGGGGG",
  "dGddGdddGddGdddG",
  "dddddrddddddrddd",
  "ddrddddddrdddddd",
  "dddddddrdddddddd",
  "drdddddddddrdddd",
  "ddddrdddddddddrd",
  "dddddddddrdddddd",
];

/** Four-pixel sparkle used for drifting spores. */
export const SPORE: SpriteMap = [
  ".W.",
  "WYW",
  ".W.",
];

/* ─── Palettes ─────────────────────────────────────────────────────────── */

const shared = {
  g: "#1f7a3d",
  G: "#3fd66b",
  W: "#ffffff",
  m: "#7a1030",
  M: "#c41f4f",
  w: "#ffe9f0",
  s: "#e8dcc8",
  S: "#c9b898",
  d: "#3a2a1e",
  r: "#55423a",
};

export const PALETTES: Record<"pink" | "cyan" | "lime" | "purple", Palette> = {
  pink: { ...shared, p: "#ff2d78", P: "#ff7aa8", c: "#ffb3cb", Y: "#ffe066" },
  cyan: { ...shared, p: "#00a6bd", P: "#00e5ff", c: "#a8f4ff", Y: "#ffe066" },
  lime: { ...shared, p: "#8fb800", P: "#c8ff00", c: "#e8ff9e", Y: "#fff2a8" },
  purple: { ...shared, p: "#6a00b0", P: "#9b00ff", c: "#d3a3ff", Y: "#ffe066" },
};

export type PaletteName = keyof typeof PALETTES;
