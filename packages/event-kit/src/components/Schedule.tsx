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
 *
 * Under the rail, the days are tabs, one day at a time, so a full weekend
 * does not become a wall. They are progressive enhancement: the page is built
 * with the tabs hidden and every day showing, side by side from md, and
 * scripts/schedule-days.ts turns that into tabs. Each tab sits under its
 * share of the rail.
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
          data-days=""
          data-tz={event.timeZone}
          data-start={event.startMs}
          data-end={event.endMs}
          style={{ "--days": dates.days.length } as React.CSSProperties}
        >
          <div
            role="tablist"
            aria-label="Day of the weekend"
            hidden
            className="grid grid-cols-[repeat(var(--days),minmax(0,1fr))] border-b border-line mb-2"
          >
            {dates.days.map((d) => (
              <button
                key={d.key}
                type="button"
                role="tab"
                id={`day-tab-${d.key}`}
                aria-controls={`day-panel-${d.key}`}
                aria-selected="false"
                tabIndex={-1}
                data-day={d.key}
                className="group -mb-px cursor-pointer border-b-2 border-transparent pt-2 pb-3 text-left text-ink-3 transition-colors duration-150 hover:text-ink aria-selected:border-ink aria-selected:text-ink"
              >
                {/* The focus ring hugs the label: around the whole tab it would run into its neighbours. */}
                <span className="block w-fit group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-ink">
                  <span className="block font-display text-[16px]">{d.name}</span>
                  <span className="mt-1 block font-sans text-[13px] tabular-nums">{d.label}</span>
                </span>
              </button>
            ))}
          </div>

          <div
            data-day-panels=""
            className="grid grid-cols-1 md:grid-cols-[repeat(var(--days),minmax(0,1fr))] gap-y-12"
          >
            {dates.days.map((d) => {
              const day = rows.filter((r) => r.day === d.key);
              return (
                <div
                  key={d.key}
                  role="tabpanel"
                  id={`day-panel-${d.key}`}
                  aria-labelledby={`day-tab-${d.key}`}
                  data-day-panel=""
                  className="md:pr-10 md:last:pr-0"
                >
                  <p
                    data-day-head=""
                    className="flex items-baseline justify-between border-b border-line pb-3"
                  >
                    <span className="font-display text-[16px] text-ink">{d.name}</span>
                    <span className="font-sans text-[13px] text-ink-3 tabular-nums">{d.label}</span>
                  </p>
                  {day.length === 0 && (
                    <p className="font-sans text-[17px] text-ink-3 py-4">Nothing is locked in yet.</p>
                  )}
                  <ol>
                    {day.map((r) => (
                      <li
                        key={r.when}
                        data-day-row=""
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
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
