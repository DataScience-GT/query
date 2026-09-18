"use client";
import React from "react";
import { board } from "./data";
import Eyebrow from "../Eyebrow";

export default function Schedule() {
  return (
    <section id="schedule" className="section-anchor text-white border-t border-white/[0.06]">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32 px-6">
        <Eyebrow>Schedule</Eyebrow>
        <h2 className="font-sans font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[-0.03em] mb-4 max-w-3xl">
          36 hours. One Klaus weekend.
        </h2>
        <p className="font-sans text-sm text-white/40 mb-12 md:mb-16 max-w-md">
          Preview board. Meals and workshops post closer to Feb 26–28, 2027.
        </p>

        <ol className="border-t border-white/10">
          {board.map((row) => (
            <li
              key={`${row.when}-${row.event}`}
              className="grid grid-cols-[7.5rem_1fr] sm:grid-cols-[10rem_1fr] gap-4 sm:gap-10 border-b border-white/10 py-4 md:py-5"
            >
              <span
                className={`font-sans text-sm md:text-base tabular-nums tracking-wide ${
                  row.accent ? "text-bloom-cyan" : "text-white/45"
                }`}
              >
                {row.when}
              </span>
              <span className="font-sans font-medium text-base md:text-lg text-white">
                {row.event}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
