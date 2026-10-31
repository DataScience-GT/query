import { BUD, DAISY, MUSHROOM, TULIP } from "./sprites";
import type { SpriteMap } from "./sprites";

export type Plant = { map: SpriteMap; scale: number; blooms?: boolean; flip?: boolean };

/* Deterministic: the same bed on the server and the client. */
const MAPS = [TULIP, DAISY, BUD, DAISY, TULIP, MUSHROOM, DAISY, TULIP];

/** Plants in a full bed (the xl tier); phones show a quarter of them. */
export const BED_SIZE = 20;

/** A bed of BED_SIZE dormant plants. Choose which bloom with bloomSet. */
export function plantBed(seed = 0): Plant[] {
  return Array.from({ length: BED_SIZE }, (_, i) => {
    const n = (seed * 7 + i * 5) % 13;
    return {
      map: MAPS[(i + seed) % MAPS.length],
      scale: 4 + (n % 3),
      flip: n % 2 === 1,
    };
  });
}

/** `n` items of `list`, spread evenly across it. */
const spread = <T,>(list: T[], n: number) =>
  Array.from({ length: n }, (_, k) => list[Math.floor(((k + 0.5) * list.length) / n)]);

/**
 * Which `n` plants of a bed bloom: evenly spaced, and shared between the tiers
 * by size, so the share in bloom reads the same on a phone as on a desktop.
 * The phone tier rounds up first, so two in bloom still shows one there.
 */
export function bloomSet(n: number, total = BED_SIZE): Set<number> {
  const all = Array.from({ length: total }, (_, i) => i);
  const tiers = [
    all.filter((i) => i % 4 === 0),
    all.filter((i) => i % 4 === 2),
    all.filter((i) => i % 2 === 1),
  ];
  const picked: number[] = [];
  let left = Math.min(n, total);
  let room = total;
  for (const tier of tiers) {
    const take = Math.round((left * tier.length) / room);
    picked.push(...spread(tier, take));
    left -= take;
    room -= tier.length;
  }
  return new Set(picked);
}

/** Mark the plants in `set` as blooming. */
export const withBlooms = (plants: Plant[], set: Set<number>): Plant[] =>
  plants.map((p, i) => ({ ...p, blooms: set.has(i) }));
