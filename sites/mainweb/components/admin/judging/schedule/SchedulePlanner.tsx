"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { trpcErrorMessage } from "@/lib/trpc-error";
import { READ_ONLY_TITLE, useReadOnly } from "@/lib/use-portal-context";
import {
  body,
  btnPrimary,
  btnSecondary,
  fieldHint,
  fieldLabel,
  input,
  itemTitle,
  label,
  meta,
  sectionRule,
  sectionTitle,
} from "@/components/portal/ui";
import { ErrorLine, plural } from "@/components/admin/judging/shared";
import { clock, sameTiming, timingFromFields, windowLabel } from "./format";
import type {
  PlanPreview,
  ScheduleBoard,
  Timing,
  TimingFields,
} from "./format";
import { CpsatPanel } from "./CpsatPanel";
import { RoomBoard } from "./RoomBoard";
import type { BoardRoom } from "./RoomBoard";

const minuteFields = {
  setupMinutes: { label: "Setup", min: 0, max: 120 },
  judgingMinutes: { label: "Judging", min: 1, max: 240 },
  teardownMinutes: { label: "Teardown", min: 0, max: 120 },
  sameBuildingBreakMinutes: { label: "Same building", min: 0, max: 720 },
  crossBuildingBreakMinutes: { label: "Changing buildings", min: 0, max: 720 },
} as const;

type MinuteField = keyof typeof minuteFields;

/**
 * Before a schedule exists: the timing form, what the solver makes of it,
 * and saving that exact preview or one CP-SAT found instead.
 */
