"use client";
import React from "react";
import { board } from "./data";

const DAYS = [
  { key: "Fri", name: "Friday", date: "Feb 26" },
  { key: "Sat", name: "Saturday", date: "Feb 27" },
  { key: "Sun", name: "Sunday", date: "Feb 28" },
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
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-14 md:mb-20">
          <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl text-white leading-[1] tracking-[-0.03em]">
            Schedule
          </h2>
          <p className="font-sans text-base md:text-lg text-white/65 max-w-[44ch] md:text-right">
            The key times so far. Meals and workshops are added closer to the
            weekend.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-12">
          {DAYS.map((d) => (
            <div key={d.key}>
              <p className="flex items-baseline justify-between border-b border-white/25 pb-3">
                <span className="font-sans font-bold text-xl text-white">{d.name}</span>
                <span className="font-sans text-sm text-white/55 tabular-nums">{d.date}</span>
              </p>
              <ol>
                {rows
                  .filter((r) => r.day === d.key)
                  .map((r) => (
                    <li
                      key={r.when}
                      className="grid grid-cols-[5.5rem_1fr] gap-4 border-b border-white/10 py-4"
                    >
                      <span
                        className={`font-sans text-base tabular-nums ${
                          r.accent ? "text-bloom-cyan" : "text-white/55"
                        }`}
                      >
                        {r.time}
                      </span>
                      <span className="font-sans text-base md:text-lg text-white">{r.event}</span>
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
