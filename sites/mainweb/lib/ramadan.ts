import { DAY, HOUR, VENUE_TZ } from "@query/core";

type DateLike = Date | string | number;

// Built on first use, not on import, for the same reason as lib/venue-time.ts:
// the first Intl.DateTimeFormat with a time zone is slow to construct.
let islamicMonth: Intl.DateTimeFormat | undefined;

// Umm al-Qura, the Saudi calendar that ICU ships in every browser and in Node.
// Month 9 is Ramadan. The day is the venue's, so an event is never judged on
// the runtime's own zone.
function inRamadan(ms: number): boolean {
  islamicMonth ??= new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    month: "numeric",
    timeZone: VENUE_TZ,
  });
  return (
    islamicMonth.formatToParts(ms).find((part) => part.type === "month")
      ?.value === "9"
  );
}

/** Whether any day from `start` to `end` falls in Ramadan. */
export function overlapsRamadan(start: DateLike, end: DateLike): boolean {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  // An Islamic year is about 354 days, so a span this long holds a Ramadan.
  if (to - from >= 355 * DAY) return true;
  // A venue day is never shorter than 23 hours, so a probe every 12 hours
  // lands in each day between the two ends.
  for (let t = from; t < to; t += 12 * HOUR) {
    if (inRamadan(t)) return true;
  }
  return inRamadan(to);
}
