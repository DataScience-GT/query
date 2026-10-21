"use client";

import { trpc } from "@/lib/trpc";
import { itemTitle, object, textLink } from "@/components/portal/ui";
import {
  clockTime,
  deskLabel,
  deskMeta,
  deskStatus,
  inOrAt,
  nextAssignment,
  roomPlace,
  startsIn,
} from "./desk";
import type { Assignment } from "./desk";
import { useServerNow } from "./use-server-now";

/** "1116 · Klaus": the room or table, then its building. */
function placeName(assignment: Assignment) {
  return roomPlace(assignment.roomName, assignment.buildingName);
}

/**
 * The presentations organisers assigned to this judge, soonest first: the one
 * to go to next, and the rest in brief. Nothing shows for a judge with none.
 */
export function Itinerary({
  hackathonId,
  onPickRoom,
}: {
  hackathonId: string;
  /** Members only: opens the room picker. */
  onPickRoom?: () => void;
}) {
  const itinerary = trpc.judging.desk.itinerary.useQuery(
    { hackathonId },
    { refetchInterval: 15_000 },
  );
  const now = useServerNow(itinerary.data?.serverNow, itinerary.dataUpdatedAt);

  const assignments = itinerary.data?.presentations ?? [];
  if (assignments.length === 0) return null;

  const next = nextAssignment(assignments);
  const rest = assignments.filter((a) => a !== next);
  const startsAt = next?.startsAt.getTime() ?? 0;

  return (
    <section
      aria-label="Presentations assigned to you"
      className={`mt-6 ${object} p-5`}
    >
      <h2 className={deskLabel}>Assigned to you</h2>

      {next ? (
        <div className="mt-2">
          <p className={`text-pretty ${itemTitle}`}>
            Your next project: {next.title} {inOrAt(next.roomKind)}{" "}
            {placeName(next)}, {clockTime(next.startsAt)}
          </p>
          <p className={`mt-1 ${deskMeta}`}>
            {next.challengeLabel}
            {now !== null &&
              (startsAt <= now
                ? " · Presenting now"
                : ` · Starts ${startsIn(startsAt - now)}`)}
          </p>
          {!next.inRoom && (
            <p className={`mt-2 ${deskMeta}`}>
              You are not seated there. Go to {placeName(next)} to judge it.{" "}
              {onPickRoom && (
                <button
                  type="button"
                  className={`${textLink} min-h-11`}
                  onClick={onPickRoom}
                >
                  Pick your room or table
                </button>
              )}
            </p>
          )}
        </div>
      ) : (
        <p className={`mt-2 ${deskMeta}`}>
          Nothing left to judge from what was assigned to you.
        </p>
      )}

      {rest.length > 0 && (
        <ul className="mt-4 border-t border-[var(--border-subtle)]">
          {rest.map((assignment) => (
            <li
              key={assignment.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[var(--border-subtle)] py-2.5"
            >
              <span className={`${deskMeta} tabular-nums`}>
                {clockTime(assignment.startsAt)}
              </span>
              <span className="min-w-0 break-words text-[15px] font-semibold text-[var(--text-primary)]">
                {assignment.title}
              </span>
              <span className={deskMeta}>{placeName(assignment)}</span>
              {assignment.graded ? (
                <span className={deskStatus("success")}>Graded</span>
              ) : assignment.takenOver ? (
                <span className={deskStatus("neutral")}>Being graded</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
