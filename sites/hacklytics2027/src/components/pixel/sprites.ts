/**
 * Pixel-art sprite maps — Terraria-style flora for the Digital Bloom theme.
 *
 * Each sprite is a string[] where one character = one pixel. Characters are
 * looked up in a palette, so the same map can be drawn in any of the flower
 * tints (tints.ts). "." is transparent.
 *
 *   p/P  petal dark / light      c  petal core      Y  bloom center
 *   g    stem                    G  leaf
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
 *  is one solid disc with no detached pixels. 15 rows, 90px at scale 6. */
export const BLOOM: SpriteMap = [
  "....ppp....",
  "..ppPPPpp..",
  ".pPPPPPPPp.",
  ".pPPcYcPPp.",
  "pPPcYYYcPPp",
  ".pPPcYcPPp.",
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

/** A star of petals on a stem: the fourth of the track flowers, 16 rows like the daisy. */
export const ASTER: SpriteMap = [
  ".....p.....",
  "....pPp....",
  ".p..pPp..p.",
  ".pPpPcPpPp.",
  "pPPPcYcPPPp",
  ".pPpPcPpPp.",
  ".p..pPp..p.",
  "....pPp....",
  ".....p.....",
  ".....g.....",
  "..GG.g.....",
  ".G..Gg.....",
  ".....g.GG..",
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

/* ─── Palettes ───────────────────────────────────────────────────────────
   Stems and leaves only. A flower's petals and heads are never grey:
   they take one of the portal's flower tints (tints.ts). Stems and leaves are
   the sage of the globe art's land and they never change. */

const night: Palette = {
  g: "#5f8f67",
  G: "#96bf98",
};

/* Day: the night pastels wash out on the pale ground (#f1f4f6), so the light
   set uses the deeper sage of globals.css: on that ground the leaves are
   3.9:1 and the stem 5.1:1. The tints deepen the same way (tints.ts). Sprites
   bake their colours, so BloomSprite draws both sets and the stylesheet shows
   one (.px-light). */
const day: Palette = {
  g: "#3b7440",
  G: "#4a8750",
};

export const STEM_COLORS = { dark: night, light: day } as const;
