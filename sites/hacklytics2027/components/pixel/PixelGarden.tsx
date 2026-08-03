"use client";

import React, { useEffect, useMemo, useRef } from "react";
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
  VINE
  
  
} from "./sprites";
import type {PaletteName, SpriteMap} from "./sprites";

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
const TINTS: PaletteName[] = ["pink", "cyan", "lime", "purple"];

type Planted = {
  map: SpriteMap;
  palette: PaletteName;
  left: number;
  scale: number;
  delay: number;
  duration: number;
  flip: boolean;
};

function plant(seed: number, count: number, scaleRange: [number, number]): Planted[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const t = rnd();
    return {
      map: FLORA[Math.floor(rnd() * FLORA.length)],
      palette: TINTS[Math.floor(rnd() * TINTS.length)],
      left: rnd() * 100,
      scale: Math.round(scaleRange[0] + t * (scaleRange[1] - scaleRange[0])),
      delay: -rnd() * 6,
      duration: 4 + rnd() * 5,
      flip: rnd() > 0.5,
    };
  });
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
  const flora = useMemo(() => plant(seed, count, [3, 5]), [seed, count]);
  const ref = usePauseOffscreen<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-anim="running"
      className={`relative w-full select-none ${className}`}
      aria-hidden="true"
    >
      {/* flora stands on top of the soil line */}
      <div className="relative h-24 md:h-32">
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
            {/* flip lives on the sprite: the wrapper's transform is the sway animation */}
            <PixelImage
              map={f.map}
              palette={f.palette}
              scale={f.scale}
              glow
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

/* ─── Drifting spores ──────────────────────────────────────────────────── */

function Spores({ count = 10, seed = 3 }: { count?: number; seed?: number }) {
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
          <PixelImage map={SPORE} palette={s.palette} scale={s.scale} glow />
        </div>
      ))}
    </>
  );
}

/* ─── Fixed background garden with two parallax layers ──────────────────── */

export default function PixelGarden() {
  const backRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);

  const back = useMemo(() => plant(11, 6, [2, 3]), []);
  const mid = useMemo(() => plant(23, 5, [4, 6]), []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (backRef.current) backRef.current.style.transform = `translate3d(0, ${y * -0.04}px, 0)`;
        if (midRef.current) midRef.current.style.transform = `translate3d(0, ${y * -0.09}px, 0)`;
        frame = 0;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden" aria-hidden="true">
      {/* far layer — small, dim */}
      <div ref={backRef} className="absolute inset-0 opacity-25">
        {back.map((f, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${f.left}%`,
              top: `${(i * 97) % 90}%`,
            }}
          >
            <PixelImage map={f.map} palette={f.palette} scale={f.scale} />
          </div>
        ))}
      </div>

      {/* near layer — bigger, glowing */}
      <div ref={midRef} className="absolute inset-0 opacity-40">
        {mid.map((f, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${f.left}%`,
              top: `${(i * 61 + 14) % 88}%`,
            }}
          >
            <PixelImage
              map={f.map}
              palette={f.palette}
              scale={f.scale}
              glow
              style={f.flip ? { transform: "scaleX(-1)" } : undefined}
            />
          </div>
        ))}
      </div>

      <Spores />
    </div>
  );
}
