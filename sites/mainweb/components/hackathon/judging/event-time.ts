import { VENUE_TZ } from "@query/db/constants";

// Judging happens in the building, so every time on these screens is the
// venue's clock, never the phone's: a hacker whose phone is still on west
// coast time has to be in the room at the venue's 2:10.
const EVENT_TZ = VENUE_TZ;

// Built on first use, not on import. The first Intl.DateTimeFormat with a time
// zone costs about 25 ms in a browser, and the portal navigation imports this
// module, so building these up front charged every portal page that cost,
// the login page included, whether or not it printed a time.
let dayFormat: Intl.DateTimeFormat | undefined;
let clockFormat: Intl.DateTimeFormat | undefined;

/** "Sat, Feb 8" on the venue's calendar. */
export function eventDay(at: Date): string {
  dayFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return dayFormat.format(at);
}

/** "2:10 PM" on the venue's clock. */
export function eventClock(at: Date): string {
  clockFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  return clockFormat.format(at);
}

/** "Sat, Feb 8, 2:10 PM". */
export function eventMoment(at: Date): string {
  return `${eventDay(at)}, ${eventClock(at)}`;
}
