"use client";

import React, { useMemo } from "react";
import { PixelImage } from "./PixelSprite";
import { spriteToDataUri } from "./spriteUri";
import { usePauseOffscreen } from "./useInView";
import {
  BLOOM,
  DAISY,
  GROUND,
  MUSHROOM,
  SPORE,
  SPROUT,
  TULIP,
  VINE,
} from "./sprites";
import type { PaletteName, SpriteMap } from "./sprites";

/* Deterministic PRNG — same layout on server and client, no hydration mismatch. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLORA: SpriteMap[] = [DAISY, TULIP, BLOOM, SPROUT, MUSHROOM];
/* Magenta + lime live in the sprites. Cyan shows up as water/petal tints, not UI chrome. */
const TINTS: PaletteName[] = ["pink", "lime", "pink", "cyan", "lime", "pink"];

type Planted = {
  map: SpriteMap;
  palette: PaletteName;
  left: number;
  top?: number;
  scale: number;
  delay: number;
  duration: number;
  flip: boolean;
  hideOnMobile?: boolean;
};

function plantBed(seed: number, count: number, scaleRange: [number, number]): Planted[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const t = rnd();
    return {
      map: FLORA[Math.floor(rnd() * FLORA.length)],
      palette: TINTS[Math.floor(rnd() * TINTS.length)],
      left: rnd() * 96,
      scale: Math.round(scaleRange[0] + t * (scaleRange[1] - scaleRange[0])),
      delay: -rnd() * 6,
      duration: 4 + rnd() * 5,
      flip: rnd() > 0.5,
    };
  });
}

function plantField(
  seed: number,
  count: number,
  leftRange: [number, number],
  topRange: [number, number],
  scaleRange: [number, number],
): Planted[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const t = rnd();
    const scale = Math.round(scaleRange[0] + t * (scaleRange[1] - scaleRange[0]));
    return {
      map: FLORA[Math.floor(rnd() * FLORA.length)],
      palette: TINTS[Math.floor(rnd() * TINTS.length)],
      left: leftRange[0] + rnd() * (leftRange[1] - leftRange[0]),
      top: topRange[0] + rnd() * (topRange[1] - topRange[0]),
      scale,
      delay: -rnd() * 8,
      duration: 4 + rnd() * 6,
      flip: rnd() > 0.5,
      hideOnMobile: scale >= 8,
    };
  });
}

/** Tileable sine-wave vine, painted with petal + leaf pixels so pink palette reads magenta. */
function sineVineMap(
  period: number,
  amplitude: number,
  thickness: number,
  leafEvery = 8,
): SpriteMap {
  const h = amplitude * 2 + thickness + 5;
  const rows: string[][] = Array.from({ length: h }, () =>
    Array.from({ length: period }, () => "."),
  );
  const mid = amplitude + 2;
  for (let x = 0; x < period; x++) {
    const y = Math.round(mid + Math.sin((x / period) * Math.PI * 2) * amplitude);
    for (let t = 0; t < thickness; t++) {
      const yy = y + t;
      if (yy >= 0 && yy < h) rows[yy][x] = t === 0 ? "P" : "p";
    }
    if (leafEvery && x % leafEvery === 3) {
      const dir = x % (leafEvery * 2) === 3 ? -1 : 1;
      const ly = y + (dir === -1 ? -1 : thickness);
      if (ly >= 0 && ly < h) rows[ly][x] = "G";
    }
  }
  return rows.map((r) => r.join(""));
}

function sineVineMapVertical(period: number, amplitude: number, thickness: number): SpriteMap {
  const w = amplitude * 2 + thickness + 5;
  const rows: string[][] = Array.from({ length: period }, () =>
    Array.from({ length: w }, () => "."),
  );
  const mid = amplitude + 2;
  for (let y = 0; y < period; y++) {
    const x = Math.round(mid + Math.sin((y / period) * Math.PI * 2) * amplitude);
    for (let t = 0; t < thickness; t++) {
      const xx = x + t;
      if (xx >= 0 && xx < w) rows[y][xx] = t === 0 ? "P" : "p";
    }
  }
  return rows.map((r) => r.join(""));
}

