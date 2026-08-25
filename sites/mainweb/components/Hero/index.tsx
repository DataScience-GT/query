// src/components/Hero.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import Mini from "../Text/Mini";

import herologo from "@/assets/images/dsgt/square-logo.png";

interface HeroProps {
  screen_width: number;
}

const Hero = ({ screen_width: _screen_width }: HeroProps) => {
  return (
    <section
      id="hero"
      className="relative w-full min-h-[92vh] flex items-center px-8 pt-24 pb-16 overflow-hidden bg-[#050505]"
    >
      <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
        <div className="flex flex-col justify-center items-start w-full md:w-3/5 space-y-7">
          <p className="page-kicker">Georgia Institute of Technology</p>
          <h1 className="page-title text-5xl md:text-7xl lg:text-[5.5rem]">
            Data Science
            <br />
            <span className="text-[#00A8A8]">@ GT</span>
          </h1>

          <div className="max-w-md border-l-2 border-[#00A8A8]/40 pl-5">
            <Mini className="text-gray-400 text-lg leading-relaxed">
              The largest student-run data science organization at Georgia Tech.
              Workshops, projects, and Hacklytics — built by students, for
              students.
            </Mini>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/login" className="btn-solid">
              Join the portal
            </Link>
            <Link href="/bootcamp" className="btn-line">
              This year&apos;s bootcamp
            </Link>
          </div>
        </div>

        <div className="hidden md:flex md:w-1/3 justify-center md:justify-end">
          <Image
            src={herologo}
            alt="DSGT logo"
            width={300}
            height={300}
            className="relative w-48 h-48 md:w-64 md:h-64 object-contain"
            priority
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;
