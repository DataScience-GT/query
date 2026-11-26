import { describe, expect, it } from "vitest";
import event from "../event.config";
import { TRACK_SPRITES } from "./SectionArt";

describe("track art", () => {
  const tracks = event.tracks.map((t) => t.title);

  it("draws every track, and nothing else", () => {
    expect(Object.keys(TRACK_SPRITES).sort()).toEqual([...tracks].sort());
  });

  it("draws every flower in the same box of 16 rows by 11 columns", () => {
    for (const title of tracks) {
      const { map } = TRACK_SPRITES[title];
      expect(map, title).toHaveLength(16);
      expect(new Set(map.map((row) => row.length)), title).toEqual(new Set([11]));
    }
  });

  it("keeps the stem on the centre column, whatever the sprite's width", () => {
    for (const title of tracks) {
      const { map } = TRACK_SPRITES[title];
      // The rows with one stem pixel; the root row is three wide.
      const stems = map
        .filter((row) => [...row].filter((c) => c === "g").length === 1)
        .map((row) => row.indexOf("g"));
      expect(new Set(stems), title).toEqual(new Set([5]));
    }
  });

  it("gives each track a flower of its own, in a colour of its own", () => {
    const sprites = tracks.map((t) => TRACK_SPRITES[t]);
    expect(new Set(sprites.map((s) => s.map.join("\n"))).size).toBe(tracks.length);
    expect(new Set(sprites.map((s) => s.tint)).size).toBe(tracks.length);
  });
});
