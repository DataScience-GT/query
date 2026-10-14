"use client";

import { Footprints, MapPin } from "lucide-react";
import type { RouterOutputs } from "@query/api";
import { body, itemTitle, label, meta, status } from "@/components/portal/ui";
import type { Tone } from "@/components/portal/ui";
import { useServerNow } from "@/components/judge/use-server-now";
import { eventClock, eventDay } from "./event-time";

export type ItineraryData = RouterOutputs["judging"]["hacker"]["itinerary"];
type Appointment = ItineraryData["appointments"][number];

/** "Klaus · 1116", or whichever half is known. */
function place(room: string | null, building: string | null) {
  return [building, room].filter(Boolean).join(" · ");
}

/**
 * "rooms", "tables" or "rooms and tables": whatever the drop-in list holds.
 * Null while none is posted.
 */
function dropInPlaces(challenges: ItineraryData["unscheduled"]) {
  const kinds = new Set(
    challenges.flatMap((challenge) => challenge.rooms.map((r) => r.kind)),
  );
  if (kinds.size === 0) return null;
  if (kinds.size === 1) return kinds.has("table") ? "tables" : "rooms";
  return "rooms and tables";
}

/**
 * What a row's dot says. The accent marks the one slot that matters right now:
 * the one running, or failing that the next one; later slots stay quiet.
 */
function rowStatus(
  appointment: Appointment,
  isCurrent: boolean,
): { text: string; tone: Tone } {
  if (isCurrent && appointment.status === "future") {
    return { text: "Next", tone: "accent" };
  }
  if (isCurrent && appointment.status === "incomplete") {
    return { text: "Now", tone: "accent" };
  }
  switch (appointment.status) {
    case "complete":
      return { text: "Judged", tone: "success" };
    case "incomplete":
      return { text: "Presented", tone: "neutral" };
    case "missed":
      return { text: "Missed", tone: "danger" };
    case "pending":
      return { text: "Now", tone: "accent" };
    default:
      return { text: "Upcoming", tone: "neutral" };
  }
}

/**
 * "Starts in 12 min" under the next slot once it is under an hour away. On the
 * server's clock, not the phone's, like every other time on this tab.
 */
function StartsIn({
  startsAt,
  serverNow,
  receivedAt,
}: {
  startsAt: Date;
  serverNow: Date;
  receivedAt: number;
}) {
  const now = useServerNow(serverNow, receivedAt);
  if (now === null) return null;
  const untilStart = startsAt.getTime() - now;
  if (untilStart <= 0 || untilStart >= 60 * 60_000) return null;
  return (
    <p className="mt-1.5 text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
      Starts in {Math.ceil(untilStart / 60_000)} min
    </p>
  );
}

export function MissedBanner() {
  return (
    <p
      role="alert"
      className="border-l-2 border-[var(--danger)] pl-3 text-[15px] text-[var(--text-primary)]"
    >
      Your project missed a judging appointment, marked below. Go to the help
      desk now so an organiser can move it to a later time.
    </p>
  );
}

/**
 * Where and when one project presents. Before organisers publish the schedule
 * it lists only the challenges the project is judged in. `receivedAt` is when
 * `data` arrived, so the countdown can follow the server's clock.
 */
