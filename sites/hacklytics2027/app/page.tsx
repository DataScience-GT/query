"use client";
import React, { useState, useEffect } from "react";
import HomeSections from "@/components/HomeSections";

const APPLY_URL = "https://form.typeform.com/to/GvqBCdAe";

// ─── Spec table — the event as a printed colophon ─────────────────────────
const SPEC: [string, string][] = [
  ["Dates", "Feb 26 – 28, 2027"],
  ["Venue", "Klaus Advanced Computing"],
  ["City", "Atlanta, Georgia"],
  ["Duration", "36 hours"],
  ["Entry", "Free — students, 18+"],
  ["Scale", "1,000+ hackers"],
];

// ─── Countdown ────────────────────────────────────────────────────────────
const Countdown: React.FC<{ targetDate: Date }> = ({ targetDate }) => {
  const getTimeLeft = React.useCallback(() => {
    const distance = targetDate.getTime() - Date.now();
    if (distance <= 0) return null;
    return {
      days: Math.floor(distance / (1000 * 60 * 60 * 24)),
      hours: Math.floor((distance / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((distance / (1000 * 60)) % 60),
      seconds: Math.floor((distance / 1000) % 60),
    };
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTimeLeft(getTimeLeft());
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [getTimeLeft]);

  const fmt = (n?: number, pad = 2) => String(n ?? 0).padStart(pad, "0");

  const units: [string, string][] = [
    ["Days", fmt(timeLeft?.days, 3)],
    ["Hrs", fmt(timeLeft?.hours)],
    ["Min", fmt(timeLeft?.minutes)],
    ["Sec", fmt(timeLeft?.seconds)],
  ];

  return (
    <div className="grid grid-cols-4" aria-live="off">
      {units.map(([label, value], i) => (
        <div
          key={label}
          className={`flex items-baseline gap-2 py-3 pr-3 md:gap-3 md:pr-6 ${i > 0 ? "border-l border-rule pl-3 md:pl-6" : ""}`}
        >
          <span className={`display tabular text-[clamp(1.75rem,5.5vw,3.75rem)] ${mounted ? "text-ink" : "text-ink/25"}`}>
            {mounted ? value : "00"}
          </span>
          <span className="mono-label text-ink-soft">{label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Ticker ───────────────────────────────────────────────────────────────
const TICKER = [
  "36 Hours",
  "Feb 26–28 2027",
  "1,000+ Hackers",
  "5 Tracks",
  "Klaus · Georgia Tech",
  "Free Entry",
];

const Ticker = () => (
  <div className="relative overflow-hidden bg-ink text-paper py-3 select-none">
    <div className="ticker-track">
      {[0, 1].map((copy) => (
        <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
          {TICKER.map((item) => (
            <span key={item} className="mono-label flex items-center whitespace-nowrap px-6">
              <span className="text-gold mr-6">◆</span>
              {item}
            </span>
          ))}
        </div>
      ))}
    </div>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <main className="relative w-full bg-paper text-ink overflow-x-hidden">
      {/* ── HERO ── */}
      <section className="relative min-h-[100svh] flex flex-col pt-[var(--navbar-height)]">
        <div className="gridlines" />

        <div className="wrap relative z-10 flex flex-1 flex-col">
          {/* Masthead strip */}
          <div className="rule-b flex flex-wrap items-center justify-between gap-y-2 py-4">
            <span className="mono-label text-ink-soft">Data Science @ Georgia Tech</span>
            <span className="mono-label text-ink-soft">Feb 26–28 · Atlanta, GA</span>
            <a
              href="https://mlh.io/na?utm_source=na-hackathon&utm_medium=TrustBadge&utm_campaign=2026-season&utm_content=white"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-ink px-3 py-2"
            >
              {/* MLH ships a white-on-transparent badge — it sits on an ink plate */}
              <img src="/mlh-trust-badge.svg" alt="Major League Hacking 2027 Hackathon Season" className="h-10 w-auto" />
            </a>
          </div>

          {/* Title lockup */}
          <div className="flex flex-1 flex-col justify-center py-8 md:py-10">
            <h1 aria-label="Hacklytics 2027" className="display text-[clamp(3.25rem,12vw,10.5rem)]">
              <span className="block">Hacklytics</span>
              <span className="mt-2 flex items-end gap-4 md:gap-8">
                <span className="text-gold-deep leading-none">2027</span>
                <span className="mb-[0.35em] hidden h-[2px] flex-1 bg-ink md:block" />
              </span>
            </h1>

            <div className="mt-10 grid gap-10 md:mt-12 md:grid-cols-12 md:gap-8">
              {/* Lede + actions */}
              <div className="md:col-span-7 lg:col-span-6">
                <p className="lede max-w-[46ch] text-ink">
                  Thirty-six hours. One dataset away from something that matters.
                  Hacklytics is the Southeast&apos;s largest student datathon —
                  built, judged, and won in a single weekend at Georgia Tech.
                </p>

                <div className="mt-8 flex flex-wrap items-stretch gap-3">
                  <a
                    href={APPLY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono-label group flex items-center gap-4 bg-ink px-8 py-5 text-paper transition-colors duration-150 hover:bg-navy"
                  >
                    Apply now
                    <span className="transition-transform duration-150 group-hover:translate-x-1">→</span>
                  </a>
                  <a
                    href="#about"
                    className="mono-label invert-hover flex items-center border border-ink px-8 py-5"
                  >
                    Read the brief
                  </a>
                </div>
              </div>

              {/* Spec table */}
              <dl className="md:col-span-5 md:col-start-8 rule-heavy-t">
                {SPEC.map(([k, v]) => (
                  <div key={k} className="rule-b flex items-baseline justify-between gap-6 py-3">
                    <dt className="mono-label text-ink-soft">{k}</dt>
                    <dd className="text-right text-sm font-medium tracking-tight md:text-base">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* Countdown rail */}
          <div className="rule-heavy-t pb-6">
            <div className="mono-label flex items-center justify-between py-3 text-ink-soft">
              <span>Time to hack</span>
              <span className="hidden sm:inline">2027-02-26 · 17:00 EST</span>
            </div>
            <Countdown targetDate={new Date("2027-02-26T17:00:00-05:00")} />
          </div>
        </div>

        <Ticker />
      </section>

      <HomeSections />
    </main>
  );
}
