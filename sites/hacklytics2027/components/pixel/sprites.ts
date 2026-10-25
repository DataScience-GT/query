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

/** Round bloom on a stem — the "digital lotus", but made of pixels. The head
 *  is one solid disc with no detached pixels, so the neon halo (a copy of the
 *  head pixels only) frames a flower instead of drawing a star. 15 rows, 90px
 *  at scale 6. */
export const BLOOM: SpriteMap = [
  "....ppp....",
  "..ppPPPpp..",
  ".pPPPPPPPp.",
  ".pPPcccPPp.",
  "pPPcYYYcPPp",
  ".pPPcccPPp.",
  ".pPPPPPPPp.",
  "..ppPPPpp..",
  "....ppp....",
  ".....g.....",
  "..GG.g.....",
  ".G..Gg.GG..",
  ".....gG..G.",
  ".....g.....",
  "....ggg....",
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
   stems. "bloom" is the one accent, the ribbon pink going to white at the
   centre, like the blossoms in the globe art. Stems and leaves are the sage
   of its land and they never change. */

const shared = {
  g: "#5f8f67",
  G: "#96bf98",
  s: "#5a6070",
  S: "#3a3e4a",
  d: "#1a1c23",
  r: "#262731",
};

export const PALETTES: Record<"bloom" | "dormant", Palette> = {
  bloom: {
    ...shared,
    p: "#e58aa4",
    P: "#ffbfcf",
    c: "#ffe3ea",
    Y: "#ffffff",
    W: "#ffffff",
    m: "#e58aa4",
    M: "#ffbfcf",
    w: "#ffffff",
  },
  dormant: {
    ...shared,
    p: "#3a3e4a",
    P: "#5a6070",
    c: "#8a90a0",
    Y: "#c9cdd6",
    W: "#c9cdd6",
    m: "#3a3e4a",
    M: "#5a6070",
    w: "#8a90a0",
  },
};

export type PaletteName = keyof typeof PALETTES;