export function Itinerary({
  data,
  receivedAt,
}: {
  data: ItineraryData;
  receivedAt: number;
}) {
  const now = data.serverNow.getTime();

  if (!data.published) {
    return (
      <div className="space-y-6">
        <p className={body}>
          Times and places are not out yet. They appear here when organisers
          publish the judging schedule; this tab checks every 30 seconds.
        </p>
        <ChallengeList challenges={data.challenges} />
      </div>
    );
  }

  if (data.challenges.length === 0) {
    return (
      <p className={body}>
        Your project has no in-person judging listed. If you entered a
        challenge, ask at the help desk.
      </p>
    );
  }

  const current =
    data.appointments.find(
      (a) => a.startsAt.getTime() <= now && now < a.endsAt.getTime(),
    ) ?? data.appointments.find((a) => a.status === "future");

  // Rows under the venue-clock day they start on, in time order.
  const days: { day: string; rows: Appointment[] }[] = [];
  for (const appointment of data.appointments) {
    const day = eventDay(appointment.startsAt);
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(appointment);
    else days.push({ day, rows: [appointment] });
  }

  // A scheduled challenge with no slot: a late import nobody has placed yet.
  const unplaced = data.challenges.filter(
    (challenge) =>
      challenge.mode === "scheduled" &&
      !data.appointments.some((a) => a.challengeId === challenge.id),
  );

  return (
    <div className="space-y-10">
      {days.length > 0 && (
        <div className="space-y-6">
          {days.map((group) => (
            <div key={group.day}>
              <h4 className={label}>{group.day}</h4>
              <ol className="mt-2 border-t border-[var(--border-subtle)]">
                {group.rows.map((appointment, index) => {
                  const shown = rowStatus(
                    appointment,
                    appointment.id === current?.id,
                  );
                  const where = place(appointment.room, appointment.building);
                  // A slot still to come in another building than the one
                  // before it means a walk in between.
                  const previous = group.rows[index - 1];
                  const walkTo =
                    previous?.building &&
                    appointment.building &&
                    previous.building !== appointment.building &&
                    appointment.status === "future"
                      ? appointment.building
                      : null;
                  // A finished slot steps back so the one that is next wins on
                  // contrast. A missed slot stays at full ink.
                  const past =
                    appointment.id !== current?.id &&
                    (appointment.status === "complete" ||
                      appointment.status === "incomplete");
                  const ink = past
                    ? "text-[var(--text-muted)]"
                    : "text-[var(--text-primary)]";
                  return (
                    <li
                      key={appointment.id}
                      className="grid grid-cols-[4.75rem_1fr] gap-x-4 border-b border-[var(--border-subtle)] py-4"
                    >
                      <div>
                        <time
                          dateTime={appointment.startsAt.toISOString()}
                          className={`block text-[15px] font-semibold ${ink}`}
                        >
                          {eventClock(appointment.startsAt)}
                        </time>
                        <time
                          dateTime={appointment.endsAt.toISOString()}
                          className={`block ${meta}`}
                        >
                          to {eventClock(appointment.endsAt)}
                        </time>
                      </div>
                      <div className="min-w-0">
                        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3">
                          <p
                            className={`text-[17px] font-semibold leading-snug text-pretty ${ink}`}
                          >
                            {appointment.challenge}
                          </p>
                          <span className={status(shown.tone)}>
                            {shown.text}
                          </span>
                        </div>
                        {appointment.children.length > 0 && (
                          <p className={`mt-0.5 ${meta}`}>
                            Also judged for {appointment.children.join(", ")}
                          </p>
                        )}
                        <p className="mt-1.5 flex items-start gap-1.5 text-[15px] text-[var(--text-secondary)]">
                          <MapPin
                            size={16}
                            strokeWidth={1.75}
                            aria-hidden="true"
                            className="mt-[3px] shrink-0 text-[var(--text-subtle)]"
                          />
                          {where ||
                            "Room or table not posted yet. Ask at the help desk."}
                        </p>
                        {walkTo && previous && (
                          <p className="mt-1 flex items-start gap-1.5 text-pretty text-[15px] text-[var(--text-secondary)]">
                            <Footprints
                              size={16}
                              strokeWidth={1.75}
                              aria-hidden="true"
                              className="mt-[3px] shrink-0 text-[var(--text-subtle)]"
                            />
                            Walk from {previous.building},{" "}
                            {Math.round(
                              (appointment.startsAt.getTime() -
                                previous.endsAt.getTime()) /
                                60_000,
                            )}{" "}
                            min between slots
                          </p>
                        )}
                        {shown.text === "Next" && (
                          <StartsIn
                            startsAt={appointment.startsAt}
                            serverNow={data.serverNow}
                            receivedAt={receivedAt}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}

      {unplaced.length > 0 && (
        <p className="border-l-2 border-[var(--warning)] pl-3 text-[15px] text-[var(--text-primary)]">
          No time yet for {unplaced.map((c) => c.label).join(", ")}. Ask at the
          help desk so an organiser can schedule it.
        </p>
      )}

      {data.unscheduled.length > 0 && (
        <section>
          <h4 className={itemTitle}>Drop-in challenges</h4>
          <p className={`mt-1 ${body}`}>
            No appointment for these.{" "}
            {dropInPlaces(data.unscheduled)
              ? `Take your project to one of the ${dropInPlaces(data.unscheduled)} listed while judging is open.`
              : "Where to take your project is posted here before judging opens."}
          </p>
          <ul className="mt-4 border-t border-[var(--border-subtle)]">
            {data.unscheduled.map((challenge) => (
              <li
                key={challenge.challengeId}
                className="border-b border-[var(--border-subtle)] py-4"
              >
                <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3">
                  <p className="text-[17px] font-semibold leading-snug text-pretty text-[var(--text-primary)]">
                    {challenge.challenge}
                  </p>
                  <span
                    className={status(challenge.judged ? "success" : "neutral")}
                  >
                    {challenge.judged ? "Judged" : "Not judged yet"}
                  </span>
                </div>
                {challenge.children.length > 0 && (
                  <p className={`mt-0.5 ${meta}`}>
                    Also judged for {challenge.children.join(", ")}
                  </p>
                )}
                {challenge.rooms.length > 0 ? (
                  <ul className="mt-1.5 space-y-1">
                    {challenge.rooms.map((room) => (
                      <li
                        key={place(room.name, room.building)}
                        className="flex items-start gap-1.5 text-[15px] text-[var(--text-secondary)]"
                      >
                        <MapPin
                          size={16}
                          strokeWidth={1.75}
                          aria-hidden="true"
                          className="mt-[3px] shrink-0 text-[var(--text-subtle)]"
                        />
                        {place(room.name, room.building)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`mt-1.5 ${meta}`}>
                    Room or table not posted yet. Ask at the help desk.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={meta}>Venue time. Updates every 30 seconds.</p>
    </div>
  );
}

function ChallengeList({
  challenges,
}: {
  challenges: ItineraryData["challenges"];
}) {
  if (challenges.length === 0) {
    return (
      <p className={meta}>
        No in-person challenges are listed for your project yet.
      </p>
    );
  }
  return (
    <div>
      <h4 className={label}>Judged in</h4>
      <ul className="mt-2 border-t border-[var(--border-subtle)]">
        {challenges.map((challenge) => (
          <li
            key={challenge.id}
            className="border-b border-[var(--border-subtle)] py-3"
          >
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">
              {challenge.label}
            </p>
            {challenge.children.length > 0 && (
              <p className={meta}>
                Also judged for {challenge.children.join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
