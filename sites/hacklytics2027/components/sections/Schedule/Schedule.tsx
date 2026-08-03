"use client";
import React, { useState } from "react";
import { scheduleData, categories } from "./data";
import { PixelLabel } from "../../pixel/PixelBits";
import PixelSprite from "../../pixel/PixelSprite";
import { MUSHROOM } from "../../pixel/sprites";

const categoryColors: Record<string, string> = {
  general:  "var(--bloom-cyan)",
  food:     "var(--bloom-lime)",
  workshop: "var(--bloom-pink)",
  activity: "var(--bloom-purple)",
};

const categoryDots: Record<string, string> = {
  general:  "bg-bloom-cyan",
  food:     "bg-bloom-lime",
  workshop: "bg-bloom-pink",
  activity: "bg-bloom-purple",
};

export default function Schedule() {
  const [selectedDay, setSelectedDay]           = useState("Friday");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const days = ["Friday", "Saturday", "Sunday"];

  const filtered =
    selectedCategory === "all"
      ? scheduleData[selectedDay]
      : scheduleData[selectedDay]?.filter((e) => e.category === selectedCategory) ?? [];

  return (
    <section id="schedule" className="section-anchor text-white">
      <div className="section-wrap max-w-7xl mx-auto py-24 md:py-32">

        {/* Header */}
        <PixelLabel text="Schedule" tint="lime" />
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-16">
          <h2 className="font-sans font-medium text-5xl md:text-7xl lg:text-[6rem] text-white leading-[0.9] tracking-[-0.03em]">
            Event<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-bloom-lime to-white/60">
              Timeline
            </span>
          </h2>
          <p className="font-sans text-sm text-white/40 max-w-xs leading-relaxed md:text-right font-light">
            36 hours of intense building, learning, and collaborating.
          </p>
        </div>

        {/* Controls row */}
        <div className="flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between mb-12">

          {/* Day tabs */}
          <div className="pixel-frame pixel-lime flex gap-2 p-1.5 bg-white/[0.03] w-fit">
            {days.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`font-pixel text-[10px] px-6 py-3 transition-colors duration-200 ${
                  selectedDay === day
                    ? "bg-bloom-lime/20 text-white shadow-[0_0_18px_rgba(200,255,0,0.35)]"
                    : "text-white/45 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {day}
              </button>
            ))}
          </div>

          {/* Category filter pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`font-pixel text-[10px] px-5 py-2.5 pixel-frame transition-colors duration-200 ${
                selectedCategory === "all"
                  ? "pixel-cyan text-white bg-white/[0.08]"
                  : "text-white/45 hover:text-white bg-white/[0.02]"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`font-pixel text-[10px] px-5 py-2.5 pixel-frame transition-colors duration-200 flex items-center gap-2 ${
                  selectedCategory === cat.id
                    ? "pixel-cyan text-white bg-white/[0.08]"
                    : "text-white/45 hover:text-white bg-white/[0.02]"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${categoryDots[cat.id]} shadow-[0_0_8px_currentColor]`} style={{ color: categoryColors[cat.id] }} />
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        {filtered.length > 0 ? (
          <div className="relative mt-8">
            {/* Vertical line */}
            <div className="absolute left-6 md:left-[11.5rem] top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-white/[0.1] to-transparent hidden sm:block" />

            <div className="flex flex-col gap-4 relative z-10">
              {filtered.map((event, i) => {
                const color = categoryColors[event.category] ?? "#fff";
                const dot   = categoryDots[event.category] ?? "bg-white";
                return (
                  <div key={i} className="pixel-frame relative flex flex-col md:flex-row gap-6 md:gap-8 pl-6 sm:pl-16 md:pl-0 py-6 pr-6 group bg-white/[0.03] transition-colors duration-200">
                    {/* Dot on the line */}
                    <div className={`hidden sm:block absolute left-[calc(1.5rem-4px)] md:left-[calc(11.5rem-4px)] top-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full ${dot} shadow-[0_0_10px_currentColor] opacity-40 group-hover:opacity-100 transition-all duration-500`} style={{ color }} />

                    {/* Time */}
                    <div className="md:w-44 md:text-right shrink-0 md:pr-10 md:py-1">
                      <span className="font-pixel text-[10px] text-white/45 group-hover:text-white transition-colors duration-200">
                        {event.time}
                      </span>
                    </div>

                    {/* Event info */}
                    <div className="flex-1 min-w-0 md:pl-10 md:border-l md:border-white/[0.05] transition-colors duration-500 group-hover:border-white/[0.15]">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                          <h3 className="font-sans font-medium text-lg md:text-xl text-white/90 group-hover:text-white transition-colors duration-500 leading-tight">
                            {event.eventName}
                          </h3>
                          {event.location !== "TBA" && (
                            <p className="font-sans text-sm text-white/40 mt-2 font-light">{event.location}</p>
                          )}
                        </div>
                        <span
                          className="pixel-frame shrink-0 font-pixel text-[9px] px-3 py-1.5 bg-white/[0.03] transition-colors duration-200"
                          style={{ color }}
                        >
                          {event.category}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="pixel-frame py-24 mt-8 text-center bg-white/[0.02] flex flex-col items-center gap-2"><PixelSprite map={MUSHROOM} palette="purple" scale={4} glow className="animate-bob" />
            <p className="font-pixel text-[10px] text-white/35 mb-4">No events found</p>
            <p className="font-sans text-sm text-white/40 font-light">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </section>
  );
}
