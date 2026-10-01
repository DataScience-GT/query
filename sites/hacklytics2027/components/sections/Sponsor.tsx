"use client";
import React from "react";
import PixelSprite from "../pixel/PixelSprite";
import { DAISY, MUSHROOM, TULIP } from "../pixel/sprites";
import Eyebrow from "./Eyebrow";

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="section-anchor relative text-white">
      <div className="section-wrap max-w-7xl mx-auto px-6 py-20 md:py-28">
        <Eyebrow index="05" tone="lime">Sponsors</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-12 md:mb-16">
          Grow <span className="neon-lime">with us.</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="pixel-frame pixel-cyan bg-white/[0.03] px-7 py-8 flex flex-col justify-between gap-6">
            <p className="font-pixel text-[11px] uppercase text-bloom-cyan">Hosted by</p>
            <p className="font-sans font-bold text-2xl tracking-tight text-white">Data Science @ GT</p>
          </div>
          <div className="pixel-frame pixel-pink bg-white/[0.03] px-7 py-8 flex flex-col justify-between gap-6">
            <p className="font-pixel text-[11px] uppercase text-bloom-pink">Member event</p>
            <p className="font-sans font-bold text-2xl tracking-tight text-white">Major League Hacking</p>
          </div>

          {/* An invitation, not an empty logo slot: 2027 partners are not
              announced yet. */}
          <div className="pixel-frame pixel-lime hud hud-lime relative overflow-hidden bg-white/[0.03] px-7 py-8 sm:col-span-2 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div className="relative">
              <p className="font-pixel text-[11px] uppercase text-bloom-lime">2027 partners</p>
              <p className="font-sans font-bold text-2xl md:text-3xl tracking-tight text-white mt-6">
                Sponsor Hacklytics 2027
              </p>
              <p className="font-sans text-base text-white/65 mt-2 max-w-sm">
                Put your problems in front of 1,000+ builders. Ask for the
                partner deck.
              </p>
            </div>
            <div className="relative flex flex-col items-start sm:items-end gap-5 shrink-0">
              <span className="hidden sm:flex items-end gap-2" aria-hidden>
                <PixelSprite map={TULIP} palette="cyan" scale={3} glow className="animate-bob" />
                <PixelSprite map={DAISY} palette="lime" scale={3} glow className="animate-bob" />
                <PixelSprite map={MUSHROOM} palette="pink" scale={3} glow className="animate-bob" />
              </span>
              <a
                href="mailto:hello@hacklytics.io"
                className="pixel-btn inline-flex items-center justify-center px-6 py-3.5 font-pixel text-xs w-full sm:w-auto"
              >
                Email us →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
