import { describe, expect, it } from "vitest";
import { FOOD_GROUPS } from "@query/api/discord-config";
import { BLOOM_FLOWERS, spriteUri } from "./bloom-flowers";

// The Discord roles carry these same colours, so a change here is a change to
// the server's roles too.
const TINTS: Record<string, string> = {
  cherry_blossom: "#4C8DF6",
  sunflower: "#F5C518",
  tulip: "#2CC6B0",
  lily: "#F08A3C",
  lotus: "#E86FA6",
  daisy: "#F4F4F4",
  orchid: "#B07CE8",
  rose: "#C8143C",
};

describe("BLOOM_FLOWERS", () => {
  it("has a flower for every food group and none extra", () => {
    expect(Object.keys(BLOOM_FLOWERS).sort()).toEqual(
      FOOD_GROUPS.map((g) => g.key).sort(),
    );
  });

  it("gives each flower its own map and its own tint", () => {
    const flowers = Object.values(BLOOM_FLOWERS);
    expect(new Set(flowers.map((f) => f.map.join("\n"))).size).toBe(
      flowers.length,
    );
    expect(new Set(flowers.map((f) => f.tint.toLowerCase())).size).toBe(
      flowers.length,
    );
  });

  it("uses the role colour as the tint", () => {
    for (const group of FOOD_GROUPS) {
      expect(BLOOM_FLOWERS[group.key].tint).toBe(TINTS[group.key]);
    }
  });

  it("draws every pixel with a colour, on one grid width", () => {
    for (const group of FOOD_GROUPS) {
      const { map, colors } = BLOOM_FLOWERS[group.key];
      expect(new Set(map.map((row) => row.length)), group.key).toEqual(
        new Set([13]),
      );
      const missing = new Set(
        map.flatMap((row) => [...row]).filter((ch) => ch !== "." && !colors[ch]),
      );
      expect([...missing], group.key).toEqual([]);
    }
  });

  it("shades the petals from the tint", () => {
    for (const group of FOOD_GROUPS) {
      const { colors, tint } = BLOOM_FLOWERS[group.key];
      expect(colors.P, group.key).toBe(tint);
      expect(colors.p, group.key).not.toBe(tint);
      expect(colors.c, group.key).not.toBe(tint);
    }
  });
});

describe("spriteUri", () => {
  it("draws one rect per coloured pixel and skips clear ones", () => {
    const uri = spriteUri(["P.", ".x"], { P: "#fff" });
    const svg = decodeURIComponent(uri.replace("data:image/svg+xml,", ""));
    expect(svg.match(/<rect /g)).toHaveLength(1);
    expect(svg).toContain('viewBox="0 0 2 2"');
  });
});
