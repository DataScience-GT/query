"use client";
import React from "react";
import PixelSprite from "../pixel/PixelSprite";
import { BLOOM, DAISY, SPROUT, TULIP } from "../pixel/sprites";
import type { PaletteName, SpriteMap } from "../pixel/sprites";
import Eyebrow from "./Eyebrow";

const otherPrizes: {
  label: string;
  detail: string;
  sprite: SpriteMap;
  palette: PaletteName;
}[] = [
  { label: "Track", detail: "First and second in each track.", sprite: DAISY, palette: "lime" },
  { label: "MLH", detail: "Sponsor challenges stack on top.", sprite: TULIP, palette: "cyan" },
  { label: "Beginner", detail: "Beginner-friendly award.", sprite: SPROUT, palette: "purple" },
];

const FRAME: Record<PaletteName, string> = {
  pink: "pixel-pink",
  cyan: "pixel-cyan",
  lime: "pixel-lime",
  purple: "pixel-purple",
};

export default function PrizeAndSpeakerSection() {
  return (
    <section id="prizes" className="section-anchor text-white relative">
      <div className="section-wrap max-w-7xl mx-auto py-20 md:py-28 px-6">
        <Eyebrow index="03" tone="pink">Prizes</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-12 md:mb-16">
          Bloom, then <span className="neon-pink">win.</span>
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="pixel-frame pixel-pink hud hud-pink relative overflow-hidden bg-white/[0.03] p-8 md:p-12 lg:col-span-3 flex flex-col justify-between min-h-[20rem]">
            {/* The event's top prize gets the only oversized sprite on the page.
                Hidden on phones, where it would sit under the text. */}
            <div aria-hidden className="pointer-events-none hidden sm:block absolute right-6 bottom-6 md:right-10 md:bottom-10 opacity-70">
              <PixelSprite map={BLOOM} palette="pink" scale={14} glow />
            </div>
            <p className="relative font-pixel text-xs uppercase text-bloom-pink">Best overall</p>
            <div className="relative">
              <p className="font-sans font-bold text-5xl md:text-7xl tracking-[-0.04em] text-white">
                Purse <span className="neon-pink">TBA</span>
              </p>
              <p className="font-sans text-base md:text-lg text-white/65 mt-4 max-w-sm leading-relaxed">
                Top projects across all tracks. Prize details land closer to the
                event.
              </p>
            </div>
          </div>

          <ul className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-5">
            {otherPrizes.map((p) => (
              <li
                key={p.label}
                className={`pixel-frame ${FRAME[p.palette]} bg-white/[0.03] px-6 py-5 flex items-center gap-5 transition-colors duration-300 hover:bg-white/[0.06]`}
              >
                <span className="flex w-10 shrink-0 justify-center">
                  <PixelSprite map={p.sprite} palette={p.palette} scale={3} glow />
                </span>
                <div>
                  <p className="font-pixel text-[11px] uppercase text-white/85">{p.label}</p>
                  <p className="font-sans text-sm md:text-base text-white/65 mt-1">{p.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
