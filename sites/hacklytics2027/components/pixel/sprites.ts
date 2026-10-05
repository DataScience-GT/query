/**
 * Pixel-art sprite maps — Terraria-style flora for the Digital Bloom theme.
 *
 * Each sprite is a string[] where one character = one pixel. Characters are
 * looked up in a palette, so the same map can be drawn dormant (grey) or in
 * bloom (pink). "." is transparent.
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

/* ─── Palettes ───────────────────────────────────────────────────────────
   Two states, not four colours. "dormant" is the night: grey petals on green
   stems. "bloom" is the one accent, pink. Stems and leaves are the only green
   on the page and they never change. */

const shared = {
  g: "#2f6b3a",
  G: "#4c9a55",
  s: "#5a625c",
  S: "#3a403c",
  d: "#1e2420",
  r: "#2a302c",
};

export const PALETTES: Record<"bloom" | "dormant", Palette> = {
  bloom: {
    ...shared,
    p: "#b8285a",
    P: "#ff4f8b",
    c: "#ffc2d6",
    Y: "#ffe9f0",
    W: "#ffffff",
    m: "#b8285a",
    M: "#ff4f8b",
    w: "#ffe9f0",
  },
  dormant: {
    ...shared,
    p: "#3a403c",
    P: "#5a625c",
    c: "#8a938c",
    Y: "#c9cfc9",
    W: "#c9cfc9",
    m: "#3a403c",
    M: "#5a625c",
    w: "#8a938c",
  },
};

export type PaletteName = keyof typeof PALETTES;
