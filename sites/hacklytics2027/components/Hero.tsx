"use client";
import React, { useState, useEffect, useSyncExternalStore } from "react";
import MlhBadge from "@/components/MlhBadge";
import { BED_SIZE, bloomSet, plantBed, withBlooms } from "@/components/pixel/beds";
import { PixelBed } from "@/components/pixel/PixelBed";
import { EVENT_START, useInBloom } from "@/components/pixel/season";
import { INTEREST_URL } from "@/lib/links";

const HERO_BED = plantBed(0);

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
    <div className="flex flex-wrap justify-center gap-x-8 max-[340px]:gap-x-4 gap-y-4 lg:grid lg:grid-cols-[auto_auto] lg:self-center lg:justify-self-end lg:pb-10 xl:flex short:pb-4">
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

// ─── Hero ─────────────────────────────────────────────────────────────────
export default function Hero() {
  const inBloom = useInBloom();
  const heroBed = withBlooms(HERO_BED, bloomSet(inBloom));

  return (
    <section className="relative flex min-h-[100svh] flex-col">

      <MlhBadge />

      {/* Top padding clears the navbar and the MLH badge, which hangs to
          98px on phones and 158px from md (90px wide, 1:1.75). */}
      <div className="wrap relative z-20 flex flex-1 flex-col pt-28 md:pt-40 short:pt-24">
        <div className="text-center">
          <p className="kicker text-[17px] max-[340px]:text-[15px] md:text-[20px] leading-7 text-ink">
            Feb 26–28, 2027 · Klaus, Georgia Tech
          </p>

          {/* One line at every width, and only multiples of 8, so a pixel
              cell is always a whole number of screen pixels. "Hacklytics"
              is 5.75em wide. The nudge undoes the tracking after the last
              letter, which pushed the ink right of centre. */}
          <h1 className="display whitespace-nowrap text-[40px] min-[360px]:text-[48px] min-[390px]:text-[56px] sm:text-[96px] md:text-[112px] lg:text-[160px] xl:text-[192px] short:text-[128px] mt-4 short:mt-2 -translate-x-[0.0625em]">
            Hacklytics
          </h1>
        </div>

        {/* The globe stands dead centre, with the words either side from lg
            and above it below that. -mb-24 sets it down on the soil, past
            the bed's 96px row, in the gap the bed leaves for it. This box is
            above the bed, so no flower can ever cover the globe. */}
        <div className="mt-6 md:mt-8 short:mt-4 grid flex-1 grid-cols-1 lg:grid-cols-[1fr_24rem_1fr] xl:grid-cols-[1fr_30rem_1fr] short:grid-cols-[1fr_auto_1fr] gap-x-8 gap-y-8">
          <div className="text-center lg:text-left lg:self-center lg:pb-10 short:pb-4">
            <p className="font-sans text-[17px] leading-[1.5] text-ink-2">
              <span className="text-ink">
                36 hours of data science and AI in Atlanta, run by Data
                Science @ GT.
              </span>{" "}
              Free to attend; meals and swag are covered.
            </p>

            <div className="mt-8 flex flex-col min-[360px]:grid min-[360px]:grid-cols-[8rem_1fr] sm:flex sm:flex-row sm:justify-center lg:flex-col lg:items-start xl:flex-row xl:justify-start gap-3">
              <a
                href={INTEREST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-bloom"
              >
                Notify me
              </a>
              <a href="#tracks" className="btn btn-line max-[389px]:px-3 max-[389px]:text-[14px]">
                See tracks and prizes
              </a>
            </div>
          </div>

          {/* The key art: a flat globe, a ribbon of blossoms across the
              Americas, and 8-bit text that spells "Data Science GT" and
              "Hacklytics 2027". The black is keyed out, so it sits on either
              theme. 807x705 is its native size; 480 serves 1x phones. */}
          <img
            src="/hero-globe-807.webp"
            srcSet="/hero-globe-480.webp 480w, /hero-globe-807.webp 807w"
            sizes="(min-width: 1280px) 480px, (min-width: 768px) 416px, (min-width: 640px) 368px, 270px"
            width={807}
            height={705}
            alt="A flat illustration of the Americas on a globe, crossed by a pale pink ribbon of pixelated cherry blossoms, with lines of binary code over the oceans."
            fetchPriority="high"
            className="pointer-events-none order-last lg:order-none mx-auto block h-auto self-end w-[240px] min-[390px]:w-[270px] sm:w-[23rem] md:w-[26rem] lg:w-full short:w-[min(calc(100svh-19rem),42vw)] -mb-24 -translate-x-[1%]"
          />

          <Countdown targetDate={EVENT_START} />
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
          className="h-24"
          gap="block w-52 min-[390px]:w-60 sm:w-72 md:w-80 lg:w-[22rem] xl:w-[28rem] short:w-[calc(100svh-26rem)]"
          heading={
            <h2 className="font-display text-[16px] text-ink">Plant a flower</h2>
          }
          caption={
            inBloom
              ? `${inBloom} of ${BED_SIZE} in bloom · fills in as Feb 26 gets closer`
              : undefined
          }
        />
      </div>
    </section>
  );
}
