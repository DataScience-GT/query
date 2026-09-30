// Shared with the site: pages that decide what "today" is have to agree with
// the API, and the server runs in UTC.

const easternDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const easternHour = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * The instant Atlanta's current day began. Found by trying both Eastern
 * offsets for today's date and keeping the one that reads 00:00 there, so it
 * holds on the 23- and 25-hour days around a DST change too (the switch is at
 * 2am, so midnight itself always exists exactly once).
 */
export function startOfEasternDay(now: Date): Date {
  const ymd = easternDate.format(now);
  const candidates = ["-04:00", "-05:00"].map(
    (offset) => new Date(`${ymd}T00:00:00${offset}`),
  );
  return (
    candidates.find(
      (candidate) =>
        easternDate.format(candidate) === ymd &&
        Number(easternHour.format(candidate)) === 0,
    ) ?? candidates[1]!
  );
}
