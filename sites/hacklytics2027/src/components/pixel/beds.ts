import { BLOOM, BUD, DAISY, TULIP } from "./sprites";
import type { SpriteMap } from "./sprites";
import { TINTS } from "./tints";
import type { Tint } from "./tints";

export type Plant = {
  map: SpriteMap;
  scale: number;
  /** The colour it opens in. */
  tint: Tint;
  flip?: boolean;
};

/* Deterministic: the same bed on the server and the client. */
const MAPS = [TULIP, DAISY, BUD, DAISY, TULIP, BLOOM, DAISY, TULIP];

/** Plants in a full bed (the xl tier); phones show a quarter of them. */
export const BED_SIZE = 20;

/**
 * The tint plant `i` opens in. Three tints on per plant, so neighbours are
 * different at every tier a visitor sees (the phone's every fourth plant, the
 * md tier's every other, the full bed) and the phone's five and the md tier's
 * ten between them show all seven. `seed` starts a bed on a different colour
 * from the next bed's.
 */
export const tintAt = (i: number, seed = 0): Tint => TINTS[(3 * (i + seed)) % TINTS.length];

/** A bed of BED_SIZE plants, every one a flower that opens in a tint of its own. */
export function plantBed(seed = 0): Plant[] {
  return Array.from({ length: BED_SIZE }, (_, i) => {
    const n = (seed * 7 + i * 5) % 13;
    return {
      map: MAPS[(i + seed) % MAPS.length],
      scale: 4 + (n % 3),
      tint: tintAt(i, seed),
      flip: n % 2 === 1,
    };
  });
}
