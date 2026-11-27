import { describe, expect, it } from "vitest";
import { STEM_KEYS, spritePalette } from "./PixelSprite";
import * as sprites from "./sprites";
import { STEM_COLORS } from "./sprites";
import { HEADS, TINTS } from "./tints";
import type { Palette, SpriteMap } from "./sprites";

/*
 * No flower on the site is grey or black. Every colour a sprite can be drawn
 * with is checked here, in the night and the day theme: the heads in each
 * tint, and every pixel of every sprite as BloomSprite would draw it. Stems,
 * leaves (STEM_KEYS) are left out: they are green.
 */

const GREY_BELOW = 0.15; // HSL saturation
const BLACK_BELOW = 0.02; // relative luminance, about #262626

function saturation(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const isDrab = (hex: string) => saturation(hex) < GREY_BELOW || luminance(hex) < BLACK_BELOW;

/** The petal and head colours of a palette that are grey or near-black. */
const drab = (palette: Palette) =>
  Object.entries(palette)
    .filter(([key]) => !STEM_KEYS.has(key))
    .filter(([, hex]) => isDrab(hex))
    .map(([key, hex]) => `${key} ${hex}`);

const themes = ["dark", "light"] as const;

describe("the check itself", () => {
  it("calls a grey or a black what it is, and a colour a colour", () => {
    expect(["#5a6070", "#c9cdd6", "#aab1bb", "#111111", "#ffffff"].map(isDrab)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(["#4c8dff", "#c8143c", "#f5c518", "#5a3a1a", "#dbe8fd"].map(isDrab)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("the heads", () => {
  it.each(themes.flatMap((theme) => TINTS.map((tint) => [theme, tint] as const)))(
    "have no grey or black petals: %s, %s",
    (theme, tint) => {
      expect(drab(HEADS[theme][tint])).toEqual([]);
    },
  );
});

describe("the stems", () => {
  it.each(themes)("are green, and the palette holds nothing but stems and leaves: %s", (theme) => {
    const palette = STEM_COLORS[theme];
    expect(Object.keys(palette).every((key) => STEM_KEYS.has(key))).toBe(true);
    expect(isDrab(palette.g)).toBe(false);
    expect(isDrab(palette.G)).toBe(false);
  });
});

describe("every sprite as it is drawn", () => {
  const maps = Object.entries(sprites).filter(
    (entry): entry is [string, SpriteMap] =>
      Array.isArray(entry[1]) && entry[1].every((row) => typeof row === "string"),
  );

  it("is found: the sprites are not hiding from this test", () => {
    expect(maps.map(([name]) => name)).toEqual(
      expect.arrayContaining(["DAISY", "TULIP", "BLOOM", "ASTER", "BUD", "SPROUT"]),
    );
  });

  it.each(maps)("%s has a colour for every pixel, and none of its petals is grey or black", (_name, map) => {
    for (const theme of themes) {
      for (const tint of TINTS) {
        const palette = spritePalette(theme, tint);
        const pixels = new Set(map.flatMap((row) => [...row]).filter((ch) => ch !== "."));
        const missing = [...pixels].filter((ch) => !palette[ch]);
        expect(missing, `${theme} ${tint}`).toEqual([]);
        const colours = Object.fromEntries([...pixels].map((ch) => [ch, palette[ch]]));
        expect(drab(colours), `${theme} ${tint}`).toEqual([]);
      }
    }
  });
});
