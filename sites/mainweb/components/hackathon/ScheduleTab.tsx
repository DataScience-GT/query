"use client";

import React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { QRCodeSVG } from "qrcode.react";
import { Lock } from "lucide-react";
import {
  body,
  btnSecondary,
  itemTitle,
  meta,
  object,
  sectionTitle,
  textLink,
} from "@/components/portal/ui";
import {
  pointsLabel,
  venueDayTime,
} from "@/components/hackathon/points/format";

// The event runs in Atlanta; pinning the zone keeps every viewer, and the
// server render, on the venue's clock rather than the browser's.
const EVENT_TZ = "America/New_York";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  hour: "numeric",
  minute: "2-digit",
});

// Types whose name does not already say what they are.
const TAGGED = new Set(["workshop", "sponsor_session"]);

/** Day heading plus a start and an end time ("2:00 PM", "4:00 PM"); the end
 *  carries its weekday only when it falls on a different day (overnight
 *  hacking blocks: "Sun 9:00 AM"). */
function formatEventTime(start: Date | string, end: Date | string) {
  const s = new Date(start);
  const e = new Date(end);
  const startDay = dayFmt.format(s);
  const endDay = dayFmt.format(e);
  return {
    day: startDay,
    start: timeFmt.format(s),
    end: endDay === startDay ? timeFmt.format(e) : venueDayTime(e),
  };
}

