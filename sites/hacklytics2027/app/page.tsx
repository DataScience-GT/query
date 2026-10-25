"use client";
import React, { useState, useEffect, useSyncExternalStore } from "react";
import HomeSections from "@/components/HomeSections";
import { PixelBed, bloomSet, plantBed, withBlooms } from "@/components/pixel/PixelBed";
import { INTEREST_URL } from "@/lib/links";

// ─── Dates ────────────────────────────────────────────────────────────────
// Check-in opens 5pm ET (the JSON-LD startDate). Without an offset the string
// meant midnight in each visitor's own timezone.
const EVENT_START = new Date("2027-02-26T17:00:00-05:00");
// When the 2027 season opened. The hero bed fills in from here to
// EVENT_START: a tenth of it in bloom at the start, all of it on the day.
const SEASON_START = new Date("2026-09-01T00:00:00-04:00");

const HERO_BED = plantBed(0);

/** How many hero flowers are in bloom at `now`: at least one, all from the event on. */
function bloomCount(now: number) {
  const span = EVENT_START.getTime() - SEASON_START.getTime();
  const progress = Math.min(1, Math.max(0.1, (now - SEASON_START.getTime()) / span));
  return Math.max(1, Math.round(progress * HERO_BED.length));
}

// ─── Countdown ────────────────────────────────────────────────────────────
const subscribeNoop = () => () => {};

const Countdown: React.FC<{ targetDate: Date }> = ({ targetDate }) => {
  const getTimeLeft = React.useCallback(() => {
    const distance = targetDate.getTime() - Date.now();
    if (distance <= 0) return null;
    return {
      days:    Math.floor(distance / (1000 * 60 * 60 * 24)),
      hours:   Math.floor((distance / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((distance / (1000 * 60)) % 60),
      seconds: Math.floor((distance / 1000) % 60),
    };
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState(getTimeLeft);
  // False for the static HTML and hydration, true after: the build-time
  // countdown would be stale by the time anyone loads the page.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [getTimeLeft]);

  const fmt = (n?: number) => String(n ?? 0).padStart(2, "0");

  const units = [
    { label: "days",    value: timeLeft?.days },
    { label: "hours",   value: timeLeft?.hours },
    { label: "minutes", value: timeLeft?.minutes },
    { label: "seconds", value: timeLeft?.seconds },
  ];

  // Quiet figures: a big number over a small unit, no colour.
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-4 mt-12">
      {units.map(({ label, value }) => (
        <div key={label} className="flex flex-col">
          <span
            className={`font-display text-[2rem] leading-none tabular-nums ${
              mounted ? "text-ink" : "text-ink-3/40"
            }`}
          >
            {mounted ? fmt(value) : "00"}
          </span>
          <span className="font-sans text-[13px] text-ink-3 mt-2">{label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Facts ────────────────────────────────────────────────────────────────
// ─── Page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  // 0 in the static HTML (all dormant), then the real count after hydration:
  // a build-time count would be stale by the time anyone loads the page.
  const inBloom = useSyncExternalStore(subscribeNoop, () => bloomCount(Date.now()), () => 0);
  const heroBed = withBlooms(HERO_BED, bloomSet(inBloom));

  return (
    <main className="relative w-full overflow-x-hidden">

      {/* ── HERO ── */}
      <section className="relative flex min-h-[100svh] flex-col">

        {/* MLH badge */}
        <a
          href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-0 right-5 md:right-12 z-50 w-[9%] max-w-[90px] min-w-[56px] hover:scale-105 hover:brightness-110 transition-all duration-300"
        >
          <img src="/mlh-trust-badge.svg" alt="Major League Hacking 2027" className="w-full" />
        </a>

        {/* Top padding clears the navbar and the MLH badge, which hangs to
            98px on phones and 158px from md (90px wide, 1:1.75). The flower
            bed is in the flow below, not on top, so nothing can sit on it.
            On a phone the globe sits between the title and the copy, so the
            buttons still land in the first screen; from lg it takes the right
            column and spans both rows of the left. */}
        <div className="wrap flex-1 pt-[7.5rem] md:pt-[11.5rem] pb-14 md:pb-20 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[auto_1fr] gap-x-12 items-start">
          <div className="lg:col-start-1 lg:row-start-1">
            <p className="kicker">Feb 26–28, 2027 · Klaus, Georgia Tech</p>

            {/* One line at every width: the size follows the viewport so
                "Hacklytics" fits a 375px phone and, in the left column from
                lg, a 1024px laptop; it tops out at 76px. */}
            <h1 className="display whitespace-nowrap text-[clamp(2.25rem,10.5vw,7.5rem)] lg:text-[clamp(3rem,4.4vw,4.75rem)] leading-none mt-5 mb-6 md:mb-10 lg:mb-8">
              Hacklytics
            </h1>
          </div>

          {/* The key art: a flat globe, a ribbon of blossoms across the
              Americas, and 8-bit text that spells "Data Science GT" and
              "Hacklytics 2027". The black is keyed out, so it sits on either
              theme. 807x705 is its native size; 480 serves 1x phones. */}
          <div className="mb-8 lg:mb-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center">
            <img
              src="/hero-globe-807.webp"
              srcSet="/hero-globe-480.webp 480w, /hero-globe-807.webp 807w"
              sizes="(min-width: 1024px) 520px, 88vw"
              width={807}
              height={705}
              alt="A flat illustration of the Americas on a globe, crossed by a pale pink ribbon of pixelated cherry blossoms, with lines of binary code over the oceans."
              fetchPriority="high"
              className="mx-auto block h-auto w-[min(88vw,24rem)] lg:w-full lg:max-w-[32.5rem]"
            />
            {/* Decorative: "Hacklytics 2027" in 8-bit ASCII, as on the art. */}
            <p
              aria-hidden="true"
              className="mx-auto mt-4 hidden max-w-[26rem] break-words sm:block text-center font-mono text-[11px] leading-[1.6] tracking-[0.04em] text-ocean"
            >
              01001000 01100001 01100011 01101011 01101100 01111001 01110100
              01101001 01100011 01110011 00100000 00110010 00110000 00110010
              00110111
            </p>
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            <p className="font-sans text-[17px] md:text-[19px] leading-[1.5] text-ink-2 max-w-[34rem]">
              36 hours of data science and AI in Atlanta, run by Data Science
              @ GT. Free to attend; meals and swag are covered.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <a
                href={INTEREST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-bloom"
              >
                Notify me
              </a>
              <a href="#tracks" className="btn btn-line">
                See tracks and prizes
              </a>
            </div>

            <Countdown targetDate={EVENT_START} />
          </div>
        </div>

        {/* The flower bed the hero stands in. Its share in bloom tracks the
            season; visitors can plant their own. */}
        <div className="pb-6">
          <h2 className="wrap font-display text-[16px] text-ink mb-3">
            Plant a flower
          </h2>
          <PixelBed
            plants={heroBed}
            soil
            plantable
            hint
            caption={
              inBloom
                ? `${inBloom} of ${HERO_BED.length} in bloom · fills in as Feb 26 gets closer`
                : undefined
            }
          />
        </div>
      </section>

      <HomeSections />
    </main>
  );
}
