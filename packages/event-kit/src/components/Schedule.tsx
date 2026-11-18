import React from "react";
import type { ComponentType } from "react";
import type { EventConfig } from "../config";

// "Fri 5:00 PM" → day "Fri", time "5:00 PM"; "Sat, all day" → "Sat", "All day".
const split = (when: string) => {
  const day = when.slice(0, 3);
  const rest = when.slice(3).replace(/^,?\s*/, "");
  return { day, time: rest.charAt(0).toUpperCase() + rest.slice(1) };
};

/**
 * The rail is the event's days to scale. `RailStart` and `RailEnd` are the
 * art standing where hacking begins and ends: a site's picture for "this has
 * started" and "this is done". The wrapper is marked `data-bloom-watch` for a
 * site script that starts that art on first sight.
 */
export default function Schedule({
  event,
  RailStart,
  RailEnd,
}: {
  event: EventConfig;
  RailStart?: ComponentType;
  RailEnd?: ComponentType;
}) {
  const { schedule, dates, hackHours } = event;
  const { span, from, to } = schedule.rail;
  const toRail = (hour: number) => `${(hour / span) * 100}%`;
  const rows = schedule.board.map((row) => ({ ...row, ...split(row.when) }));

  return (
    <section id="schedule" className="section-anchor">
      <div className="wrap py-12 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-end gap-x-16 gap-y-6 mb-10 md:mb-16">
          <h2 className="section-title">Schedule</h2>
          <p className="font-sans text-[17px] md:text-[19px] text-ink-2 leading-[1.55]">
            {schedule.intro}
          </p>
        </div>

        <div data-bloom="off" data-bloom-watch="" className="relative">
          <p
            className="font-display text-[16px] text-ink pb-3 pl-8"
            style={{ marginLeft: toRail(from) }}
          >
            {hackHours} hours<span className="hidden sm:inline"> of hacking</span>
          </p>
          {RailStart && (
            <span
              aria-hidden="true"
              className="absolute bottom-0 -translate-x-1/2"
              style={{ left: toRail(from) }}
            >
              <RailStart />
            </span>
          )}
          {RailEnd && (
            <span
              aria-hidden="true"
              className="absolute bottom-0 -translate-x-1/2"
              style={{ left: toRail(to) }}
            >
              <RailEnd />
            </span>
          )}
        </div>
        <div aria-hidden="true" className="relative h-2 bg-rule mb-10 md:mb-8">
          <div
            className="absolute inset-y-0 bg-bloom"
            style={{
              left: toRail(from),
              width: toRail(to - from),
            }}
          />
        </div>

        {/* No column gap: each day starts exactly on its share of the rail. */}
        <div
          className="grid grid-cols-1 md:grid-cols-[repeat(var(--days),minmax(0,1fr))] gap-y-12"
          style={{ "--days": dates.days.length } as React.CSSProperties}
        >
          {dates.days.map((d) => (
            <div key={d.key} className="md:pr-10 md:last:pr-0">
              <p className="flex items-baseline justify-between border-b border-line pb-3">
                <span className="font-display text-[16px] text-ink">{d.name}</span>
                <span className="font-sans text-[13px] text-ink-3 tabular-nums">{d.label}</span>
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
