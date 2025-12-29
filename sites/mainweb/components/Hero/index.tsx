// src/components/Hero.tsx
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Mini from "../Text/Mini";

import hero3 from "@/assets/images/blobs/hero3--export.svg";
import hero2mobile from "@/assets/images/blobs/hero2-mobile--export.svg";
import herologo from "@/assets/images/dsgt/square-logo.png";

interface HeroProps {
  screen_width: number;
}

const Hero = ({ screen_width }: HeroProps) => {
  const [windowWidth, setWindowWidth] = useState(screen_width);
  const WIDTH_THRESHOLD = 1000;

  useEffect(() => {
    setWindowWidth(screen_width);
  }, [screen_width]);

  return (
    <section id="hero" className="relative w-full h-screen flex items-center justify-center px-8 overflow-hidden bg-[#050505]">
      {/* Background Blob - Kept your logic */}
      <div className="absolute inset-0 z-0">
        <Image
          src={windowWidth >= WIDTH_THRESHOLD ? hero3 : hero2mobile}
          alt="background"
          fill
          className="object-cover object-right opacity-40"
          priority
        />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
        {/* Left Content */}
        <div className="flex flex-col justify-center items-start w-full md:w-3/5 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[#00A8A8] text-[10px] font-mono uppercase tracking-[0.2em]">
            Georgia Institute of Technology
          </div>
          <h1
            className="text-5xl md:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.85] text-transparent"
            style={{ WebkitTextStroke: "1.5px rgba(255,255,255,0.8)" }}
          >
            Data Science<br />
            <span className="text-white" style={{ WebkitTextStroke: "0" }}>@ GT</span>
          </h1>

          <div className="max-w-md">
            <Mini className="text-gray-400 text-lg leading-relaxed">
              The largest student-run data science organization at Georgia Tech. We bridge the gap between classroom theory and production engineering.
            </Mini>
          </div>
        </div>

        {/* Right Logo */}
        <div className="hidden md:flex md:w-1/3 justify-center md:justify-end">
          <div className="relative group">
            <div className="absolute -inset-4 bg-indigo-500/20 rounded-full blur-3xl group-hover:bg-indigo-500/30 transition-all duration-700"></div>
            <Image
              src={herologo}
              alt="DSGT logo"
              width={300}
              height={300}
              className="relative w-48 h-48 md:w-72 md:h-72 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;