import type { RouterInputs, RouterOutputs } from "@query/api";
import type { Tone } from "@/components/portal/ui";
import { toInputDate } from "@/components/admin/hackathons/constants";

export type Timing = RouterInputs["judging"]["schedule"]["preview"]["timing"];
export type ScheduleBoard = RouterOutputs["judging"]["schedule"]["get"];
export type SolvedPreview = Extract<
  RouterOutputs["judging"]["schedule"]["preview"],
  { ok: true }
>;
/** A CP-SAT schedule the server checked, from its own run or an upload. */
export type CpsatPreview = RouterOutputs["judging"]["schedule"]["previewCpsat"];
/** What the in-app preview and a CP-SAT result both show. */
export type PlanPreview = Omit<SolvedPreview, "proven">;
export type AppointmentStatus = ScheduleBoard["appointments"][number]["status"];

/** The timing form as typed: datetime-local strings and minute counts. */
export type TimingFields = {
  windowStart: string;
  windowEnd: string;
  setupMinutes: string;
  judgingMinutes: string;
  teardownMinutes: string;
  sameBuildingBreakMinutes: string;
  crossBuildingBreakMinutes: string;
};

// The judging_schedule column defaults. The window has none: it is the one
// thing an organiser must decide.
export const DEFAULT_FIELDS: TimingFields = {
  windowStart: "",
  windowEnd: "",
  setupMinutes: "2",
  judgingMinutes: "6",
  teardownMinutes: "2",
  sameBuildingBreakMinutes: "10",
  crossBuildingBreakMinutes: "20",
};

export function fieldsFromTiming(timing: Required<Timing>): TimingFields {
  return {
    windowStart: toInputDate(timing.windowStart),
    windowEnd: toInputDate(timing.windowEnd),
    setupMinutes: String(timing.setupMinutes),
    judgingMinutes: String(timing.judgingMinutes),
    teardownMinutes: String(timing.teardownMinutes),
    sameBuildingBreakMinutes: String(timing.sameBuildingBreakMinutes),
    crossBuildingBreakMinutes: String(timing.crossBuildingBreakMinutes),
  };
}

/** datetime-local values are read as local time, which is what the organiser typed. */
export function timingFromFields(fields: TimingFields): Required<Timing> {
  return {
    windowStart: new Date(fields.windowStart),
    windowEnd: new Date(fields.windowEnd),
    setupMinutes: Number(fields.setupMinutes),
    judgingMinutes: Number(fields.judgingMinutes),
    teardownMinutes: Number(fields.teardownMinutes),
    sameBuildingBreakMinutes: Number(fields.sameBuildingBreakMinutes),
    crossBuildingBreakMinutes: Number(fields.crossBuildingBreakMinutes),
  };
}

/**
 * What to call judging stations when `tables` of `stations` are tables: "room",
 * "table", or "room or table" for a mix (or when there are none to go by).
 * `many` gives the plural.
 */
export function stationWord(stations: number, tables: number, many = false) {
  const s = many ? "s" : "";
  if (stations > 0 && tables === 0) return `room${s}`;
  if (stations > 0 && tables === stations) return `table${s}`;
  return `room${s} or table${s}`;
}

export const sameTiming = (a: Timing, b: Timing) =>
  JSON.stringify(a) === JSON.stringify(b);

export const clock = (date: Date) =>
  date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const day = (date: Date) =>
  date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** A slot's time, with the weekday in front when the window runs past midnight. */
export function slotTime(date: Date, windowStart: Date) {
  return sameDay(date, windowStart)
    ? clock(date)
    : `${date.toLocaleDateString([], { weekday: "short" })} ${clock(date)}`;
}

export function windowLabel(start: Date, end: Date) {
  return sameDay(start, end)
    ? `${day(start)}, ${clock(start)} to ${clock(end)}`
    : `${day(start)}, ${clock(start)} to ${day(end)}, ${clock(end)}`;
}

type StatusStyle = { label: string; tone: Tone };

export const STATUS: Record<AppointmentStatus, StatusStyle> = {
  complete: { label: "Complete", tone: "success" },
  incomplete: { label: "Incomplete", tone: "warning" },
  missed: { label: "Missed", tone: "danger" },
  pending: { label: "On now", tone: "accent" },
  future: { label: "Upcoming", tone: "neutral" },
};

/** Where the judge assigned to a started presentation has got, beside their name. */
export const JUDGE_PROGRESS: Record<
  NonNullable<ScheduleBoard["appointments"][number]["judgeProgress"]>,
  StatusStyle
> = {
  grading: { label: "Grading", tone: "accent" },
  graded: { label: "Graded", tone: "success" },
  taken_over: { label: "Taken over", tone: "neutral" },
  not_started: { label: "Assigned judge has not started", tone: "warning" },
};

export const STATUS_ORDER: AppointmentStatus[] = [
  "pending",
  "missed",
  "incomplete",
  "complete",
  "future",
];
