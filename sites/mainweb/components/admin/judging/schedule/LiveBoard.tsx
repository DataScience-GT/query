"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnDanger,
  btnSecondary,
  chip,
  input,
  itemTitle,
  meta,
  sectionRule,
  sectionTitle,
  status,
} from "@/components/portal/ui";
import { ErrorLine, plural } from "@/components/admin/judging/shared";
import {
  clock,
  fieldsFromTiming,
  STATUS,
  STATUS_ORDER,
  windowLabel,
} from "./format";
import type { AppointmentStatus, ScheduleBoard, TimingFields } from "./format";
import { RoomBoard } from "./RoomBoard";
import type { BoardRoom } from "./RoomBoard";
import { ChoiceDialog } from "./ChoiceDialog";
import type { ChoiceTarget } from "./ChoiceDialog";

type Saved = ScheduleBoard & {
  schedule: NonNullable<ScheduleBoard["schedule"]>;
};

const quietButton =
  "text-[13px] font-semibold text-[var(--text-primary)] underline decoration-[var(--border-hover)] underline-offset-4 hover:decoration-[var(--text-primary)] disabled:opacity-50 disabled:no-underline";

/**
 * The saved schedule while judging runs: every room's appointments with
 * their status, presentations still without one, moving and dropping.
 */
