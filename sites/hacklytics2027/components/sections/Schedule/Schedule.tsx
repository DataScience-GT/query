"use client";
import React, { useState } from "react";
import { scheduleData, categories } from "./data";

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
        <div className="flex items-center gap-4 mb-6">
          <div className="h-px w-12 bg-gradient-to-r from-bloom-lime to-transparent" />
          <span className="font-mono text-[10px] text-bloom-lime uppercase tracking-[0.4em] font-medium">Schedule</span>
        </div>
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
          <div className="flex gap-2 p-1.5 border border-white/[0.05] rounded-2xl bg-white/[0.02] backdrop-blur-xl w-fit">
            {days.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`font-mono text-[10px] sm:text-xs uppercase tracking-[0.2em] px-6 py-3 rounded-xl transition-all duration-300 ${
                  selectedDay === day
                    ? "bg-white/[0.08] text-white font-medium border border-white/[0.1] shadow-lg"
                    : "text-white/40 hover:text-white hover:bg-white/[0.04] border border-transparent"
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
              className={`font-mono text-[10px] uppercase tracking-[0.2em] px-5 py-2.5 rounded-full border transition-all duration-300 ${
                selectedCategory === "all"
                  ? "border-white/[0.15] text-white bg-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                  : "border-white/[0.05] text-white/40 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`font-mono text-[10px] uppercase tracking-[0.2em] px-5 py-2.5 rounded-full border transition-all duration-300 flex items-center gap-2 ${
                  selectedCategory === cat.id
                    ? "border-white/[0.15] text-white bg-white/[0.08] shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                    : "border-white/[0.05] text-white/40 hover:text-white hover:bg-white/[0.04]"
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
                  <div key={i} className="relative flex flex-col md:flex-row gap-6 md:gap-8 pl-6 sm:pl-16 md:pl-0 py-6 pr-6 group bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-2xl backdrop-blur-2xl transition-all duration-500">
                    {/* Dot on the line */}
                    <div className={`hidden sm:block absolute left-[calc(1.5rem-4px)] md:left-[calc(11.5rem-4px)] top-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full ${dot} shadow-[0_0_10px_currentColor] opacity-40 group-hover:opacity-100 transition-all duration-500`} style={{ color }} />

                    {/* Time */}
                    <div className="md:w-44 md:text-right shrink-0 md:pr-10 md:py-1">
                      <span className="font-mono text-xs text-white/40 group-hover:text-white/70 transition-colors duration-500 uppercase tracking-[0.2em]">
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
                          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 rounded-full border border-white/[0.05] group-hover:border-white/[0.15] bg-white/[0.02] group-hover:bg-white/[0.05] transition-all duration-500"
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
          <div className="py-24 mt-8 text-center border border-white/[0.05] rounded-3xl bg-white/[0.01] backdrop-blur-xl">
            <p className="font-mono text-[10px] text-white/30 uppercase tracking-[0.3em] mb-4">No events found</p>
            <p className="font-sans text-sm text-white/40 font-light">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </section>
  );
}
