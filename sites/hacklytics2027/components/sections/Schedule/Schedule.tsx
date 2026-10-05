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
    <section id="schedule" className="section-anchor border-t border-rule">
      <div className="wrap py-24 md:py-32">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14 md:mb-20">
          <h2 className="section-title">Schedule</h2>
          <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55] max-w-[44ch]">
            The key times so far. Meals and workshops are added closer to the
            weekend.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-12">
          {DAYS.map((d) => (
            <div key={d.key}>
              <p className="flex items-baseline justify-between border-b border-ink-3/60 pb-3">
                <span className="font-sans font-semibold text-[19px] text-ink">{d.name}</span>
                <span className="font-sans text-sm text-ink-3 tabular-nums">{d.date}</span>
              </p>
              <ol>
                {rows
                  .filter((r) => r.day === d.key)
                  .map((r) => (
                    <li
                      key={r.when}
                      className="grid grid-cols-[5.5rem_1fr] gap-4 border-b border-rule py-4"
                    >
                      <span
                        className={`font-sans text-[15px] tabular-nums ${
                          r.accent ? "text-ink font-semibold" : "text-ink-3"
                        }`}
                      >
                        {r.time}
                      </span>
                      <span
                        className={`font-sans text-[17px] text-ink ${r.accent ? "font-semibold" : ""}`}
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
