"use client";
import React from "react";
import { PixelBullet, PixelLabel } from "../pixel/PixelBits";
import { PixelVine } from "../pixel/PixelGarden";
import PixelSprite from "../pixel/PixelSprite";
import { MUSHROOM, TULIP } from "../pixel/sprites";

const AboutSection: React.FC = () => {
  return (
    <section id="about" className="section-anchor text-white relative">
      <PixelVine side="left" height={220} />
      <PixelVine side="right" height={180} />

      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">

        <PixelLabel text="About" tint="cyan" />

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">

          {/* Left: headline + copy */}
          <div className="lg:col-span-3 flex flex-col justify-center">
            <h2 className="font-sans font-medium text-5xl sm:text-6xl md:text-7xl lg:text-[6rem] text-white mb-10 leading-[0.9] tracking-[-0.03em]">
              A Hub of<br />
              <span className="neon-cyan">Innovation</span>
            </h2>

            <div className="space-y-8 font-sans text-lg md:text-xl lg:text-2xl text-white/50 leading-[1.6] max-w-xl font-light">
              <p>
                <strong className="text-white font-normal">Hacklytics</strong> is a 36-hour data science hackathon hosted by Data Science @ GT — the premier event of its kind in the Southeast.
              </p>
              <p>
                We invite hackers from across the globe to dive into the <em className="text-white/80 not-italic font-normal">digital bloom</em> — the bleeding edge of AI, machine learning, and data analytics in a high-octane environment.
              </p>
            </div>
          </div>

          {/* Right: pixel slot cards */}
          <div className="lg:col-span-2 flex flex-col gap-8">

            {/* When & Where */}
            <div className="pixel-frame pixel-lime hud hud-lime p-8 md:p-10 bg-white/[0.03]">
              <div className="flex items-center justify-between mb-6">
                <span className="font-pixel text-[10px] neon-lime">When &amp; Where</span>
                <PixelSprite map={TULIP} palette="lime" scale={2} glow className="animate-bob" />
              </div>
              <div className="space-y-2">
                <span className="block font-sans text-2xl md:text-3xl font-medium text-white tracking-tight">Feb. 26 – 28, 2027</span>
                <span className="block font-sans text-base text-white/60 pt-2">Klaus Advanced Computing Building</span>
                <span className="block font-pixel text-[9px] text-white/35 pt-2">Georgia Tech Campus · Atlanta</span>
              </div>
            </div>

            {/* Why Join */}
            <div className="pixel-frame pixel-pink hud hud-pink p-8 md:p-10 bg-white/[0.03]">
              <div className="flex items-center justify-between mb-6">
                <span className="font-pixel text-[10px] neon-pink">Why Join?</span>
                <PixelSprite map={MUSHROOM} palette="pink" scale={2} glow className="animate-bob" />
              </div>
              <ul className="space-y-5">
                {[
                  "Build projects that matter",
                  "Connect with 1,000+ hackers",
                  "Free food, swag & networking",
                ].map((text, i) => (
                  <li key={i} className="flex items-center gap-4 group cursor-default">
                    <PixelBullet n={i + 1} tint="pink" />
                    <span className="font-sans text-base text-white/60 group-hover:text-white transition-colors duration-300">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
