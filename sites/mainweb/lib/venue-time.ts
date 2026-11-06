// Portal pages render on the server and again in the browser. A date printed
// or compared in the runtime's own zone comes out differently in the two (Cloud
// Run is UTC), which is a hydration mismatch, and shows a remote hacker the
// wrong day. Events run in Atlanta, so every date the portal prints and every
// "is it today" test is on the venue's calendar, in one locale.
export const VENUE_TZ = "America/New_York";

// Built on first use, not on import: the first Intl.DateTimeFormat with a time
// zone costs about 25 ms in a browser, and the portal navigation imports this.
const formats = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options);
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { ...options, timeZone: VENUE_TZ });
    formats.set(key, format);
  }
  return format;
}

type DateLike = Date | string | number;

/**
 * The date in en-US on the venue's calendar. No options gives "11/6/2026",
 * what `toLocaleDateString()` prints for a visitor in the US.
 */
export function venueFormat(
  value: DateLike,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return formatter(options).format(new Date(value));
}

/** Year, month (1-12) and day of the month on the venue's calendar. */
export function venueParts(value: DateLike) {
  const found = { year: 0, month: 0, day: 0 };
  for (const part of formatter({
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(value))) {
    if (part.type === "year" || part.type === "month" || part.type === "day") {
      found[part.type] = Number(part.value);
    }
  }
  return found;
}

const DAY_MS = 86_400_000;

/**
 * Which calendar day it is at the venue, as a whole number that goes up by one
 * a day. Subtract to count days, compare to ask "is it the same day".
 */
export function venueDayNumber(value: DateLike): number {
  const { year, month, day } = venueParts(value);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}
