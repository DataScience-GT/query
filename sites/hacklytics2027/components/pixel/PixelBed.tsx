"use client";

import React, { useRef, useState, useSyncExternalStore } from "react";
import { BloomSprite } from "./PixelSprite";
import { useBloomInView } from "./useInView";
import { BUD, DAISY, MUSHROOM, TULIP } from "./sprites";
import type { SpriteMap } from "./sprites";

export type Plant = { map: SpriteMap; scale: number; blooms?: boolean; flip?: boolean };

/**
 * Beds run edge to edge and show more plants the wider the screen: every
 * fourth on phones, every other from md, all of them from xl. Spread with
 * justify-around, so each tier looks composed on its own. --step keeps the
 * visible neighbours 80ms apart in the bloom wave at every tier.
 */
const tierClass = (i: number) =>
  i % 4 === 0 ? "inline-block" : i % 2 === 0 ? "hidden md:inline-block" : "hidden xl:inline-block";
const BED_STEP = "[--step:20ms] md:[--step:40ms] xl:[--step:80ms]";

/* Planting: what can be planted, how big, and how many a bed keeps. */
const PLANTABLE = [DAISY, TULIP, BUD];
const PLANT_SCALE = 5;
const MAX_PLANTED = 12;
const WILT_MS = 320;

type Planted = { id: number; left: number; map: SpriteMap; flip: boolean; wilting: boolean };

const subscribeNoop = () => () => {};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A full-width row of plants standing on the soil. Mostly dormant; the ones
 * marked `blooms` grow and open pink in a left-to-right wave the first time
 * the bed is seen.
 *
 * With `plantable`, a click or tap on the bed plants a new flower at that x,
 * snapped to the sprite pixel grid. The bed itself stays aria-hidden; a
 * "Plant a flower" button, visible on focus, does the same for keyboards.
 */
export function PixelBed({
  plants,
  className = "",
  soil = false,
  plantable = false,
  hint = false,
  caption,
}: {
  plants: Plant[];
  /** Extra classes for the row of plants. */
  className?: string;
  /** Draw the soil line (a full-width hairline) under the row. */
  soil?: boolean;
  plantable?: boolean;
  /** Show the one-time "Click the soil" hint (hides after the first plant). */
  hint?: boolean;
  /** Small meta line under the bed, from xl up (where every plant shows). */
  caption?: string;
}) {
  const ref = useBloomInView<HTMLDivElement>();
  const [planted, setPlanted] = useState<Planted[]>([]);
  const [hasPlanted, setHasPlanted] = useState(false);
  const nextId = useRef(0);
  // Touch screens get "Tap", everything else "Click". "Click" in the static
  // HTML, settled after hydration.
  const touch = useSyncExternalStore(
    subscribeNoop,
    () => window.matchMedia("(hover: none)").matches,
    () => false,
  );

  const plantAt = (x: number) => {
    const bed = ref.current;
    if (!bed) return;
    bed.dataset.bloom = "on";

    const map = PLANTABLE[Math.floor(Math.random() * PLANTABLE.length)];
    const w = Math.max(...map.map((r) => r.length)) * PLANT_SCALE;
    const centred = Math.min(bed.clientWidth - w, Math.max(0, x - w / 2));
    const left = Math.round(centred / PLANT_SCALE) * PLANT_SCALE;
    const fresh = { id: nextId.current++, left, map, flip: Math.random() < 0.5, wilting: false };

    let next = [...planted, fresh];
    const alive = planted.filter((p) => !p.wilting);
    if (alive.length >= MAX_PLANTED) {
      // Over the cap: the oldest sinks back into the soil, then goes.
      const oldest = alive[0].id;
      next = next.map((p) => (p.id === oldest ? { ...p, wilting: true } : p));
      setTimeout(
        () => setPlanted((cur) => cur.filter((p) => p.id !== oldest)),
        reducedMotion() ? 0 : WILT_MS,
      );
    }
    setPlanted(next);
    setHasPlanted(true);
  };

  const onBedClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    plantAt(e.clientX - rect.left);
  };

  const row = (
    <div
      ref={ref}
      data-bloom="off"
      data-anim="running"
      aria-hidden="true"
      onClick={plantable ? onBedClick : undefined}
      className={`relative w-full flex items-end justify-around overflow-x-clip overflow-y-visible select-none ${BED_STEP} ${
        plantable ? "cursor-pointer" : "pointer-events-none"
      } ${className}`}
    >
      {plants.map((p, i) => (
        <BloomSprite
          key={i}
          map={p.map}
          scale={p.scale}
          blooms={p.blooms}
          flip={p.flip}
          index={i}
          className={tierClass(i)}
        />
      ))}
      {planted.map((p) => (
        <span
          key={p.id}
          className={`absolute bottom-0 ${p.wilting ? "flower-wilt" : ""}`}
          style={{ left: p.left }}
        >
          <BloomSprite map={p.map} scale={PLANT_SCALE} blooms flip={p.flip} phase={p.id * 1373} />
        </span>
      ))}
    </div>
  );

  const button = plantable && (
    <button
      type="button"
      onClick={() => plantAt(Math.random() * (ref.current?.clientWidth ?? 0))}
      className="sr-only focus:not-sr-only focus:font-sans focus:text-[13px] focus:text-ink focus:underline focus:underline-offset-4"
    >
      Plant a flower
    </button>
  );

  return (
    <>
      {soil ? <div className="border-b border-rule">{row}</div> : row}
      {hint || caption ? (
        <div className="wrap flex items-baseline justify-between gap-6 pt-3 font-sans text-[13px] text-ink-3">
          {hint && (
            <span
              aria-hidden="true"
              className={`transition-opacity duration-700 motion-reduce:transition-none ${
                hasPlanted ? "opacity-0" : ""
              }`}
            >
              {touch ? "Tap" : "Click"} the soil to plant one.
            </span>
          )}
          {button}
          {caption && <span className="hidden xl:inline ml-auto text-right">{caption}</span>}
        </div>
      ) : (
        <div className="wrap">{button}</div>
      )}
    </>
  );
}

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
 * Which `n` plants of a bed bloom: evenly spaced, and filled tier by tier
 * (phone tier first), so a bed with only a few in bloom still shows them on
 * a phone, and every tier looks composed rather than random.
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
  for (const tier of tiers) {
    const take = Math.min(left, tier.length);
    picked.push(...spread(tier, take));
    left -= take;
  }
  return new Set(picked);
}

/** Mark the plants in `set` as blooming. */
export const withBlooms = (plants: Plant[], set: Set<number>): Plant[] =>
  plants.map((p, i) => ({ ...p, blooms: set.has(i) }));
