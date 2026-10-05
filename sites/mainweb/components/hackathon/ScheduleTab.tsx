"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import { QRCodeSVG } from "qrcode.react";
import { Lock } from "lucide-react";
import {
  body,
  btnSecondary,
  itemTitle,
  label,
  meta,
  object,
  sectionTitle,
} from "@/components/portal/ui";
import { StatusBadge } from "@/components/hackathon/StatusBadge";

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

/** Day heading plus "2:00 PM – 4:00 PM"; the end repeats the day only when
 *  it falls on a different one (overnight hacking blocks). */
function formatEventTime(start: Date | string, end: Date | string) {
  const s = new Date(start);
  const e = new Date(end);
  const startDay = dayFmt.format(s);
  const endDay = dayFmt.format(e);
  const endText =
    endDay === startDay
      ? timeFmt.format(e)
      : `${endDay} · ${timeFmt.format(e)}`;
  return { day: startDay, range: `${timeFmt.format(s)} – ${endText}` };
}

export function ScheduleTab({
  hackathonId,
  isRegistered,
}: {
  hackathonId: string;
  isRegistered: boolean;
}) {
  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsError,
    error,
    refetch,
  } = trpc.hackathon.getEvents.useQuery({ hackathonId });
  const { data: myRecord } = trpc.hackathon.myParticipantRecord.useQuery(
    { hackathonId },
    { enabled: isRegistered },
  );

  if (eventsLoading)
    return <p className={`py-16 ${body}`}>Loading schedule…</p>;

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
      ? "Waitlisted. You'll get a pass if a spot opens."
      : myRecord?.registrationStatus === "rejected"
        ? "Registration not accepted"
        : "Waiting on review. Your pass appears once you're accepted.";

  // Rows grouped under the venue-clock day they start on. The query returns
  // them in start order, so a day change means a new group.
  type Event = NonNullable<typeof events>[number];
  const days: { day: string; rows: { range: string; event: Event }[] }[] = [];
  for (const event of events ?? []) {
    const { day, range } = formatEventTime(event.startTime, event.endTime);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push({ range, event });
    else days.push({ day, rows: [{ range, event }] });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-12">
      <div className="lg:col-span-1 space-y-8">
        <section className={`${object} p-6`}>
          <h3 className={itemTitle}>Your check-in pass</h3>
          <p className={`mt-1 ${meta}`}>
            Show this at check-in, meals, and workshops.
          </p>

          {isRegistered && qrData ? (
            /* literal white: must match the QR bgColor below in both themes */
            <div className="mt-5 w-fit p-4 bg-[#ffffff] rounded-[var(--radius-sm)]">
              <QRCodeSVG
                value={qrData}
                size={180}
                level="H"
                fgColor="#000000"
                bgColor="#ffffff"
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
        </section>

        {isRegistered && myRecord && (
          <section>
            <h4 className={label}>Registration</h4>
            <dl className="mt-2 text-[15px]">
              <div className="flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] py-2.5">
                <dt className="text-[var(--text-muted)]">Status</dt>
                <dd>
                  <StatusBadge status={myRecord.registrationStatus} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-y border-[var(--border-subtle)] py-2.5">
                <dt className="text-[var(--text-muted)]">Shirt size</dt>
                <dd className="text-[var(--text-primary)]">
                  {myRecord.shirtSize || "Not set"}
                </dd>
              </div>
            </dl>
          </section>
        )}
      </div>

      <section className="lg:col-span-2">
        <div className="flex items-baseline justify-between gap-4 pb-3">
          <h3 className={sectionTitle}>Schedule</h3>
          <span className={meta}>{events?.length || 0} events</span>
        </div>

        {eventsError ? (
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
                  {rows.map(({ range, event }) => (
                    <li
                      key={event.id}
                      className="grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,11rem)] gap-x-4 gap-y-0.5 border-b border-[var(--border-subtle)] py-2.5 text-[15px]"
                    >
                      <span className="text-[13px] leading-6 tabular-nums text-[var(--text-secondary)]">
                        {range}
                      </span>
                      <div className="min-w-0">
                        <p className="leading-6 text-[var(--text-primary)]">
                          <span className="font-semibold">{event.name}</span>
                          <span className={`ml-2 ${meta}`}>
                            {event.type.replace(/_/g, " ")}
                          </span>
                        </p>
                        {event.description && (
                          <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
                            {event.description}
                          </p>
                        )}
                      </div>
                      <span className="col-start-2 sm:col-start-auto text-[13px] leading-6 text-[var(--text-muted)]">
                        {event.location}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
