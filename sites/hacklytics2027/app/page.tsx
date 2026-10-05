"use client";
import React, { useState, useEffect, useSyncExternalStore } from "react";
import HomeSections from "@/components/HomeSections";
import { PixelBed, bloomSet, plantBed, withBlooms } from "@/components/pixel/PixelBed";
import { INTEREST_HINT, INTEREST_URL } from "@/lib/links";

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
            className={`font-display font-semibold text-[2.75rem] leading-none tracking-[-0.03em] tabular-nums ${
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
const facts = [
  { label: "Room for", value: "1,000+ hackers" },
  { label: "Tracks", value: "Finance · Sports · Health · Entertainment · Wildcard" },
  { label: "Length", value: "36 hours" },
  { label: "Cost", value: "Free" },
];

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
          <img src="/mlh-trust-badge.svg" alt="Major League Hacking 2027" className="w-full drop-shadow-2xl" />
        </a>

        {/* Top padding clears the navbar and the MLH badge, which hangs to
            98px on phones and 158px from md (90px wide, 1:1.75). The flower
            bed is in the flow below, not on top, so nothing can sit on it. */}
        <div className="wrap flex-1 pt-[8.5rem] md:pt-[11.5rem] pb-14 md:pb-20">
          <p className="kicker">Feb 26–28, 2027 · Klaus, Georgia Tech</p>

          {/* One line at every width: the size follows the viewport so
              "Hacklytics" fits a 375px phone and tops out at 144px. */}
          <h1 className="display whitespace-nowrap text-[clamp(3rem,18vw,9rem)] leading-[0.85] tracking-[-0.045em] mt-5 mb-8 md:mb-10">
            Hacklytics
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-12 lg:gap-20 lg:items-end">
            <div>
              <p className="font-sans text-[17px] md:text-[19px] leading-[1.5] text-ink-2 max-w-[34rem]">
                36 hours of data science and AI in Atlanta, run by Data Science
                @ GT. Free to attend; meals, swag and cloud credits are covered.
              </p>

              {/* The caption sits under the pair, not under Notify me alone:
                  stacked with it, the button column was taller than the
                  other button and the row lost its alignment. */}
              <div className="mt-8 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href={INTEREST_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-describedby="notify-handoff-hint"
                    className="btn btn-bloom"
                  >
                    Notify me
                  </a>
                  <a href="#tracks" className="btn btn-line">
                    See tracks and prizes
                  </a>
                </div>
                <span
                  id="notify-handoff-hint"
                  className="font-sans text-[13px] leading-snug text-ink-3"
                >
                  {INTEREST_HINT}
                </span>
              </div>

              <Countdown targetDate={EVENT_START} />
            </div>

            <dl className="font-sans text-[15px]">
              {facts.map((f) => (
                <div
                  key={f.label}
                  className="flex items-baseline justify-between gap-6 border-t border-rule py-3"
                >
                  <dt className="text-ink-3 shrink-0">{f.label}</dt>
                  <dd className="text-ink text-right">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* The flower bed the hero stands in. Its share in bloom tracks the
            season; visitors can plant their own. */}
        <div className="pb-6">
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