function PixelSineVine({
  top,
  palette = "pink",
  period = 56,
  amplitude = 5,
  thickness = 2,
  scale = 4,
  opacity = 0.92,
}: {
  top: string;
  palette?: PaletteName;
  period?: number;
  amplitude?: number;
  thickness?: number;
  scale?: number;
  opacity?: number;
}) {
  const sprite = useMemo(
    () => spriteToDataUri(sineVineMap(period, amplitude, thickness), palette),
    [period, amplitude, thickness, palette],
  );

  return (
    <div
      className="absolute left-0 right-0"
      style={{
        top,
        height: sprite.h * scale,
        backgroundImage: sprite.uri,
        backgroundRepeat: "repeat-x",
        backgroundSize: `${sprite.w * scale}px ${sprite.h * scale}px`,
        imageRendering: "pixelated",
        opacity,
      }}
    />
  );
}

function PixelSineVineVertical({
  side = "right",
  palette = "pink",
  period = 40,
  amplitude = 4,
  thickness = 2,
  scale = 4,
  opacity = 0.85,
}: {
  side?: "left" | "right";
  palette?: PaletteName;
  period?: number;
  amplitude?: number;
  thickness?: number;
  scale?: number;
  opacity?: number;
}) {
  const sprite = useMemo(
    () => spriteToDataUri(sineVineMapVertical(period, amplitude, thickness), palette),
    [period, amplitude, thickness, palette],
  );

  return (
    <div
      className={`absolute top-0 bottom-0 ${side === "left" ? "left-0" : "right-0"}`}
      style={{
        width: sprite.w * scale,
        backgroundImage: sprite.uri,
        backgroundRepeat: "repeat-y",
        backgroundSize: `${sprite.w * scale}px ${sprite.h * scale}px`,
        imageRendering: "pixelated",
        opacity,
        transform: side === "right" ? "scaleX(-1)" : undefined,
      }}
    />
  );
}

function FloraLayer({ plants, className = "" }: { plants: Planted[]; className?: string }) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      {plants.map((f, i) => (
        <div
          key={i}
          className={`absolute animate-sway origin-bottom ${f.hideOnMobile ? "hidden sm:block" : ""}`}
          style={{
            left: `${f.left}%`,
            top: f.top !== undefined ? `${f.top}%` : undefined,
            bottom: f.top === undefined ? 0 : undefined,
            animationDelay: `${f.delay}s`,
            animationDuration: `${f.duration}s`,
          }}
        >
          <PixelImage
            map={f.map}
            palette={f.palette}
            scale={f.scale}
            style={f.flip ? { transform: "scaleX(-1)" } : undefined}
          />
        </div>
      ))}
    </div>
  );
}

/* ─── Ground: tiled grass + soil, with flora growing out of it ──────────── */