export function LiveBoard({
  hackathonId,
  board,
  updatedAt,
  refreshError,
  onDropped,
}: {
  hackathonId: string;
  board: Saved;
  updatedAt: number;
  refreshError: string | null;
  onDropped: (timing: TimingFields) => void;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const { schedule } = board;
  const [filter, setFilter] = useState<AppointmentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<ChoiceTarget | null>(null);
  const [confirmingDrop, setConfirmingDrop] = useState(false);

  const drop = trpc.judging.schedule.drop.useMutation({
    onSuccess: async () => {
      onDropped(fieldsFromTiming(schedule));
      void utils.judging.admin.invalidate();
      await utils.judging.schedule.get.invalidate({ hackathonId });
    },
    onError: () => setConfirmingDrop(false),
  });

  const counts = new Map<AppointmentStatus, number>();
  for (const a of board.appointments) {
    counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
  }
  const missed = counts.get("missed") ?? 0;

  const needle = search.trim().toLowerCase();
  const shown = board.appointments.filter(
    (a) =>
      (filter === "all" || a.status === filter) &&
      (!needle ||
        a.entryTitle.toLowerCase().includes(needle) ||
        a.challengeLabel.toLowerCase().includes(needle)),
  );

  // Rooms that take appointments, then any an appointment still sits in
  // after its room was archived or lost its building.
  const rooms: (BoardRoom & { staffed: boolean | null })[] = board.rooms
    .filter((r) => r.scheduled)
    .map((r) => ({
      id: r.id,
      name: r.name,
      buildingName: r.buildingName,
      challengeLabel: r.challengeLabel,
      staffed: r.staffed,
    }));
  const known = new Set(rooms.map((r) => r.id));
  for (const a of board.appointments) {
    if (known.has(a.roomId)) continue;
    known.add(a.roomId);
    rooms.push({
      id: a.roomId,
      name: a.roomName,
      buildingName: a.buildingName,
      challengeLabel: a.challengeLabel,
      staffed: board.rooms.find((r) => r.id === a.roomId)?.staffed ?? null,
    });
  }
  const staffedById = new Map(rooms.map((r) => [r.id, r.staffed]));

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className={sectionTitle}>Schedule</h2>
          <p className={`mt-2 ${body}`}>
            {windowLabel(schedule.windowStart, schedule.windowEnd)} ·{" "}
            {schedule.slotMinutes}-minute slots ({schedule.setupMinutes} setup,{" "}
            {schedule.judgingMinutes} judging, {schedule.teardownMinutes}{" "}
            teardown)
          </p>
          <p className={`mt-1 ${meta}`}>
            Breaks: {schedule.sameBuildingBreakMinutes} min in one building,{" "}
            {schedule.crossBuildingBreakMinutes} min between buildings
            {schedule.reducedBreaksAcknowledgedAt
              ? `, shortened to ${schedule.sameBuildingBreakMinutes} for some teams when it was saved`
              : ""}
            . Updated {clock(new Date(updatedAt))}.
          </p>
        </div>

        <div className="shrink-0 sm:max-w-xs">
          {!schedule.canDrop ? (
            <p className={meta}>
              Judges have submitted results against this schedule, so it can no
              longer be dropped. Move appointments one at a time instead.
            </p>
          ) : confirmingDrop ? (
            <div className="space-y-3">
              <p className={meta}>
                Deletes all {plural(board.appointments.length, "appointment")}.
                Judges and teams lose their times until a new schedule is saved.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => drop.mutate({ hackathonId })}
                  disabled={readOnly || drop.isPending}
                  title={readOnly ? READ_ONLY_TITLE : undefined}
                  className={btnDanger}
                >
                  {drop.isPending ? "Dropping…" : "Drop schedule"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDrop(false)}
                  disabled={drop.isPending}
                  className={btnSecondary}
                >
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                drop.reset();
                setConfirmingDrop(true);
              }}
              disabled={readOnly}
              title={readOnly ? READ_ONLY_TITLE : undefined}
              className={btnDanger}
            >
              Drop schedule
            </button>
          )}
        </div>
      </section>

      {drop.error && (
        <ErrorLine>
          {trpcErrorMessage(drop.error, "Could not drop the schedule.")}
        </ErrorLine>
      )}
      {refreshError && (
        <ErrorLine>
          The board stopped refreshing: {refreshError} It shows the state at{" "}
          {clock(new Date(updatedAt))} and retries every 10 seconds.
        </ErrorLine>
      )}

      {board.unscheduled.length > 0 && (
        <section className={`${sectionRule} space-y-4`}>
          <div>
            <h3 className={itemTitle}>
              {plural(
                board.unscheduled.length,
                "presentation has",
                "presentations have",
              )}{" "}
              no appointment
            </h3>
            <p className={`mt-1 ${meta}`}>
              Entered after the schedule was saved. Book each into an open slot
              in a staffed room.
            </p>
          </div>
          <ul className="max-w-3xl border-t border-[var(--border-subtle)]">
            {board.unscheduled.map((task) => (
              <li
                key={`${task.entryId}:${task.challengeId}`}
                className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
                    {task.entryTitle}
                  </p>
                  <p className={`${meta} truncate`}>{task.challengeLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTarget({ kind: "assign", ...task })}
                  className={`${btnSecondary} shrink-0`}
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${sectionRule} space-y-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label="Filter by status"
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              onClick={() => setFilter("all")}
              aria-pressed={filter === "all"}
              className={chip(filter === "all")}
            >
              All{" "}
              <span className="tabular-nums">{board.appointments.length}</span>
            </button>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
                className={chip(filter === s)}
              >
                {STATUS[s].label}{" "}
                <span className="tabular-nums">{counts.get(s) ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="relative lg:w-72">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a project or challenge"
              aria-label="Find a project or challenge"
              className={`${input} pl-9`}
            />
          </div>
        </div>

        {missed > 0 && filter !== "missed" && (
          <p className={meta}>
            {plural(missed, "presentation was", "presentations were")} missed.
            Move each to an open slot in a staffed room.{" "}
            <button
              type="button"
              onClick={() => setFilter("missed")}
              className={quietButton}
            >
              Show missed
            </button>
          </p>
        )}

        {board.appointments.length === 0 ? (
          <p className={body}>
            This schedule has no appointments. Drop it and preview again once
            projects are entered.
          </p>
        ) : shown.length === 0 ? (
          <p className={body}>
            No appointment matches. Clear the search or pick another status.
          </p>
        ) : (
          <>
            <h3 className="sr-only">Appointments by room</h3>
            <RoomBoard
              rooms={rooms}
              rows={shown.map((a) => ({ ...a, key: a.id }))}
              windowStart={schedule.windowStart}
              hideEmpty={filter !== "all" || !!needle}
              roomDetail={(room) => {
                const staffed = staffedById.get(room.id);
                if (staffed === null || staffed === undefined) {
                  return <p className={`mt-1 ${meta}`}>Archived room</p>;
                }
                return (
                  <p
                    className={`mt-1 ${status(staffed ? "success" : "neutral")}`}
                  >
                    {staffed ? "Judge in room" : "No judge seen in 15 min"}
                  </p>
                );
              }}
              rowDetail={(a) => (
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className={status(STATUS[a.status].tone)}>
                    {STATUS[a.status].label}
                  </span>
                  {a.evaluationCount > 0 && (
                    <span className={meta}>
                      {plural(a.evaluationCount, "evaluation")}
                    </span>
                  )}
                  {a.removed && <span className={meta}>No longer entered</span>}
                  {a.canMove && (
                    <button
                      type="button"
                      onClick={() =>
                        setTarget({ kind: "move", appointmentId: a.id })
                      }
                      className={`${quietButton} py-1`}
                    >
                      Move
                    </button>
                  )}
                </div>
              )}
            />
          </>
        )}
      </section>

      {target && (
        <ChoiceDialog
          key={
            target.kind === "move"
              ? target.appointmentId
              : `${target.entryId}:${target.challengeId}`
          }
          hackathonId={hackathonId}
          target={target}
          windowStart={schedule.windowStart}
          sameBuildingBreakMinutes={schedule.sameBuildingBreakMinutes}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
