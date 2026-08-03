"use client";
import React, { useState } from "react";
import { scheduleData, categories } from "./data";
import SectionHead from "../../SectionHead";

const categoryMark: Record<string, string> = {
  general: "bg-ink",
  food: "bg-gold-hot",
  workshop: "bg-navy",
  activity: "bg-gold",
};

const days = ["Friday", "Saturday", "Sunday"];
const dayDates: Record<string, string> = {
  Friday: "Feb 26",
  Saturday: "Feb 27",
  Sunday: "Feb 28",
};

export default function Schedule() {
  const [selectedDay, setSelectedDay] = useState("Friday");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filtered =
    selectedCategory === "all"
      ? scheduleData[selectedDay]
      : scheduleData[selectedDay]?.filter((e) => e.category === selectedCategory) ?? [];

  return (
    <section id="schedule" className="section-anchor relative bg-paper">
      <div className="wrap py-14 md:py-20">
        <SectionHead
          num="04"
          label="Programme"
          title="Schedule"
          note="Subject to change up to the opening ceremony. Times are Eastern."
        />

        {/* Day tabs */}
        <div className="mt-10 flex border border-ink md:mt-14" role="tablist" aria-label="Event day">
          {days.map((day) => {
            const active = selectedDay === day;
            return (
              <button
                key={day}
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedDay(day)}
                className={`flex flex-1 flex-col items-start gap-1 px-4 py-4 text-left not-last:border-r not-last:border-ink md:px-6 md:py-5 ${
                  active ? "bg-ink text-paper" : "hover:bg-paper-2"
                }`}
              >
                <span className="display text-lg md:text-2xl">{day}</span>
                <span className={`mono-label ${active ? "text-gold" : "text-ink-soft"}`}>{dayDates[day]}</span>
              </button>
            );
          })}
        </div>

        {/* Category filter */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mono-label mr-2 text-ink-soft">Filter</span>
          {[{ id: "all", name: "All" }, ...categories].map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                aria-pressed={active}
                className={`mono-label flex items-center gap-2 border px-4 py-2 ${
                  active ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"
                }`}
              >
                {cat.id !== "all" && (
                  <span className={`h-2 w-2 ${categoryMark[cat.id] ?? "bg-ink"}`} aria-hidden />
                )}
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Timetable */}
        {filtered.length > 0 ? (
          <table className="mt-10 w-full text-left">
            <caption className="sr-only">{selectedDay} schedule</caption>
            <thead>
              <tr className="rule-heavy-b">
                <th scope="col" className="mono-label w-[30%] py-3 text-ink-soft md:w-[22%]">Time</th>
                <th scope="col" className="mono-label py-3 text-ink-soft">Event</th>
                <th scope="col" className="mono-label hidden py-3 text-ink-soft md:table-cell md:w-[20%]">Location</th>
                <th scope="col" className="mono-label hidden py-3 text-right text-ink-soft sm:table-cell sm:w-[16%]">Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event, i) => (
                <tr key={i} className="rule-b align-baseline hover:bg-paper-2">
                  <td className="mono-label tabular py-5 pr-3 text-ink">{event.time}</td>
                  <td className="py-5 pr-3">
                    <span className="text-base font-medium md:text-lg">{event.eventName}</span>
                    {event.location !== "TBA" && (
                      <span className="mono-label mt-1 block text-ink-soft md:hidden">{event.location}</span>
                    )}
                  </td>
                  <td className="hidden py-5 text-sm text-ink-soft md:table-cell">{event.location}</td>
                  <td className="hidden py-5 text-right sm:table-cell">
                    <span className="mono-label inline-flex items-center gap-2 text-ink-soft">
                      <span className={`h-2 w-2 ${categoryMark[event.category] ?? "bg-ink"}`} aria-hidden />
                      {event.category}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mono-label rule-heavy-t mt-10 py-16 text-center text-ink-soft">
            No events match that filter
          </p>
        )}
      </div>
    </section>
  );
}