export function PixelGround({
  scale = 4,
  count = 14,
  seed = 7,
  className = "",
}: {
  scale?: number;
  count?: number;
  seed?: number;
  className?: string;
}) {
  const ground = useMemo(() => spriteToDataUri(GROUND, "lime"), []);
  const flora = useMemo(() => plantBed(seed, count, [3, 6]), [seed, count]);
  const ref = usePauseOffscreen<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-anim="running"
      className={`relative w-full select-none ${className}`}
      aria-hidden="true"
    >
      <div className="relative h-28 md:h-40">
        {flora.map((f, i) => (
          <div
            key={i}
            className="absolute bottom-0 animate-sway origin-bottom"
            style={{
              left: `${f.left}%`,
              animationDelay: `${f.delay}s`,
              animationDuration: `${f.duration}s`,
            }}
          >
            <PixelImage
              map={f.map}
              palette={f.palette}
              scale={f.scale}
              style={f.flip ? { transform: "scaleX(-1)" } : undefined}
            />
          </div>
        ))}
      </div>

      <div
        className="w-full"
        style={{
          backgroundImage: ground.uri,
          backgroundRepeat: "repeat-x",
          backgroundSize: `${ground.w * scale}px ${ground.h * scale}px`,
          height: ground.h * scale,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}

/* ─── Vine rail: a tiled vine that hangs down a section edge ────────────── */

export function PixelVine({
  scale = 3,
  height = 160,
  side = "left",
}: {
  scale?: number;
  height?: number;
  side?: "left" | "right";
}) {
  const vine = useMemo(() => spriteToDataUri(VINE, "lime"), []);
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute top-0 hidden md:block ${side === "left" ? "left-6" : "right-6"}`}
      style={{
        width: vine.w * scale,
        height,
        backgroundImage: vine.uri,
        backgroundRepeat: "repeat-y",
        backgroundSize: `${vine.w * scale}px ${vine.h * scale}px`,
        imageRendering: "pixelated",
        opacity: 0.7,
        transform: side === "right" ? "scaleX(-1)" : undefined,
        maskImage: "linear-gradient(to bottom, black 60%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent)",
      }}
    />
  );
}

/* ─── Drifting spores / yellow embers ──────────────────────────────────── */

function Spores({ count = 18, seed = 3 }: { count?: number; seed?: number }) {
  const spores = useMemo(() => {
    const rnd = mulberry32(seed);
    return Array.from({ length: count }, () => ({
      left: rnd() * 100,
      top: rnd() * 100,
      scale: 1 + Math.floor(rnd() * 3),
      delay: -rnd() * 12,
      duration: 9 + rnd() * 12,
      palette: TINTS[Math.floor(rnd() * TINTS.length)],
    }));
  }, [count, seed]);

  return (
    <>
      {spores.map((s, i) => (
        <div
          key={i}
          className="absolute animate-drift"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        >
          <PixelImage map={SPORE} palette={s.palette} scale={s.scale} />
        </div>
      ))}
    </>
  );
}

/* ─── Full-fold Digital Bloom: vines + dense flora, scoped to the hero ─── */

export default function PixelGarden() {
  const far = useMemo(() => plantField(11, 32, [1, 97], [2, 80], [2, 3]), []);
  const midLeft = useMemo(() => plantField(89, 14, [2, 44], [18, 68], [3, 5]), []);
  const mid = useMemo(() => plantField(23, 26, [36, 96], [6, 74], [3, 5]), []);
  const near = useMemo(() => plantField(47, 16, [48, 94], [16, 70], [5, 8]), []);
  const vineBloom = useMemo(() => plantField(71, 16, [4, 96], [12, 64], [3, 5]), []);
  const ref = usePauseOffscreen<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-anim="running"
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
      aria-hidden="true"
    >
      <PixelSineVine top="16%" period={64} amplitude={6} thickness={2} scale={4} opacity={0.95} />
      <PixelSineVine
        top="38%"
        period={48}
        amplitude={5}
        thickness={3}
        scale={4}
        opacity={0.88}
      />
      <PixelSineVine
        top="58%"
        period={72}
        amplitude={4}
        thickness={2}
        scale={3}
        opacity={0.8}
      />
      <PixelSineVineVertical side="right" period={36} amplitude={4} thickness={2} scale={4} />

      <FloraLayer plants={far} className="opacity-70" />
      <FloraLayer plants={midLeft} className="opacity-80" />
      <FloraLayer plants={mid} className="opacity-90" />
      <FloraLayer plants={vineBloom} className="opacity-85" />
      <FloraLayer plants={near} />

      <Spores />

      <div className="absolute bottom-0 left-0 right-0">
        <PixelGround seed={5} count={28} />
      </div>
    </div>
  );
}
