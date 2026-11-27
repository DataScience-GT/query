import { BLOOM_TINTS } from "@query/core";
import { describe, expect, it } from "vitest";
import { BED_SIZE, plantBed, tintAt } from "./beds";
import { HEADS, TINTS, headPalette } from "./tints";

// The light theme's --ground in styles/globals.css.
const LIGHT_GROUND = "#f1f4f6";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("headPalette", () => {
  it("opens night flowers in the portal's tint, one colour per flower", () => {
    for (const tint of TINTS) expect(HEADS.dark[tint].P).toBe(BLOOM_TINTS[tint]);
    expect(new Set(TINTS.map((t) => HEADS.dark[t].P)).size).toBe(TINTS.length);
  });

  it("uses seven of the portal's eight: the white daisy has no hue to tell it from grey", () => {
    expect(TINTS).toHaveLength(7);
    expect(TINTS).not.toContain("daisy");
    expect(Object.keys(BLOOM_TINTS).sort()).toEqual([...TINTS, "daisy"].sort());
  });

  it("colours every key a sprite head uses", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const tint of TINTS) {
        expect(Object.keys(HEADS[theme][tint]).sort(), `${theme} ${tint}`).toEqual([
          "P",
          "Y",
          "c",
          "p",
        ]);
      }
    }
  });

  it("keeps the day outline readable on the pale ground", () => {
    for (const tint of TINTS) {
      const { p } = headPalette(tint, "light");
      expect(contrast(p, LIGHT_GROUND), tint).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives the yellow flower a centre that shows", () => {
    const { Y, P } = HEADS.dark.sunflower;
    expect(Y).not.toBe(P);
    expect(contrast(Y, P)).toBeGreaterThanOrEqual(1.5);
  });
});

describe("a bed", () => {
  // The tiers a visitor sees: every fourth plant on a phone, every other from
  // md, all of them from xl.
  const tiers = [4, 2, 1];
  const seeds = [0, 2, 3];
  const tintsOf = (seed: number, step: number) =>
    plantBed(seed)
      .filter((_, i) => i % step === 0)
      .map((p) => p.tint);

  it("is deterministic, so the server and the client draw the same garden", () => {
    expect(plantBed(2)).toEqual(plantBed(2));
  });

  it("gives every plant a tint, so none has to be drawn without one", () => {
    for (const seed of seeds) {
      expect(plantBed(seed)).toHaveLength(BED_SIZE);
      expect(plantBed(seed).every((p) => TINTS.includes(p.tint))).toBe(true);
    }
  });

  it("never puts the same colour next to itself at any tier", () => {
    for (const seed of seeds) {
      for (const step of tiers) {
        const tints = tintsOf(seed, step);
        tints.slice(1).forEach((tint, k) => {
          expect(tint, `seed ${seed}, every ${step}: ${tints.join()}`).not.toBe(tints[k]);
        });
      }
    }
  });

  it("shows five different colours on a phone, and all seven from md", () => {
    for (const seed of seeds) {
      expect(new Set(tintsOf(seed, 4)).size).toBe(5);
      expect(new Set(tintsOf(seed, 2)).size).toBe(TINTS.length);
    }
  });

  it("starts each bed on a different colour", () => {
    expect(new Set(seeds.map((seed) => tintAt(0, seed))).size).toBe(seeds.length);
  });
});
