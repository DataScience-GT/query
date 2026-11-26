import { BLOOM_TINTS } from "@query/core";
import { describe, expect, it } from "vitest";
import { BED_SIZE, bloomSet, plantBed, withBlooms } from "./beds";
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
    expect(TINTS).toHaveLength(8);
    for (const tint of TINTS) expect(HEADS.dark[tint].P).toBe(BLOOM_TINTS[tint]);
    expect(new Set(TINTS.map((t) => HEADS.dark[t].P)).size).toBe(TINTS.length);
  });

  it("colours every key a sprite head uses", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const tint of TINTS) {
        expect(Object.keys(HEADS[theme][tint]).sort(), `${theme} ${tint}`).toEqual(
          ["M", "P", "W", "Y", "c", "m", "p", "w"],
        );
      }
    }
  });

  it("keeps the day outline readable on the pale ground, even for the white daisy", () => {
    for (const tint of TINTS) {
      const { p } = headPalette(tint, "light");
      expect(contrast(p, LIGHT_GROUND), tint).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives the white and yellow flowers a centre that shows", () => {
    for (const tint of ["daisy", "sunflower"] as const) {
      const { Y, P } = HEADS.dark[tint];
      expect(Y, tint).not.toBe(P);
      expect(contrast(Y, P), tint).toBeGreaterThanOrEqual(1.5);
    }
  });
});

describe("a bed in bloom", () => {
  const bedWith = (n: number, offset = 0) => withBlooms(plantBed(2), bloomSet(n), offset);
  // The tiers a visitor can see: every fourth plant on a phone, every other
  // from md, all of them from xl.
  const tiers = [4, 2, 1];

  it("is deterministic, so the server and the client draw the same garden", () => {
    expect(bedWith(7, 3)).toEqual(bedWith(7, 3));
  });

  it("opens each of the first eight flowers in a different colour", () => {
    for (let n = 1; n <= TINTS.length; n++) {
      const tints = bedWith(n).filter((p) => p.blooms).map((p) => p.tint);
      expect(tints).toHaveLength(n);
      expect(new Set(tints).size, `${n} in bloom`).toBe(n);
    }
  });

  it("never opens two flowers of the same colour side by side at any tier", () => {
    for (let n = 1; n <= BED_SIZE; n++) {
      for (const step of tiers) {
        const shown = bedWith(n, 3)
          .filter((p, i) => i % step === 0 && p.blooms)
          .map((p) => p.tint);
        shown.slice(1).forEach((tint, k) => {
          expect(tint, `${n} in bloom, every ${step}: ${shown.join()}`).not.toBe(shown[k]);
        });
      }
    }
  });

  it("leaves dormant plants without a colour", () => {
    expect(bedWith(3).filter((p) => !p.blooms).every((p) => p.tint === undefined)).toBe(true);
  });
});
