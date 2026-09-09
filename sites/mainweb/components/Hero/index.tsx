"use client";

import Image from "next/image";
import Link from "next/link";
import herologo from "@/assets/images/dsgt/square-logo.png";

interface HeroProps {
  screen_width: number;
}

const Hero = ({ screen_width: _screen_width }: HeroProps) => {
  return (
    <section
      id="hero"
      className="relative w-full min-h-screen flex items-center px-8 overflow-hidden bg-[var(--navy)]"
    >
      <div className="relative z-10 w-full max-w-7xl mx-auto pl-2 lg:pl-4 flex flex-col lg:flex-row items-end justify-between gap-16 py-32">
        <div className="flex flex-col justify-center items-start w-full lg:w-[62%] space-y-8">
          <p className="public-kicker text-[var(--buzz)]">
            Georgia Institute of Technology
          </p>
          <h1 className="public-display public-display-invert text-5xl md:text-7xl lg:text-[5.4rem]">
            We run the data science <span className="public-mark">bench</span>{" "}
            at Georgia Tech.
          </h1>
          <div className="max-w-xl">
            <p className="public-lede public-lede-invert text-lg">
              The largest student-run data science organization on campus.
              Projects, bootcamp, and Hacklytics — the work happens at the
              table, not on a slide.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/login"
              className="public-btn bg-[var(--buzz)] text-[var(--ink)] border-[var(--buzz)] hover:bg-[var(--paper)] hover:text-[var(--ink)] hover:border-[var(--paper)]"
            >
              Join the club
            </Link>
            <Link
              href="/projects"
              className="public-btn-ghost text-[var(--paper)] border-[color-mix(in_srgb,var(--paper)_45%,transparent)]"
            >
              See projects
            </Link>
          </div>
        </div>

        <div className="hidden md:flex lg:w-[32%] flex-col items-end gap-8">
          <Image
            src={herologo}
            alt="DSGT logo"
            width={220}
            height={220}
            className="w-40 h-40 lg:w-52 lg:h-52 object-contain"
            priority
          />
          <dl className="w-full space-y-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--paper)_70%,transparent)]">
            <div className="flex justify-between border-b border-[color-mix(in_srgb,var(--paper)_18%,transparent)] pb-2">
              <dt>Members</dt>
              <dd className="text-[var(--buzz)]">n = 550+</dd>
            </div>
            <div className="flex justify-between border-b border-[color-mix(in_srgb,var(--paper)_18%,transparent)] pb-2">
              <dt>Bootcamp</dt>
              <dd>Sep 22</dd>
            </div>
            <div className="flex justify-between pb-2">
              <dt>Campus</dt>
              <dd>Klaus / CULC</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
};

export default Hero;
