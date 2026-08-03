"use client";

import React from "react";
import PixelSprite, { PixelImage } from "./PixelSprite";
import { usePauseOffscreen } from "./useInView";
import { BLOOM, DAISY, MUSHROOM, SPROUT, TULIP   } from "./sprites";
import type {PaletteName, SpriteMap} from "./sprites";

const NEON: Record<PaletteName, string> = {
  pink: "neon-pink",
  cyan: "neon-cyan",
  lime: "neon-lime",
  purple: "neon-purple",
};

const FRAME: Record<PaletteName, string> = {
  pink: "pixel-pink",
  cyan: "pixel-cyan",
  lime: "pixel-lime",
  purple: "pixel-purple",
};

export const tintFrame = (t: PaletteName) => `pixel-frame ${FRAME[t]}`;
export const tintText = (t: PaletteName) => NEON[t];

const SPRITE_BY_TINT: Record<PaletteName, SpriteMap> = {
  pink: DAISY,
  cyan: BLOOM,
  lime: SPROUT,
  purple: TULIP,
};

/** Section eyebrow: sprite + glowing pixel label, replaces the old rule + mono text. */
export function PixelLabel({
  text,
  tint = "cyan",
  sprite,
}: {
  text: string;
  tint?: PaletteName;
  sprite?: SpriteMap;
}) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <PixelSprite
        map={sprite ?? SPRITE_BY_TINT[tint]}
        palette={tint}
        scale={3}
        glow
        className="animate-sway origin-bottom"
        style={{ animationDuration: "6s" }}
      />
      <span className={`font-pixel text-[10px] md:text-xs ${NEON[tint]}`}>{text}</span>
      <span className="neo-rule w-16 md:w-32" aria-hidden />
    </div>
  );
}

/** Numbered list marker drawn as a tiny sprite in a notched slot. */
export function PixelBullet({ n, tint = "pink" }: { n: number; tint?: PaletteName }) {
  return (
    <span
      className={`pixel-frame ${FRAME[tint]} shrink-0 flex h-8 w-8 items-center justify-center bg-white/[0.03]`}
    >
      <span className={`font-pixel text-[10px] ${NEON[tint]}`}>{String(n).padStart(2, "0")}</span>
    </span>
  );
}

/** A row of pixel flora, used to cap a section or fill a gap. */
export function PixelFloraRow({
  seed = 1,
  count = 7,
  className = "",
}: {
  seed?: number;
  count?: number;
  className?: string;
}) {
  const maps = [DAISY, TULIP, BLOOM, SPROUT, MUSHROOM];
  const tints: PaletteName[] = ["pink", "cyan", "lime", "purple"];

  // even spread with deterministic jitter — no clumping, no hydration mismatch
  const items = Array.from({ length: count }, (_, i) => {
    const n = (seed * 37 + i * 53) % 101;
    const slot = ((i + 0.5) / count) * 100;
    return {
      map: maps[n % maps.length],
      palette: tints[(n >> 3) % tints.length],
      left: Math.min(96, Math.max(2, slot + ((n % 11) - 5) * 0.6)),
      scale: 3 + (n % 3),
      duration: 5 + (n % 5),
      delay: -(n % 7),
    };
  });

  const ref = usePauseOffscreen<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-anim="running"
      className={`relative h-16 md:h-20 select-none ${className}`}
      aria-hidden="true"
    >
      {items.map((f, i) => (
        <div
          key={i}
          className="absolute bottom-0 animate-sway origin-bottom"
          style={{
            left: `${f.left}%`,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
          }}
        >
          <PixelImage map={f.map} palette={f.palette} scale={f.scale} glow />
        </div>
      ))}
    </div>
  );
}
