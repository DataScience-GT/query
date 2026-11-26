/**
 * Everything an edition's dates turn into: labels, day columns and schedule
 * rail positions, all computed from ISO timestamps in the event's time zone,
 * which the edition's config names. Nothing here is typed by hand per edition.
 */

const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parses an ISO 8601 timestamp that carries its own UTC offset. A bare local time would mean a different instant in each visitor's zone. */
export function parseInstant(label: string, iso: string): number {
  const ms = ISO_WITH_OFFSET.test(iso) ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(ms)) {
    throw new Error(
      `${label} must be an ISO 8601 timestamp with a UTC offset, such as YYYY-MM-DDTHH:MM:SS-05:00 or YYYY-MM-DDTHH:MM:SSZ (got "${iso}")`,
    );
  }
  return ms;
}

const wallClockFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });

/** Whether the runtime knows this IANA time zone name. */
export const isTimeZone = (timeZone: string) => {
  try {
    wallClockFormat(timeZone);
    return true;
  } catch {
    return false;
  }
};

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The calendar fields an instant shows on a clock in the event's time zone. */
function wallClock(timeZone: string, ms: number): WallClock {
  const fields: Record<string, number> = {};
  for (const { type, value } of wallClockFormat(timeZone).formatToParts(ms)) {
    fields[type] = Number(value);
  }
  return {
    year: fields.year,
    month: fields.month,
    day: fields.day,
    hour: fields.hour % 24,
    minute: fields.minute,
  };
}

/** A wall-clock reading as milliseconds, so two readings subtract into clock hours whatever the offset was at each. */
const wallMs = (c: WallClock) =>
  Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute);

export const yearInZone = (timeZone: string, ms: number) => wallClock(timeZone, ms).year;

const nameOf = (options: Intl.DateTimeFormatOptions, utcMs: number) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    utcMs,
  );

/** One calendar day of the event, such as Friday, February 26. */
export interface EventDay {
  /** Three-letter weekday, the prefix schedule rows start with. */
  key: string;
  name: string;
  /** Short month and day, like "Feb 26". */
  label: string;
}

