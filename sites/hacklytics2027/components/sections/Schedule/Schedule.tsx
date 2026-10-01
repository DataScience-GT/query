"use client";
import React from "react";
import { board } from "./data";
import Eyebrow from "../Eyebrow";

const DAYS = [
  { key: "Fri", name: "Friday", date: "Feb 26", frame: "pixel-cyan", text: "text-bloom-cyan" },
  { key: "Sat", name: "Saturday", date: "Feb 27", frame: "pixel-lime", text: "text-bloom-lime" },
  { key: "Sun", name: "Sunday", date: "Feb 28", frame: "pixel-pink", text: "text-bloom-pink" },
] as const;

// "Fri 5:00 PM" → day "Fri", time "5:00 PM"; "Sat, all day" → "Sat", "All day".
const split = (when: string) => {
  const day = when.slice(0, 3);
  const rest = when.slice(3).replace(/^,?\s*/, "");
  return { day, time: rest.charAt(0).toUpperCase() + rest.slice(1) };
};

export default function Schedule() {
  const rows = board.map((row) => ({ ...row, ...split(row.when) }));

  return (
    <section id="schedule" className="section-anchor text-white">
      <div className="section-wrap max-w-7xl mx-auto py-20 md:py-28 px-6">
        <Eyebrow index="04" tone="cyan">Schedule</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-5 max-w-3xl">
          36 hours. <span className="neon-cyan">One Klaus weekend.</span>
        </h2>
        <p className="font-sans text-base md:text-lg text-white/65 mb-12 md:mb-16 max-w-xl">
          The key times so far. Meals and workshops are added closer to the
          weekend.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {DAYS.map((d) => (
            <div key={d.key} className={`pixel-frame ${d.frame} bg-white/[0.03] p-6 md:p-8`}>
              <div className="flex items-baseline justify-between mb-8">
                <p className={`font-pixel text-sm uppercase ${d.text}`}>{d.name}</p>
                <p className="font-pixel text-[10px] uppercase text-white/45">{d.date}</p>
              </div>

              <ol className="relative border-l-2 border-dashed border-white/15 ml-1.5 flex flex-col gap-7">
                {rows
                  .filter((r) => r.day === d.key)
                  .map((r) => (
                    <li key={r.when} className="relative pl-7">
                      {/* Square node on the rail; the milestones glow. */}
                      <span
                        aria-hidden
                        className={`absolute -left-[7px] top-1.5 h-3 w-3 ${
                          r.accent
                            ? "bg-bloom-cyan shadow-[0_0_12px_rgba(0,229,255,0.9)]"
                            : "bg-white/30"
                        }`}
                      />
                      <p
                        className={`font-sans text-sm tabular-nums ${
                          r.accent ? "text-bloom-cyan" : "text-white/55"
                        }`}
                      >
                        {r.time}
                      </p>
                      <p className="font-sans font-bold text-lg md:text-xl text-white tracking-tight mt-0.5">
                        {r.event}
                      </p>
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
