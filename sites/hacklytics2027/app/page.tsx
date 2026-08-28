"use client";
import React, { useEffect, useState } from "react";
import HomeSections from "@/components/HomeSections";
import PixelGarden from "@/components/pixel/PixelGarden";
import PixelSprite from "@/components/pixel/PixelSprite";
import { GLOBE } from "@/components/pixel/sprites";
import { INTEREST_URL } from "@/lib/links";

/** Hacklytics 2027 opens Feb 26, 00:00 America/New_York. */
const EVENT_TZ = "America/New_York";
const EVENT_LOCAL = "2027-02-26T00:00:00";

function zonedLocalToUtcMs(localIso: string, timeZone: string): number {
  const [datePart, timePart = "00:00:00"] = localIso.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const readAsUtc = (ms: number) => {
    const bag: Record<string, number> = {};
    for (const { type, value } of dtf.formatToParts(new Date(ms))) {
      if (type !== "literal") bag[type] = Number(value);
    }
    return Date.UTC(bag.year, bag.month - 1, bag.day, bag.hour, bag.minute, bag.second);
  };

  // Two refinements land on the correct offset around DST.
  let utc = utcGuess + (utcGuess - readAsUtc(utcGuess));
  utc = utc + (utcGuess - readAsUtc(utc));
  return utc;
}

const TARGET_MS = zonedLocalToUtcMs(EVENT_LOCAL, EVENT_TZ);

function splitRemaining(now: number) {
  const distance = Math.max(0, TARGET_MS - now);
  return {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((distance / (1000 * 60)) % 60),
    seconds: Math.floor((distance / 1000) % 60),
  };
}

const Countdown: React.FC = () => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);

  const time = splitRemaining(now);
  const pad = (n: number) => String(n).padStart(2, "0");

  const units = [
    { label: "DAYS", value: String(time.days), accent: true },
    { label: "HRS", value: pad(time.hours), accent: false },
    { label: "MIN", value: pad(time.minutes), accent: false },
    { label: "SEC", value: pad(time.seconds), accent: false },
  ];

  return (
    <div
      className="mt-10 w-full max-w-lg"
      role="timer"
      aria-live="off"
      aria-label={`Countdown to Hacklytics: ${time.days} days ${time.hours} hours ${time.minutes} minutes ${time.seconds} seconds`}
    >
      <div className="flex items-end justify-between gap-4 sm:gap-8">
        {units.map(({ label, value, accent }) => (
          <div key={label} className="flex min-w-0 flex-1 flex-col items-start">
            <span
              suppressHydrationWarning
              className={`font-sans text-4xl font-medium tabular-nums tracking-tight sm:text-5xl md:text-6xl ${
                accent ? "text-bloom-cyan" : "text-white"
              }`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 h-px w-full bg-white/20" />
      <div className="mt-2 flex justify-between gap-4 sm:gap-8">
        {units.map(({ label }) => (
          <span
            key={label}
            className="min-w-0 flex-1 font-sans text-[10px] font-medium uppercase tracking-[0.18em] text-white/40"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default function HomePage() {
  return (
    <main className="scanlines neo-vignette relative min-h-screen w-full overflow-x-hidden bg-[#020204] text-white selection:bg-bloom-cyan/40 selection:text-white">
      {/* ── HERO ── */}
      <section className="relative flex min-h-screen w-full flex-col justify-start overflow-hidden">
        <PixelGarden />

        {/* Keep type readable over the bloom without a centered orb/scrim. */}
        <div
          className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgba(2,2,4,0.78)_0%,rgba(2,2,4,0.42)_36%,rgba(2,2,4,0.1)_58%,transparent_74%)]"
          aria-hidden="true"
        />

        <a
          href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2027-season&utm_content=white"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-0 right-5 z-50 w-[9%] min-w-[56px] max-w-[90px] transition-all duration-300 hover:scale-105 hover:brightness-110 md:right-12"
        >
          <img src="/mlh-trust-badge.svg" alt="Major League Hacking 2027" className="w-full" />
        </a>

        <div className="relative z-10 flex w-full flex-col items-start px-6 pt-28 pb-44 text-left md:px-16 md:pt-32 md:pb-48 lg:px-24 xl:px-28">
          <div className="max-w-xl lg:max-w-2xl">
            <div className="mb-8 flex items-center gap-2.5">
              <PixelSprite map={GLOBE} palette="cyan" scale={3} />
              <span className="font-sans text-sm font-medium tracking-wide text-white">
                DS @ GT
              </span>
            </div>

            <p className="mb-4 font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-bloom-cyan">
              Digital Bloom · 2027
            </p>

            <h1
              data-text="Hacklytics"
              className="neo-split font-sans text-6xl font-bold leading-[0.86] tracking-[-0.04em] text-white sm:text-7xl md:text-8xl lg:text-9xl"
            >
              Hacklytics
            </h1>

            <p className="mt-6 max-w-lg font-sans text-base font-normal leading-relaxed text-white md:text-lg">
              36 hours of intelligence, innovation, and digital bloom. 1,000+ hackers.
            </p>
            <p className="mt-2 max-w-lg font-sans text-sm leading-relaxed text-white/55 md:text-base">
              Feb 26–28, 2027 · Klaus Advanced Computing Building · Georgia Tech · Atlanta
            </p>

            <a
              href={INTEREST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="pixel-btn mt-8 inline-flex w-full max-w-xs items-center justify-center gap-2 px-8 py-3.5 font-sans text-sm font-bold uppercase tracking-[0.08em] sm:w-auto"
            >
              Notify me
              <span aria-hidden="true">→</span>
            </a>

            <Countdown />
          </div>
        </div>
      </section>

      <div className="relative z-10 border-t border-white/5 bg-[#020204]/70">
        <HomeSections />
      </div>
    </main>
  );
}
