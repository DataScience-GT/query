/**
 * Wall-clock time in an IANA zone, in both directions, with no date library.
 * An edition's times are "5pm Friday in the event's zone", and the ISO string
 * for that depends on whether daylight saving is in force on that date.
 */

export interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const DAY_MS = 864e5;

export function parseDay(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const real =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return real ? { year, month, day } : null;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export const dayString = ({
  year,
  month,
  day,
}: {
  year: number;
  month: number;
  day: number;
}) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

export function addDays(
  day: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const moved = new Date(
    Date.UTC(day.year, day.month - 1, day.day) + days * DAY_MS,
  );
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

/** Whole days from `from` to `to`, both calendar days. */
export function daysBetween(
  from: { year: number; month: number; day: number },
  to: { year: number; month: number; day: number },
): number {
  return Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) -
      Date.UTC(from.year, from.month - 1, from.day)) /
      DAY_MS,
  );
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall clock in `timeZone` at the instant `ms`. */
export function wallAt(ms: number, timeZone: string): Wall {
  const parts: Record<string, number> = {};
  for (const part of zoneFormatter(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

const wallAsUtc = (wall: Wall) =>
  Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);

/** Minutes the zone is ahead of UTC at the instant `ms`. */
function offsetMinutes(ms: number, timeZone: string): number {
  return (wallAsUtc(wallAt(ms, timeZone)) - Math.floor(ms / 6e4) * 6e4) / 6e4;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * The ISO 8601 string, with the zone's offset on that date, for a wall-clock
 * time. Throws when the wall clock does not exist (the hour daylight saving
 * skips), since there is no honest string for it.
 */
export function isoAt(wall: Wall, timeZone: string): string {
  const guess = wallAsUtc(wall);
  let minutes = offsetMinutes(guess - 12 * 36e5, timeZone);
  let instant = guess - minutes * 6e4;
  const settled = offsetMinutes(instant, timeZone);
  if (settled !== minutes) {
    minutes = settled;
    instant = guess - minutes * 6e4;
  }
  const back = wallAt(instant, timeZone);
  if (wallAsUtc(back) !== guess) {
    throw new Error(
      `${dayString(wall)} ${pad(wall.hour)}:${pad(wall.minute)} does not exist in ${timeZone}`,
    );
  }
  return `${dayString(wall)}T${pad(wall.hour)}:${pad(wall.minute)}:00${formatOffset(minutes)}`;
}

export function clockOf(wall: Wall): string {
  return `${pad(wall.hour)}:${pad(wall.minute)}`;
}

export function withClock(
  day: { year: number; month: number; day: number },
  clock: string,
): Wall {
  const [hour, minute] = clock.split(":").map(Number);
  return { ...day, hour, minute };
}

/** "5:00 PM" for "17:00", the way the schedule board writes a time. */
export function boardTime(clock: string): string {
  const [hour, minute] = clock.split(":").map(Number);
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${pad(minute)} ${suffix}`;
}

/** An edition's four moments, as wall clocks plus where they sit among the days. */
export interface SchedulePattern {
  /** Wall-clock time check-in opens, on the start date. */
  start: string;
  /** Wall-clock time the weekend closes, on the end date. */
  end: string;
  /** Hacking begins `days` after the start date, at `clock`. */
  hackStart: { days: number; clock: string };
  /** Hacking ends `days` after the end date (zero or negative), at `clock`. */
  hackEnd: { days: number; clock: string };
}

export interface Moments {
  start: string;
  end: string;
  hacking: { start: string; end: string };
}

const wallOfIso = (iso: string, timeZone: string) =>
  wallAt(Date.parse(iso), timeZone);
const dayOf = (wall: Wall) => ({
  year: wall.year,
  month: wall.month,
  day: wall.day,
});

/** Reads the clock times and day offsets out of an existing edition. */
export function patternOf(moments: Moments, timeZone: string): SchedulePattern {
  const start = wallOfIso(moments.start, timeZone);
  const end = wallOfIso(moments.end, timeZone);
  const hackStart = wallOfIso(moments.hacking.start, timeZone);
  const hackEnd = wallOfIso(moments.hacking.end, timeZone);
  return {
    start: clockOf(start),
    end: clockOf(end),
    hackStart: {
      days: daysBetween(dayOf(start), dayOf(hackStart)),
      clock: clockOf(hackStart),
    },
    hackEnd: {
      days: daysBetween(dayOf(end), dayOf(hackEnd)),
      clock: clockOf(hackEnd),
    },
  };
}

/** Lays a pattern onto a new pair of dates. */
export function applyPattern(
  pattern: SchedulePattern,
  startDay: { year: number; month: number; day: number },
  endDay: { year: number; month: number; day: number },
  timeZone: string,
): Moments {
  const at = (day: typeof startDay, clock: string) =>
    isoAt(withClock(day, clock), timeZone);
  return {
    start: at(startDay, pattern.start),
    end: at(endDay, pattern.end),
    hacking: {
      start: at(
        addDays(startDay, pattern.hackStart.days),
        pattern.hackStart.clock,
      ),
      end: at(addDays(endDay, pattern.hackEnd.days), pattern.hackEnd.clock),
    },
  };
}

/** `iso` moved to the same month, day and clock in `year`, with that date's offset. */
export function sameMomentInYear(
  iso: string,
  year: number,
  timeZone: string,
): string {
  const wall = wallOfIso(iso, timeZone);
  let day = { year, month: wall.month, day: wall.day };
  if (!parseDay(dayString(day)))
    day = addDays({ year, month: wall.month + 1, day: 1 }, -1);
  return isoAt({ ...day, hour: wall.hour, minute: wall.minute }, timeZone);
}

export function yearOfIso(iso: string, timeZone: string): number {
  return wallOfIso(iso, timeZone).year;
}