export interface EventDates {
  /** "Feb 26–28, 2027" */
  short: string;
  /** "February 26–28, 2027" */
  long: string;
  /** "Feb 26" */
  startLabel: string;
  /** "Feb 28" */
  endLabel: string;
  days: readonly EventDay[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function describeDates(timeZone: string, startMs: number, endMs: number): EventDates {
  const start = wallClock(timeZone, startMs);
  const end = wallClock(timeZone, endMs);
  const first = Date.UTC(start.year, start.month - 1, start.day);
  const last = Date.UTC(end.year, end.month - 1, end.day);
  const count = (last - first) / DAY_MS + 1;

  const days: EventDay[] = Array.from({ length: count }, (_, i) => {
    const utc = first + i * DAY_MS;
    return {
      key: nameOf({ weekday: "short" }, utc),
      name: nameOf({ weekday: "long" }, utc),
      label: nameOf({ month: "short", day: "numeric" }, utc),
    };
  });

  const range = (month: "short" | "long") => {
    const m = (utc: number) => nameOf({ month }, utc);
    if (count === 1) return `${m(first)} ${start.day}, ${start.year}`;
    if (start.year !== end.year) {
      return `${m(first)} ${start.day}, ${start.year}–${m(last)} ${end.day}, ${end.year}`;
    }
    if (start.month !== end.month) {
      return `${m(first)} ${start.day}–${m(last)} ${end.day}, ${start.year}`;
    }
    return `${m(first)} ${start.day}–${end.day}, ${start.year}`;
  };

  return {
    short: range("short"),
    long: range("long"),
    startLabel: days[0].label,
    endLabel: days[days.length - 1].label,
    days,
  };
}

/**
 * The schedule rail is the event's days to scale, from midnight of the first
 * day. Positions are clock hours into that span, so they do not depend on
 * which offset each instant carries.
 */
export interface ScheduleRail {
  /** Hours the rail covers: 24 per event day. */
  span: number;
  /** Hours from the first midnight to the start of hacking. */
  from: number;
  /** Hours from the first midnight to the end of hacking. */
  to: number;
}

export function describeRail(
  timeZone: string,
  startMs: number,
  endMs: number,
  hackingStartMs: number,
  hackingEndMs: number,
): ScheduleRail {
  const start = wallClock(timeZone, startMs);
  const end = wallClock(timeZone, endMs);
  const midnight = Date.UTC(start.year, start.month - 1, start.day);
  const lastMidnight = Date.UTC(end.year, end.month - 1, end.day);
  return {
    span: ((lastMidnight - midnight) / DAY_MS + 1) * 24,
    from: (wallMs(wallClock(timeZone, hackingStartMs)) - midnight) / 36e5,
    to: (wallMs(wallClock(timeZone, hackingEndMs)) - midnight) / 36e5,
  };
}

/** One instant as the venue's clock and calendar show it. */
export interface Moment {
  /** Three-letter weekday: "Fri". */
  weekday: string;
  /** Short month and day: "Feb 26". */
  label: string;
  /** Full month and day: "February 26". */
  long: string;
  year: number;
  /** "9:00 PM" */
  time: string;
  /** The zone's short name where the venue is: "EST". */
  zone: string;
}

export function describeMoment(timeZone: string, ms: number): Moment {
  const { year, month, day } = wallClock(timeZone, ms);
  const utc = Date.UTC(year, month - 1, day);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...options, timeZone })
      .format(ms)
      // Newer ICU puts a narrow no-break space before AM and PM.
      .replace(/ /g, " ");
  const zone = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(ms)
    .find((p) => p.type === "timeZoneName")?.value;
  return {
    weekday: nameOf({ weekday: "short" }, utc),
    label: nameOf({ month: "short", day: "numeric" }, utc),
    long: nameOf({ month: "long", day: "numeric" }, utc),
    year,
    time: part({ hour: "numeric", minute: "2-digit" }),
    zone: zone ?? timeZone,
  };
}

/**
 * Calendar days from `nowMs` to `targetMs` on the venue's calendar: 0 on the
 * target's own day, 1 the day before, negative after it. Dates are compared,
 * not hours, so a day with a clock change in it still counts as one, and
 * 9 PM the evening before is a day left, not none.
 */
export function calendarDaysUntil(timeZone: string, targetMs: number, nowMs: number): number {
  const day = (ms: number) => {
    const c = wallClock(timeZone, ms);
    return Date.UTC(c.year, c.month - 1, c.day);
  };
  return Math.round((day(targetMs) - day(nowMs)) / DAY_MS);
}

/** Whether a deadline is still open, and if so how to say how long is left. */
export type DeadlineStatus =
  | { open: false }
  | {
      open: true;
      /** Calendar days left; 0 on the last day. */
      days: number;
      /** "56 days left", "1 day left", "last day". */
      left: string;
    };

/** Open until the instant `closesMs`, counting days on the venue's calendar. */
export function deadlineStatus(timeZone: string, closesMs: number, nowMs: number): DeadlineStatus {
  if (nowMs >= closesMs) return { open: false };
  const days = calendarDaysUntil(timeZone, closesMs, nowMs);
  const left = days === 0 ? "last day" : `${days} ${days === 1 ? "day" : "days"} left`;
  return { open: true, days, left };
}

/**
 * Which day of the schedule to open on: today's while the event is on, and
 * the first day otherwise. `keys` are the days' three-letter weekdays, in
 * order. Today is the venue's today, so a visitor in another zone sees the
 * day the hackers are in.
 */
export function defaultDayIndex(
  keys: readonly string[],
  timeZone: string,
  startMs: number,
  endMs: number,
  nowMs: number,
): number {
  if (nowMs < startMs || nowMs >= endMs) return 0;
  return Math.max(0, keys.indexOf(describeMoment(timeZone, nowMs).weekday));
}
