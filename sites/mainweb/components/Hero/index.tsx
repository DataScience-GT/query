"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Mini from "../Text/Mini";
import LearnMore from "../LearnMore/LearnMore";

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
    <section
      id="hero"
      className="relative w-full h-screen flex items-center justify-center px-8 bg-gray-800 text-white overflow-hidden"
    >
      {/* Background Blob */}
      <div className="absolute inset-0 -z-10">
        <Image
          src={windowWidth >= WIDTH_THRESHOLD ? hero3 : hero2mobile}
          alt="blob"
          fill
          className="object-cover object-right"
          priority
        />
      </div>

      {/* Content Container */}
      <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
        {/* Left Content */}
        <div className="flex flex-col justify-center items-start w-full md:w-1/2">
          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-bold uppercase tracking-tight mb-4 text-transparent"
            style={{ WebkitTextStroke: "1.5px rgb(229,230,219)" }}
          >
            Data Science<br />@ Georgia Tech
          </h1>

          <div className="w-32 h-[2px] border-b-2 border-[#e5e6db] mb-8 relative">
            <span className="absolute -left-1 -top-1 w-3 h-3 border-2 rounded-full border-[#e5e6db]"></span>
            <span className="absolute -right-1 -top-1 w-3 h-3 border-2 rounded-full border-[#e5e6db]"></span>
          </div>

          <Mini>The largest student-run data science organization at Georgia Tech.</Mini>
        </div>

        {/* Right Logo */}
        <div className="hidden md:flex md:w-2/5 justify-center md:justify-end items-center">
          <Image
            src={herologo}
            alt="DSGT logo"
            width={240}
            height={240}
            className="w-40 h-40 md:w-60 md:h-60 object-contain"
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;