export function SchedulePlanner({
  hackathonId,
  rooms,
  initial,
}: {
  hackathonId: string;
  rooms: ScheduleBoard["rooms"];
  initial: TimingFields;
}) {
  const utils = trpc.useUtils();
  const readOnly = useReadOnly();
  const [fields, setFields] = useState(initial);
  const [submitted, setSubmitted] = useState<Required<Timing> | null>(null);
  // The candidate the organiser said yes to, so a new preview needs a new yes.
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);

  // Each call runs the solver for up to a few seconds, so it runs when the
  // organiser presses Preview and not on focus, reconnect or remount.
  const preview = trpc.judging.schedule.preview.useQuery(
    submitted ? { hackathonId, timing: submitted } : skipToken,
    {
      retry: false,
      staleTime: 0,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  const save = trpc.judging.schedule.save.useMutation({
    onSuccess: async () => {
      void utils.judging.admin.invalidate();
      await utils.judging.schedule.get.invalidate({ hackathonId });
    },
    onError: (error) => {
      // Another organiser saved one first; the board replaces this form.
      if (error.data?.code === "CONFLICT") {
        void utils.judging.schedule.get.invalidate({ hackathonId });
      }
    },
  });

  const set = (name: keyof TimingFields, value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.reset();
    const timing = timingFromFields(fields);
    if (submitted && sameTiming(timing, submitted)) void preview.refetch();
    else setSubmitted(timing);
  }

  const slot =
    Number(fields.setupMinutes) +
    Number(fields.judgingMinutes) +
    Number(fields.teardownMinutes);
  const result = preview.isFetching ? undefined : preview.data;
  const stale = !!submitted && !sameTiming(timingFromFields(fields), submitted);
  const acknowledged =
    !!result?.candidateKey && acknowledgedKey === result.candidateKey;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const minuteInput = (name: MinuteField) => (
    <div key={name}>
      <label htmlFor={`schedule-${name}`} className={fieldLabel}>
        {minuteFields[name].label}
      </label>
      <input
        id={`schedule-${name}`}
        type="number"
        inputMode="numeric"
        required
        min={minuteFields[name].min}
        max={minuteFields[name].max}
        step={1}
        value={fields[name]}
        onChange={(e) => set(name, e.target.value)}
        className={`${input} tabular-nums`}
      />
    </div>
  );

  return (
    <div className="space-y-10">
      <section>
        <h2 className={sectionTitle}>Schedule</h2>
        <p className={`mt-2 max-w-2xl ${body}`}>
          Set the judging window and the length of one presentation, then
          preview. Sponsor challenges finish first, then everything finishes as
          early as it can, and each team gets a break between its presentations.
        </p>
      </section>

      <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="schedule-window-start" className={fieldLabel}>
                Window opens
              </label>
              <input
                id="schedule-window-start"
                type="datetime-local"
                step={60}
                required
                value={fields.windowStart}
                onChange={(e) => set("windowStart", e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label htmlFor="schedule-window-end" className={fieldLabel}>
                Window closes
              </label>
              <input
                id="schedule-window-end"
                type="datetime-local"
                step={60}
                required
                value={fields.windowEnd}
                onChange={(e) => set("windowEnd", e.target.value)}
                className={input}
              />
            </div>
          </div>
          <p className={fieldHint}>Times are in {timeZone}.</p>
        </div>

        <fieldset>
          <legend className={`${label} mb-3`}>
            One presentation, in minutes
          </legend>
          <div className="grid grid-cols-3 gap-4">
            {minuteInput("setupMinutes")}
            {minuteInput("judgingMinutes")}
            {minuteInput("teardownMinutes")}
          </div>
          {slot > 0 && (
            <p className={fieldHint}>
              Each room takes a project every {slot} minutes.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className={`${label} mb-3`}>
            Break between one team&apos;s presentations, in minutes
          </legend>
          <div className="grid grid-cols-2 gap-4">
            {minuteInput("sameBuildingBreakMinutes")}
            {minuteInput("crossBuildingBreakMinutes")}
          </div>
        </fieldset>

        {!rooms.some((r) => r.scheduled) && (
          <p className={`${meta} text-[var(--warning)]`}>
            No room takes appointments yet. Give each scheduled challenge a room
            in a building, then preview.
          </p>
        )}

        <button
          type="submit"
          disabled={preview.isFetching}
          className={result?.ok && !stale ? btnSecondary : btnPrimary}
        >
          {preview.isFetching ? "Solving…" : "Preview"}
        </button>
      </form>

      {submitted && (
        <section className={`${sectionRule} space-y-8`} aria-live="polite">
          {preview.isFetching ? (
            <p className={body} role="status">
              Solving the schedule. A large edition takes a few seconds.
            </p>
          ) : preview.error ? (
            <ErrorLine>
              {trpcErrorMessage(
                preview.error,
                "Could not preview this timing.",
              )}
            </ErrorLine>
          ) : !result ? null : !result.ok ? (
            <div className="space-y-4">
              <div>
                <h3 className={itemTitle}>No schedule fits this timing</h3>
                <p className={`mt-1 ${meta}`}>
                  {plural(result.presentations, "presentation")} from{" "}
                  {plural(result.projects, "project")} across{" "}
                  {plural(result.rooms, "room")}, {plural(result.slots, "slot")}{" "}
                  each.
                </p>
              </div>
              <ul className="max-w-3xl border-t border-[var(--border-subtle)]">
                {result.diagnostics.map((sentence) => (
                  <li
                    key={sentence}
                    className={`border-b border-[var(--border-subtle)] py-3 ${body}`}
                  >
                    {sentence}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <PreviewFigures result={result} timing={submitted} />

              {result.relaxed && (
                <ReducedBreaks
                  result={result}
                  timing={submitted}
                  acknowledged={acknowledged}
                  onAcknowledge={(yes) =>
                    setAcknowledgedKey(yes ? result.candidateKey : null)
                  }
                />
              )}

              <div className="space-y-3">
                {stale && (
                  <p className={`${meta} text-[var(--warning)]`}>
                    The timing changed since this preview. Preview again before
                    saving.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      save.mutate({
                        hackathonId,
                        timing: submitted,
                        candidateKey: result.candidateKey,
                        acknowledgeReducedBreaks: acknowledged,
                      })
                    }
                    disabled={
                      readOnly ||
                      save.isPending ||
                      stale ||
                      (result.relaxed && !acknowledged)
                    }
                    title={readOnly ? READ_ONLY_TITLE : undefined}
                    className={stale ? btnSecondary : btnPrimary}
                  >
                    {save.isPending ? "Saving…" : "Save schedule"}
                  </button>
                  <p className={meta}>
                    Books every appointment below. Until the first result is in
                    you can drop it and start over.
                  </p>
                </div>
                {save.error && (
                  <ErrorLine>
                    {trpcErrorMessage(
                      save.error,
                      "Could not save the schedule.",
                    )}
                  </ErrorLine>
                )}
              </div>

              <PreviewTimetable
                rooms={rooms}
                result={result}
                windowStart={submitted.windowStart}
              />
            </>
          )}
        </section>
      )}

      {/* Keyed by the timing so a new one starts CP-SAT over. A refetch of
          the same timing keeps its result: the server checks it again on
          save. */}
      {submitted && preview.data && (
        <CpsatPanel
          key={JSON.stringify(submitted)}
          hackathonId={hackathonId}
          rooms={rooms}
          timing={submitted}
          found={preview.data.ok}
          stale={stale}
        />
      )}
    </div>
  );
}

/** Headline numbers an organiser judges a preview by. */
export function PreviewFigures({
  result,
  timing,
}: {
  result: PlanPreview;
  timing: Required<Timing>;
}) {
  const { summary } = result;
  const spareMinutes = summary.allDoneAt
    ? Math.round(
        (timing.windowEnd.getTime() - summary.allDoneAt.getTime()) / 60_000,
      )
    : null;

  const figures = [
    {
      term: "Sponsor challenges done",
      value: summary.sponsorsDoneAt ? clock(summary.sponsorsDoneAt) : "None",
      note: !summary.sponsorsDoneAt
        ? "No sponsor challenge is scheduled"
        : summary.sponsorRoomIdleMinutes === 0
          ? "Their rooms run back to back"
          : `Their rooms sit idle ${summary.sponsorRoomIdleMinutes} min in all`,
    },
    {
      term: "Everything done",
      value: summary.allDoneAt ? clock(summary.allDoneAt) : "None",
      note:
        spareMinutes === null
          ? ""
          : spareMinutes === 0
            ? "Uses the whole window"
            : `${spareMinutes} min before the window closes`,
    },
    {
      term: "Building changes",
      value: String(summary.buildingChanges),
      note: "Times a team walks to another building",
    },
    {
      term: "Rooms",
      value: String(result.rooms),
      note: `${plural(result.slots, "slot")} of ${result.slotMinutes} min each`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className={itemTitle}>
          {plural(result.presentations, "presentation")} from{" "}
          {plural(result.projects, "project")}
        </h3>
        <p className={`mt-1 ${meta}`}>
          {windowLabel(timing.windowStart, timing.windowEnd)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {figures.map((f) => (
          <div key={f.term} className="min-w-0">
            <dt className={label}>{f.term}</dt>
            <dd className="mt-1 font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
              {f.value}
            </dd>
            {f.note && <dd className={`mt-1.5 ${meta}`}>{f.note}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The building changes a relaxed schedule gives only the same-building
 * break, and the yes that saving it needs.
 */
export function ReducedBreaks({
  result,
  timing,
  acknowledged,
  onAcknowledge,
}: {
  result: PlanPreview;
  timing: Required<Timing>;
  acknowledged: boolean;
  onAcknowledge: (yes: boolean) => void;
}) {
  return (
    <div className="max-w-3xl space-y-3 border-l-2 border-[var(--warning)] pl-4">
      <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">
        No schedule in this window gives every team the full{" "}
        {timing.crossBuildingBreakMinutes} minutes to change buildings, so{" "}
        {plural(
          result.reducedBreaks.length,
          "building change gets",
          "building changes get",
        )}{" "}
        the {timing.sameBuildingBreakMinutes}-minute break instead.
      </p>
      <ul className={`space-y-1 ${meta}`}>
        {result.reducedBreaks.slice(0, 8).map((r, i) => (
          <li key={`${r.entryId}:${i}`} className="truncate">
            {r.entryTitle}: {r.fromRoomName} to {r.toRoomName}, {r.breakMinutes}{" "}
            min
          </li>
        ))}
        {result.reducedBreaks.length > 8 && (
          <li>and {result.reducedBreaks.length - 8} more</li>
        )}
      </ul>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledge(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Save with these shorter breaks
      </label>
    </div>
  );
}

/** A preview's appointments, room by room. */
export function PreviewTimetable({
  rooms,
  result,
  windowStart,
}: {
  rooms: ScheduleBoard["rooms"];
  result: PlanPreview;
  windowStart: Date;
}) {
  return (
    <div className="space-y-4">
      <h3 className={label}>Timetable by room</h3>
      <RoomBoard
        rooms={previewRooms(rooms, result)}
        rows={result.appointments.map((a) => ({
          ...a,
          key: `${a.entryId}:${a.challengeId}`,
        }))}
        windowStart={windowStart}
        hideEmpty
      />
    </div>
  );
}

/** Scheduled rooms in console order, then any the preview used that the room list lacks. */
function previewRooms(
  rooms: ScheduleBoard["rooms"],
  result: PlanPreview,
): BoardRoom[] {
  const ordered: BoardRoom[] = rooms
    .filter((r) => r.scheduled)
    .map((r) => ({
      id: r.id,
      name: r.name,
      buildingName: r.buildingName,
      challengeLabel: r.challengeLabel,
    }));
  const known = new Set(ordered.map((r) => r.id));
  for (const a of result.appointments) {
    if (known.has(a.roomId)) continue;
    known.add(a.roomId);
    ordered.push({
      id: a.roomId,
      name: a.roomName,
      buildingName: a.buildingName,
      challengeLabel: a.challengeLabel,
    });
  }
  return ordered;
}