// The clock to the minute. React reads the snapshot more than once per render
// and needs the same answer each time, so it is not Date.now() itself.
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
function subscribeMinute(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

// Day granularity, on the viewer's clock: the last day counts all day.
const startOfDay = (d: Date | string) => new Date(d).setHours(0, 0, 0, 0);

export function ScheduleTab({
  hackathonId,
  isRegistered,
  startDate,
  endDate,
  pointsTabShown,
}: {
  hackathonId: string;
  isRegistered: boolean;
  startDate: Date | string;
  endDate: Date | string;
  pointsTabShown: boolean;
}) {
  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsError,
    error,
    refetch,
  } = trpc.hackathon.getEvents.useQuery({ hackathonId });
  const { data: myRecord, isLoading: recordLoading } =
    trpc.hackathon.myParticipantRecord.useQuery(
      { hackathonId },
      {
        enabled: isRegistered,
        // An accepted hacker is waiting on the door scan. While the event
        // runs, re-read so the pass flips to checked in without a reload.
        refetchInterval: (query) => {
          const today = startOfDay(new Date());
          return query.state.data?.registrationStatus === "approved" &&
            startOfDay(startDate) <= today &&
            today <= startOfDay(endDate)
            ? 30_000
            : false;
        },
      },
    );

  // Null on the server and while hydrating, so the first client render agrees
  // with the server's; past and live rows only show once the clock is known.
  const now = React.useSyncExternalStore<number | null>(
    subscribeMinute,
    currentMinute,
    () => null,
  );

  // Only accepted participants get a pass. Pending and waitlisted registrations
  // are not admitted yet, so the scanner would reject their code anyway.
  const isAccepted =
    myRecord?.registrationStatus === "approved" ||
    myRecord?.registrationStatus === "checked_in";

  const qrData =
    myRecord && isAccepted
      ? JSON.stringify({
          type: "CHECK_IN",
          hackathonId,
          participantId: myRecord.id,
        })
      : null;

  const passPlaceholder = !isRegistered
    ? "Register to get a pass"
    : myRecord?.registrationStatus === "waitlisted"
      ? "Waitlisted. Organisers may offer you a spot if one opens."
      : myRecord?.registrationStatus === "rejected"
        ? "Registration not accepted"
        : "Waiting on review. Your pass appears once you're accepted.";

  // Rows grouped under the venue-clock day they start on. The query returns
  // them in start order, so a day change means a new group.
  type Event = NonNullable<typeof events>[number];
  const days: {
    day: string;
    rows: { start: string; end: string; event: Event }[];
  }[] = [];
  for (const event of events ?? []) {
    const { day, start, end } = formatEventTime(event.startTime, event.endTime);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push({ start, end, event });
    else days.push({ day, rows: [{ start, end, event }] });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-12">
      <div className="lg:col-span-1 space-y-8">
        <section className={`${object} p-6`}>
          <h3 className={itemTitle}>Your check-in pass</h3>
          <p className={`mt-1 ${meta}`}>
            {myRecord?.registrationStatus === "checked_in"
              ? "You're checked in. Show it at meals and workshops."
              : "Show this at check-in, meals, and workshops."}
          </p>

          {isRegistered && recordLoading ? (
            // Same box as the QR, so the pass does not flash "Waiting on
            // review" before the record arrives.
            <div
              aria-hidden="true"
              className="mx-auto mt-5 aspect-square w-full max-w-[272px] rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] animate-pulse"
            />
          ) : isRegistered && qrData ? (
            /* literal white: must match the QR bgColor below in both themes */
            <div className="mx-auto mt-5 w-full max-w-[272px] p-4 bg-[#ffffff] rounded-[var(--radius-sm)]">
              <QRCodeSVG
                value={qrData}
                size={240}
                level="M"
                fgColor="#000000"
                bgColor="#ffffff"
                className="block h-auto w-full"
              />
            </div>
          ) : (
            <p className={`mt-5 flex items-start gap-2 ${body}`}>
              <Lock
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="mt-1 shrink-0 text-[var(--text-subtle)]"
              />
              {passPlaceholder}
            </p>
          )}

          {isRegistered && qrData && (
            <p className={`mt-5 ${meta}`}>
              It never changes, so a screenshot works.
              {/* The tab is hidden until the event runs; a link before then
                  would land on the overview. */}
              {pointsTabShown && (
                <>
                  {" "}
                  Codes shown at events go in the{" "}
                  <Link href="?tab=POINTS" className={textLink}>
                    Points tab
                  </Link>
                  .
                </>
              )}
            </p>
          )}

          {isRegistered && myRecord && (
            <p className={`mt-3 ${meta}`}>
              Shirt size {myRecord.shirtSize || "not set"}
            </p>
          )}
        </section>
      </div>

      <section className="lg:col-span-2">
        <div className="flex items-baseline justify-between gap-4 pb-3">
          <h3 className={sectionTitle}>Schedule</h3>
          {!eventsLoading && (
            <span className={meta}>{events?.length || 0} events</span>
          )}
        </div>

        {eventsLoading ? (
          <p className={`border-t border-[var(--border-subtle)] pt-5 ${body}`}>
            Loading schedule…
          </p>
        ) : eventsError ? (
          <div className="flex flex-col items-start gap-4 border-t border-[var(--border-subtle)] pt-5">
            <p className="text-[15px] text-[var(--danger)]">
              Couldn&apos;t load the schedule. {error.message}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className={btnSecondary}
            >
              Try again
            </button>
          </div>
        ) : !events || events.length === 0 ? (
          <p className={`border-t border-[var(--border-subtle)] pt-5 ${body}`}>
            The schedule hasn&apos;t been posted yet. Events will be listed here
            by day once organisers publish them.
          </p>
        ) : (
          <div className="space-y-8">
            {days.map(({ day, rows }) => (
              <div key={day}>
                <h4 className="border-b-2 border-[var(--text-primary)] pb-1.5 text-[15px] font-semibold text-[var(--text-primary)]">
                  {day}
                </h4>
                <ul>
                  {rows.map(({ start, end, event }) => {
                    const past =
                      now !== null && new Date(event.endTime).getTime() <= now;
                    const live =
                      now !== null &&
                      !past &&
                      new Date(event.startTime).getTime() <= now;
                    return (
                      <li
                        key={event.id}
                        aria-current={live ? "time" : undefined}
                        className="grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,11rem)] gap-x-4 gap-y-0.5 border-b border-[var(--border-subtle)] py-2.5 text-[15px]"
                      >
                        <span className="row-span-2 text-[13px] leading-6">
                          {live ? (
                            <>
                              <span className="block font-semibold text-accent">
                                Now
                              </span>
                              <span className="sr-only">{start}</span>
                            </>
                          ) : (
                            <span
                              className={`block ${past ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}`}
                            >
                              {start}
                            </span>
                          )}
                          <span className="sr-only"> to </span>
                          <span className="block text-[var(--text-muted)]">
                            {end}
                          </span>
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`leading-6 font-semibold ${past ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}
                          >
                            {event.name}
                          </p>
                          {event.description && (
                            <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
                              {event.description}
                            </p>
                          )}
                        </div>
                        <span className="col-start-2 sm:col-start-auto text-[13px] leading-6 text-[var(--text-muted)]">
                          {event.location}
                          {TAGGED.has(event.type) &&
                            ` · ${event.type.replace(/_/g, " ")}`}
                          {event.points > 0 && (
                            <>
                              {" · "}
                              <span className="whitespace-nowrap">
                                {pointsLabel(event.points)}
                              </span>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
