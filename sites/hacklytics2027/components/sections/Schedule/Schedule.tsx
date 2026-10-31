"use client";
import React from "react";
import { BloomSprite } from "../../pixel/PixelSprite";
import { useBloomInView } from "../../pixel/useInView";
import { BUD, TULIP } from "../../pixel/sprites";
import { board } from "./data";

const DAYS = [
  { key: "Fri", name: "Friday", date: "Feb 26" },
  { key: "Sat", name: "Saturday", date: "Feb 27" },
  { key: "Sun", name: "Sunday", date: "Feb 28" },
] as const;

// The rail is the three days to scale, 72 hours from Friday midnight. Hacking
// runs Fri 9:00 PM (hour 21) to the Devpost deadline, Sun 9:00 AM (hour 57).
const toRail = (hour: number) => `${(hour / 72) * 100}%`;
const HACK_START = 21;
const HACK_END = 57;

// "Fri 5:00 PM" → day "Fri", time "5:00 PM"; "Sat, all day" → "Sat", "All day".
const split = (when: string) => {
  const day = when.slice(0, 3);
  const rest = when.slice(3).replace(/^,?\s*/, "");
  return { day, time: rest.charAt(0).toUpperCase() + rest.slice(1) };
};

export default function Schedule() {
  const rows = board.map((row) => ({ ...row, ...split(row.when) }));
  const seedlingRef = useBloomInView<HTMLDivElement>();

  return (
    <section id="schedule" className="section-anchor">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-end gap-x-16 gap-y-6 mb-10 md:mb-16">
          <h2 className="section-title">Schedule</h2>
          <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55]">
            The key times so far. Meals and workshops are added closer to the
            weekend.
          </p>
        </div>

        {/* A bud where hacking begins, in bloom where it ends. */}
        <div ref={seedlingRef} data-bloom="off" className="relative">
          <p
            className="font-display text-[16px] text-ink pb-3 pl-8"
            style={{ marginLeft: toRail(HACK_START) }}
          >
            36 hours<span className="hidden sm:inline"> of hacking</span>
          </p>
          <span
            aria-hidden="true"
            className="absolute bottom-0 -translate-x-1/2"
            style={{ left: toRail(HACK_START) }}
          >
            <BloomSprite map={BUD} scale={3} />
          </span>
          <span
            aria-hidden="true"
            className="absolute bottom-0 -translate-x-1/2"
            style={{ left: toRail(HACK_END) }}
          >
            <BloomSprite map={TULIP} scale={3} blooms />
          </span>
        </div>
        <div aria-hidden="true" className="relative h-2 bg-rule mb-10 md:mb-8">
          <div
            className="absolute inset-y-0 bg-bloom"
            style={{
              left: toRail(HACK_START),
              width: toRail(HACK_END - HACK_START),
            }}
          />
        </div>

        {/* No column gap: each day starts exactly on its third of the rail. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-12">
          {DAYS.map((d) => (
            <div key={d.key} className="md:pr-10 md:last:pr-0">
              <p className="flex items-baseline justify-between border-b border-line pb-3">
                <span className="font-display text-[16px] text-ink">{d.name}</span>
                <span className="font-sans text-[13px] text-ink-3 tabular-nums">{d.date}</span>
              </p>
              <ol>
                {rows
                  .filter((r) => r.day === d.key)
                  .map((r) => (
                    <li
                      key={r.when}
                      className="grid grid-cols-[5.5rem_1fr] md:grid-cols-1 lg:grid-cols-[5.5rem_1fr] gap-x-4 gap-y-1 border-b border-rule py-4"
                    >
                      <span
                        className={`font-sans text-[15px] tabular-nums ${
                          r.accent ? "text-ink font-medium" : "text-ink-3"
                        }`}
                      >
                        {r.time}
                      </span>
                      <span
                        className={`font-sans text-[17px] text-ink ${r.accent ? "font-medium" : ""}`}
                      >
                        {r.event}
                      </span>
                    </li>
                  ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
