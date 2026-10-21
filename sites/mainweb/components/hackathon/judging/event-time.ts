// Judging happens in the building, so every time on these screens is the
// venue's clock, never the phone's: a hacker whose phone is still on west
// coast time has to be in the room at the venue's 2:10.
const EVENT_TZ = "America/New_York";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const clockFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TZ,
  hour: "numeric",
  minute: "2-digit",
});

/** "Sat, Feb 8" on the venue's calendar. */
export function eventDay(at: Date): string {
  return dayFormat.format(at);
}

/** "2:10 PM" on the venue's clock. */
export function eventClock(at: Date): string {
  return clockFormat.format(at);
}

/** "Sat, Feb 8, 2:10 PM". */
export function eventMoment(at: Date): string {
  return `${eventDay(at)}, ${eventClock(at)}`;
}
